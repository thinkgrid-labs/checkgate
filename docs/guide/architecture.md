---
title: "Checkgate Architecture — Control Plane, Evaluation Core & SDK Design"
description: "Deep dive into Checkgate's three-layer architecture: the Axum-based control plane, the Rust evaluation core, and cross-platform SDK clients connected via SSE."
---

# Architecture

Checkgate has three main layers: the **control plane** (server), the **evaluation core** (Rust library), and the **SDK clients**.

## Overview

```
┌──────────────────────────────────────────────────────────────┐
│                      Checkgate Server                         │
│                                                              │
│  ┌──────────────────────┐   ┌──────────┐   ┌─────────────┐  │
│  │  REST API            │   │ In-Memory│   │ SSE Stream  │  │
│  │  /api/environments/  │──▶│ FlagStore│──▶│  /stream    │  │
│  │    {env_id}/flags    │   └──────────┘   └─────────────┘  │
│  └──────────────────────┘        ▲                          │
│         │                        │                          │
│         ▼                        │ (Redis subscriber        │
│  ┌──────────────┐   ┌──────────┐  │  applies updates)       │
│  │  PostgreSQL  │──▶│  Redis   │──┘                         │
│  │  (durable)   │   │ (pub/sub)│                            │
│  └──────────────┘   └──────────┘                            │
└──────────────────────────────────────────────────────────────┘
           SSE (push on change)
                   │
    ┌──────────────┼──────────────┐
    ▼              ▼              ▼
┌────────┐   ┌──────────┐   ┌─────────┐
│Node.js │   │ Browser  │   │ Flutter │
│  SDK   │   │   WASM   │   │   FFI   │
│(NAPI)  │   │   SDK    │   │   SDK   │
└────────┘   └──────────┘   └─────────┘
 isEnabled()  in-process, sub-microsecond
```

## Control Plane (Server)

The server is a single Rust binary built with **Axum**. It is responsible for:

- Storing flags and environments durably in **PostgreSQL**
- Maintaining an in-memory `FlagStore` for fast SSE bootstrap
- Exposing a **REST API** (environment-scoped) for CRUD operations
- Broadcasting flag changes to connected SDKs via **SSE** (`/stream`)
- Publishing change events to **Redis** pub/sub for multi-instance deployments
- Tracking flag evaluation events (**impressions**) from SDK clients

### Write Path

When a flag is created or updated:

1. The REST API handler writes the flag to **PostgreSQL**
2. It publishes an `UPSERT` event to the `checkgate_updates` **Redis** channel
3. The server's own Redis subscriber receives the event and updates the local in-memory `FlagStore`
4. All connected SSE clients receive the event via the broadcast channel and update their local cache

> The in-memory store is updated via the Redis subscriber loop, not directly by the write handler. This ensures the same code path runs for both local writes and cross-instance propagation.

### Multi-Instance Deployments

When running multiple Checkgate server instances behind a load balancer:

- Each instance subscribes to Redis pub/sub on startup
- A write to any instance propagates to all others via Redis
- All instances stay in sync without direct inter-node communication

## Evaluation Core (`checkgate-core`)

The core is a Rust library (`core/`) compiled into each SDK:

- **`FlagStore`** — thread-safe `DashMap` holding the in-memory flag cache
- **`evaluate(flag, user_context)`** — pure function, no I/O, no allocations on the hot path

### Evaluation Logic

```
isEnabled(flag_key, user_key, attributes)
    │
    ├── Flag not found → false
    ├── flag.is_enabled == false → false
    │
    ├── Targeting rules (first match wins)
    │   └── rule.attribute ∈ attributes AND operator matches → true
    │
    └── Rollout percentage
        ├── 0% → false
        ├── 100% → true
        └── MurmurHash3(flag_key + ":" + user_key) % 100 < percentage → true/false
```

Targeting rules bypass the rollout percentage. A user matching a targeting rule always gets `true`, even if the rollout is 0%.

### Hashing

Rollout uses **MurmurHash3** (x86/32-bit) for:
- **Speed** — non-cryptographic, very fast
- **Stability** — same user + flag always maps to the same bucket
- **Distribution** — uniform bucketing across the 0–99 range

## Environments

Flags are scoped to **environments** (e.g. Production, Staging, UAT, Development). Each environment has an isolated flag configuration. The REST API routes are all environment-scoped:

```
/api/environments/{env_id}/flags
/api/environments/{env_id}/flags/{key}
/api/environments/{env_id}/flags/{key}/promote
```

The **promote** operation copies a flag's configuration from one environment to another (e.g. Staging → Production) in a single atomic transaction.

Four default environments are created on first run: Production, Staging, UAT, and Development (default).

## Authentication

Checkgate uses two separate authentication mechanisms:

| Credential | Used by | How |
|------------|---------|-----|
| Email + password | Dashboard users (admin/viewer) | Issues an HttpOnly AES-256-GCM encrypted session cookie |
| SDK key (`sk_live_...`) | SDK clients, CI/CD | `Authorization: Bearer <key>` header or `?sdk_key=` query param |

SDK keys are stored in PostgreSQL and managed via the dashboard Settings page. A key is auto-generated on first boot. Multiple keys are supported simultaneously; any valid key grants access.

## Impression Tracking

SDKs can report evaluation events asynchronously to the server:

```
POST /api/environments/{env_id}/impressions
Authorization: Bearer <sdk_key>

[{"flag_key": "checkout_v2", "user_id": "u123", "value": "true", ...}]
```

Impressions are stored in the `impressions` table and surfaced in the dashboard's **Impressions** page with per-flag aggregates (total evaluations, true/false split, unique users).

## SDK Clients

Each SDK maintains its own local copy of the flag store:

| SDK | Binding | Binary |
|-----|---------|--------|
| Node.js | NAPI-RS | `.node` native addon |
| Browser | wasm-bindgen | `.wasm` + JS glue |
| React Native | C FFI via JSI | `.so` / `.dylib` |
| Flutter | `dart:ffi` | `.so` / `.dylib` |

### Connection Lifecycle

1. SDK connects to `GET /stream` with an SDK key in the `Authorization: Bearer` header
2. Server sends a `connected` SSE event — SDK clears its local store
3. Server bootstraps the SDK by replaying all current flags as `update` events
4. SDK updates its local `FlagStore` for each event
5. Server sends `keep-alive` pings every 15 seconds
6. On reconnect, the SDK clears its local store and re-bootstraps from scratch

This ensures the SDK always has a consistent snapshot even after network interruptions.

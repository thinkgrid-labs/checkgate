---
title: Checkgate Architecture — Control Plane, Evaluation Core & SDK Design
description: Deep dive into Checkgate's three-layer architecture: the Axum-based control plane, the Rust evaluation core, and cross-platform SDK clients connected via SSE.
---

# Architecture

Checkgate has three main layers: the **control plane** (server), the **evaluation core** (Rust library), and the **SDK clients**.

## Overview

```
┌─────────────────────────────────────────────────────────┐
│                    Checkgate Server                       │
│                                                          │
│  ┌──────────────┐   ┌──────────┐   ┌─────────────────┐  │
│  │  REST API    │   │ In-Memory│   │   SSE Stream    │  │
│  │  /api/flags  │──▶│ FlagStore│──▶│   /stream       │  │
│  └──────────────┘   └──────────┘   └─────────────────┘  │
│         │                │                              │
│         ▼                ▼                              │
│  ┌──────────────┐   ┌──────────┐                        │
│  │  PostgreSQL  │   │  Redis   │                        │
│  │  (durable)   │   │ (pub/sub)│                        │
│  └──────────────┘   └──────────┘                        │
└─────────────────────────────────────────────────────────┘
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

- Storing flags durably in **PostgreSQL**
- Maintaining an in-memory `FlagStore` for fast reads
- Exposing a **REST API** (`/api/flags`) for CRUD operations
- Broadcasting flag changes to connected SDKs via **SSE** (`/stream`)
- Publishing change events to **Redis** pub/sub for multi-instance deployments

### Write Path

When a flag is created or updated:

1. The REST API handler writes the flag to PostgreSQL
2. It immediately updates the local in-memory `FlagStore`
3. It publishes a `UPSERT` event to the `checkgate_updates` Redis channel
4. All connected SSE clients (SDK instances) receive the event and update their local cache

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

## SDK Clients

Each SDK maintains its own local copy of the flag store:

| SDK | Binding | Binary |
|-----|---------|--------|
| Node.js | NAPI-RS | `.node` native addon |
| Browser | wasm-bindgen | `.wasm` + JS glue |
| React Native | C FFI via JSI | `.so` / `.dylib` |
| Flutter | `dart:ffi` | `.so` / `.dylib` |

### Connection Lifecycle

1. SDK connects to `GET /stream` with the `SDK_KEY` in the `Authorization` header
2. Server sends a `connected` SSE event
3. Server bootstraps the SDK by replaying all current flags as `update` events
4. SDK updates its local `FlagStore` for each event
5. Server sends `keep-alive` pings every 15 seconds
6. On reconnect, the SDK clears its local store and re-bootstraps from scratch

This ensures the SDK always has a consistent snapshot even after network interruptions.

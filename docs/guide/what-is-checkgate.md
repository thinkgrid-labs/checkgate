---
title: What is Checkgate? — Open-Source Self-Hosted Feature Flag Engine
description: Learn what Checkgate is, how local evaluation delivers sub-microsecond feature flag decisions, and how it compares to LaunchDarkly and Statsig.
---

# What is Checkgate?

Checkgate is a **self-hosted, open-source feature flag engine** built for teams that need fast, reliable flag evaluation without sending data to a third-party SaaS vendor.

## The Problem

Most feature flag services evaluate flags on their servers — meaning every `isEnabled()` call is a network request. This introduces:

- **Latency** — even a fast remote call adds 5–50ms per flag check
- **Reliability risk** — if the flag service is down, your flag evaluation breaks
- **Vendor lock-in** — migrating away is painful and expensive
- **Data privacy concerns** — user attributes are sent to an external service

## The Checkgate Approach

Checkgate takes a different approach: **local evaluation**.

1. Your server runs the Checkgate control plane (a single Rust binary)
2. Each SDK connects once via SSE and receives the full flag set
3. All evaluation happens **in-process, in memory** — no network calls
4. When flags change, the server pushes deltas via SSE instantly

The result: **sub-microsecond flag evaluation** with real-time updates and zero external dependencies at evaluation time.

## How It Compares

| Feature | Checkgate | LaunchDarkly / Statsig |
|---|---|---|
| Evaluation location | In-process (local) | Remote HTTP |
| Evaluation latency | ~100ns | ~5–50ms |
| Self-hosted | Yes | No (or limited) |
| Open source | MIT | Closed source |
| Vendor lock-in | None | High |
| Pricing | Free | Usage-based |

## What Checkgate Is Not

- **Not a A/B testing platform** — Checkgate focuses on feature flags and rollouts, not experiment analysis
- **Not a managed service** — you operate the server yourself
- **Not a data warehouse** — Checkgate does not store analytics or events (that is your job)

## Who Is It For?

- Teams that want **full control** over their feature flag infrastructure
- Applications where **flag evaluation latency matters** (hot paths, mobile apps, real-time systems)
- Organizations with **data residency requirements** that prohibit sending user data to third parties
- Developers who prefer **open source** and want to understand and extend the system

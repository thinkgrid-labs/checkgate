# Sidekick — Self-Hosted Feature Flag Engine

[![CI](https://github.com/ThinkGrid-Labs/sidekick/actions/workflows/ci.yml/badge.svg)](https://github.com/ThinkGrid-Labs/sidekick/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![npm @sidekick/node](https://img.shields.io/npm/v/@sidekick/node?label=npm%20node)](https://www.npmjs.com/package/@sidekick/node)
[![npm @sidekick/browser](https://img.shields.io/npm/v/@sidekick/browser?label=npm%20browser)](https://www.npmjs.com/package/@sidekick/browser)
[![npm @sidekick/react-native](https://img.shields.io/npm/v/@sidekick/react-native?label=npm%20react-native)](https://www.npmjs.com/package/@sidekick/react-native)

**Sidekick is a self-hosted, open-source feature flag system with sub-microsecond local evaluation — no network calls, no polling, no vendor lock-in.** Built in Rust, it ships native SDKs for Node.js (NAPI), browsers (WebAssembly), React Native (JSI), and Flutter (FFI). A persistent SSE stream propagates flag changes to every connected SDK in under 50 ms.

**[Documentation →](https://thinkgrid-labs.github.io/sidekick)**

---

## Quick Start

```bash
# Start Postgres + Redis + Sidekick
docker compose -f docker-compose.full.yml up -d
```

```bash
npm install @sidekick/node
```

```typescript
import { SidekickClient } from '@sidekick/node'

const client = new SidekickClient({ serverUrl: 'http://localhost:3000' })
await client.connect()

const enabled = client.isEnabled('my-flag', userId, { plan: 'pro' })
```

That's it — `isEnabled()` is a pure in-process lookup. No network, no async, no latency.

---

## Features

- **Sub-microsecond evaluation** — flags are evaluated entirely in local memory
- **Real-time updates** — SSE push, not polling; changes land in < 50 ms
- **Targeting rules** — match by any user attribute (`email`, `plan`, `region`, …)
- **Percentage rollouts** — deterministic MurmurHash3 bucketing; sticky and independent per flag
- **Rust evaluation core** — compiled to NAPI, WASM, JSI, or FFI depending on platform
- **Self-hosted** — single binary + PostgreSQL + Redis; your data never leaves your infra

---

## Documentation

| Topic | Link |
|-------|------|
| Why Sidekick / comparisons | [What is Sidekick?](docs/guide/what-is-sidekick.md) |
| System architecture | [Architecture](docs/guide/architecture.md) |
| Flags, rules, rollout concepts | [Core Concepts](docs/guide/concepts.md) |
| Step-by-step setup | [Getting Started](docs/guide/getting-started.md) |
| REST API + SSE stream reference | [API Reference](docs/api-reference.md) |
| Node.js SDK | [SDK: Node.js](docs/sdks/nodejs.md) |
| Browser (WASM) SDK | [SDK: Browser](docs/sdks/browser.md) |
| React Native (JSI) SDK | [SDK: React Native](docs/sdks/react-native.md) |
| Flutter (FFI) SDK | [SDK: Flutter](docs/sdks/flutter.md) |
| Docker, AWS, env vars | [Self-Hosting](docs/self-hosting.md) |

---

## Repository Structure

```
core/               Rust evaluation engine (shared across all SDKs)
server/             Axum HTTP server (REST API + SSE stream)
sdks/
  nodejs/           NAPI native addon
  browser/          wasm-bindgen / wasm-pack
  react-native/     JSI C++ bridge
  flutter/          dart:ffi binding
dashboard/          Next.js control-plane UI
docs/               VitePress documentation
```

---

## CI/CD

| Workflow | Trigger | Action |
|----------|---------|--------|
| `ci.yml` | Push / PR to `main` or `dev` | Rust tests, clippy, fmt, dashboard build |
| `release-docker.yml` | Tag `v*.*.*` | Build multi-arch `sidekick:server` + `sidekick:full` → Docker Hub |
| `release-sdk-nodejs.yml` | Tag `v*.*.*` | Cross-compile 7 platforms → publish `@sidekick/node` to npm |
| `release-sdk-browser.yml` | Tag `v*.*.*` | wasm-pack build → publish `@sidekick/browser` to npm |
| `release-sdk-react-native.yml` | Tag `v*.*.*` | Publish `@sidekick/react-native` to npm |
| `release-sdk-flutter.yml` | Tag `v*.*.*` | Publish `sidekick_flutter` to pub.dev |

---

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md).

## License

MIT — see [LICENSE](LICENSE).

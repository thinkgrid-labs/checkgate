# Checkgate — Self-Hosted Feature Flag Engine

[![CI](https://github.com/ThinkGrid-Labs/checkgate/actions/workflows/ci.yml/badge.svg)](https://github.com/ThinkGrid-Labs/checkgate/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![npm @checkgate/node](https://img.shields.io/npm/v/@checkgate/node?label=npm%20node)](https://www.npmjs.com/package/@checkgate/node)
[![npm @checkgate/browser](https://img.shields.io/npm/v/@checkgate/browser?label=npm%20browser)](https://www.npmjs.com/package/@checkgate/browser)
[![npm @checkgate/react-native](https://img.shields.io/npm/v/@checkgate/react-native?label=npm%20react-native)](https://www.npmjs.com/package/@checkgate/react-native)

**Checkgate is a self-hosted, open-source feature flag system with sub-microsecond local evaluation — no network calls, no polling, no vendor lock-in.** Built in Rust, it ships native SDKs for Node.js (NAPI), browsers (WebAssembly), React Native (JSI), and Flutter (FFI). A persistent SSE stream propagates flag changes to every connected SDK in under 50 ms.

**[Documentation →](https://thinkgrid-labs.github.io/checkgate)**

---

## Quick Start

```bash
# Start Postgres + Redis + Checkgate
docker compose -f docker-compose.full.yml up -d
```

```bash
npm install @checkgate/node
```

```typescript
import { CheckgateClient } from '@checkgate/node'

const client = new CheckgateClient({ serverUrl: 'http://localhost:3000' })
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
| Why Checkgate / comparisons | [What is Checkgate?](docs/guide/what-is-checkgate.md) |
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
| `release-docker.yml` | Tag `v*.*.*` | Build multi-arch `checkgate:server` + `checkgate:full` → Docker Hub |
| `release-sdk-nodejs.yml` | Tag `v*.*.*` | Cross-compile 7 platforms → publish `@checkgate/node` to npm |
| `release-sdk-browser.yml` | Tag `v*.*.*` | wasm-pack build → publish `@checkgate/browser` to npm |
| `release-sdk-react-native.yml` | Tag `v*.*.*` | Publish `@checkgate/react-native` to npm |
| `release-sdk-flutter.yml` | Tag `v*.*.*` | Publish `checkgate_flutter` to pub.dev |

---

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md).

## License

MIT — see [LICENSE](LICENSE).

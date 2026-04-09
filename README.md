<p align="center">
  <img src="assets/checkgate_logo.png" width="160" alt="Checkgate Logo">
</p>

# Checkgate — Open-Source Feature Flags, Built for Speed.

[![CI](https://github.com/ThinkGrid-Labs/checkgate/actions/workflows/ci.yml/badge.svg)](https://github.com/ThinkGrid-Labs/checkgate/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![npm @checkgate/node](https://img.shields.io/npm/v/@checkgate/node?label=npm%20node)](https://www.npmjs.com/package/@checkgate/node)
[![npm @checkgate/web](https://img.shields.io/npm/v/@checkgate/web?label=npm%20web)](https://www.npmjs.com/package/@checkgate/web)
[![npm @checkgate/react-native](https://img.shields.io/npm/v/@checkgate/react-native?label=npm%20react-native)](https://www.npmjs.com/package/@checkgate/react-native)

**Checkgate is a blazing-fast, open-source feature flag engine designed for teams who refuse to compromise on performance or privacy.** By evaluating feature toggles locally in sub-microseconds, Checkgate completely eliminates network latency, expensive API round-trips, and SaaS vendor lock-in. 

It is proudly built in Rust and ships with native SDKs for Node.js (NAPI), browsers (WebAssembly), React Native (JSI), and Flutter (FFI). A persistent SSE stream propagates flag changes to every connected SDK instance in under 50 ms.

**[Explore the Documentation →](https://thinkgrid-labs.github.io/checkgate)**

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
| Web (WASM) SDK | [SDK: Web](docs/sdks/web.md) |
| React Native (JSI) SDK | [SDK: React Native](docs/sdks/react-native.md) |
| Flutter (FFI) SDK | [SDK: Flutter](docs/sdks/flutter.md) |
| Docker, AWS, env vars | [Self-Hosting](docs/self-hosting.md) |
| Enterprise Setup & Migration | [Enterprise Setup & Migration](docs/enterprise-setup.md) |

---

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md).

## License

MIT — see [LICENSE](LICENSE).

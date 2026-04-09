# Contributing to Launchgate

Thanks for your interest in contributing. This document covers how to get set up, the project conventions, and the process for submitting changes.

## Prerequisites

- Rust 1.88+
- Node.js 18+
- Docker and Docker Compose (for integration tests)
- `wasm-pack` (browser SDK)
- `@napi-rs/cli` (Node.js SDK)

## Getting started

```bash
git clone https://github.com/ThinkGrid-Labs/launchgate.git
cd launchgate
docker compose up -d       # start Postgres + Redis
cargo build --workspace    # verify everything compiles
cargo test --workspace     # run all tests
```

## Project layout

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

## Making changes

1. Fork the repo and create a branch from `main`.
2. Keep changes focused — one logical change per PR.
3. Run `cargo fmt --all` and `cargo clippy --workspace -- -D warnings` before pushing.
4. Add or update tests for any changed behaviour in `core/`.
5. Update relevant docs under `docs/` if the public API or behaviour changes.

## Commit style

Use short, imperative subject lines:

```
fix: correct MurmurHash3 seed for 32-bit targets
feat: add Contains operator to targeting rules
docs: update browser SDK webpack config example
```

Prefix with `fix:`, `feat:`, `docs:`, `refactor:`, `test:`, or `ci:`.

## Running the test suite

```bash
# Rust unit + integration tests
cargo test --workspace

# Node.js SDK (requires a build first)
cd sdks/nodejs && npm install && npm run build
```

## Submitting a PR

- Fill in the pull request template.
- Ensure CI passes (`cargo test`, clippy, fmt).
- Tag a maintainer for review if the change touches the evaluation engine or the SSE protocol.

## Reporting issues

Use the GitHub issue templates:
- **Bug report** — repro steps, environment, and error output.
- **Feature request** — motivation and proposed solution.

## License

By contributing you agree that your changes will be licensed under the [MIT License](LICENSE).

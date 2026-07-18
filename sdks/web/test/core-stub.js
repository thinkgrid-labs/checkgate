// Stub for the wasm-pack build artifact `./dist/checkgate.js`, aliased in by
// vitest.config.js so the SDK can be imported for unit tests without building
// the WASM. Tests white-box a fake `core` onto the client and never call
// connect(), so this stub is only here to satisfy the top-level import.
export default async function init() {}
export class CheckgateCoreWasm {}

// Server-side / edge evaluation core.
//
// `@checkgate/edge` and `@checkgate/ssr` both need an evaluation engine to load
// a flag snapshot into. This exposes the *same* WebAssembly engine the browser
// SDK uses, so edge and server-rendered evaluation is byte-for-byte identical to
// the client — no re-implemented rule/rollout/segment logic to drift.
//
// Usage differs only in how the `.wasm` bytes are obtained:
//
//   Next.js / Node        import { createWasmCore } from '@checkgate/web/core'
//                         const core = await createWasmCore()          // reads the bundled .wasm from disk
//
//   Browser               const core = await createWasmCore()          // fetched relative to this module
//
//   Cloudflare Workers    import wasm from '@checkgate/web/dist/checkgate_bg.wasm'
//                         const core = await createWasmCore(wasm)      // Wrangler compiles it to a Module
//
// Any input wasm-bindgen's `init()` accepts (WebAssembly.Module, ArrayBuffer,
// Response, or URL) may be passed explicitly for bundlers not covered above.

import init, { CheckgateCoreWasm } from './dist/checkgate.js'

/** Memoized one-time WASM instantiation, shared by every core built here. */
let ready = null

function isNode() {
  return typeof process !== 'undefined' && process.versions != null && process.versions.node != null
}

async function ensureInit(wasmInput) {
  if (ready) return ready
  // wasm-bindgen takes a single options object; passing the input bare is
  // deprecated and warns on every init.
  if (wasmInput !== undefined && wasmInput !== null) {
    // Caller supplied the module/bytes (Cloudflare Workers, custom bundlers).
    ready = init({ module_or_path: wasmInput })
  } else if (isNode()) {
    // Node (including the Next.js server runtime) has no fetch-relative-to-module
    // resolution for the .wasm, so read the file shipped alongside this module.
    const { readFile } = await import('node:fs/promises')
    const bytes = await readFile(new URL('./dist/checkgate_bg.wasm', import.meta.url))
    ready = init({ module_or_path: bytes })
  } else {
    // Browser: wasm-bindgen fetches the .wasm relative to this module's URL.
    ready = init()
  }
  return ready
}

/**
 * Create an evaluation core backed by the shared WASM engine.
 *
 * Safe to call repeatedly — the one-time `init()` is memoized, while each call
 * returns a fresh, independent in-memory flag store.
 *
 * The returned object satisfies the `core` contract of both `@checkgate/edge`
 * (`CheckgateEdge({ core })`) and `@checkgate/ssr` (`buildBootstrap({ core })`).
 *
 * @param {WebAssembly.Module|BufferSource|Response|URL} [wasmInput] Explicit
 *        wasm module/bytes. Omit in Node and the browser — see the notes above.
 * @returns {Promise<{
 *   upsertFlag: (flagJson: string) => void,
 *   clear: () => void,
 *   isEnabled: (key: string, userKey: string, attrs?: object) => boolean,
 *   getValue: (key: string, userKey: string, attrs?: object, defaultValue?: unknown) => unknown,
 *   getVariant: (key: string, userKey: string, attrs?: object) => {enabled: boolean, value: unknown} | null,
 * }>}
 */
export async function createWasmCore(wasmInput) {
  await ensureInit(wasmInput)

  const store = new CheckgateCoreWasm()
  return {
    upsertFlag: (json) => store.upsert_flag_v2(json),
    clear: () => store.clear_store(),
    isEnabled: (key, userKey, attrs = {}) => store.is_enabled(key, userKey, attrs),
    getValue: (key, userKey, attrs = {}, defaultValue = null) => {
      const v = store.get_value(key, userKey, attrs)
      return v === null || v === undefined ? defaultValue : v
    },
    getVariant: (key, userKey, attrs = {}) => store.get_variant(key, userKey, attrs),
  }
}

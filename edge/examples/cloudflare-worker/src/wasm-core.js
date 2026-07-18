// Adapter: build a CheckgateEdge `core` from the shared WebAssembly evaluation
// engine shipped in `@checkgate/web`. Because it's the *same* WASM every other
// Checkgate SDK uses, edge evaluation is byte-for-byte identical to server and
// client SDKs — no re-implemented rule/rollout/segment logic to drift.
//
// Wrangler compiles the `.wasm` import into a `WebAssembly.Module`; wasm-bindgen
// (`--target web`) accepts that module directly in `init()`.

import init, { CheckgateCoreWasm } from '@checkgate/web/dist/checkgate.js'
import wasmModule from '@checkgate/web/dist/checkgate_bg.wasm'

let ready = null

/**
 * Create an `EdgeCore` backed by the WASM engine. Safe to call repeatedly — the
 * one-time `init()` is memoized; each call returns a fresh in-memory flag store.
 */
export async function createWasmCore() {
  if (!ready) ready = init(wasmModule)
  await ready

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

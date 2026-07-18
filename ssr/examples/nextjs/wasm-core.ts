// Build a Checkgate evaluation `core` from the shared @checkgate/web WASM engine,
// for server-side use (Next.js server components / route handlers / middleware).
// This is the same adapter shape @checkgate/edge uses — the one engine every
// Checkgate SDK shares, so server and client evaluation agree exactly.
//
// @ts-nocheck — illustrative example; wiring depends on your bundler's WASM support.
import init, { CheckgateCoreWasm } from '@checkgate/web/dist/checkgate.js'

let ready: Promise<unknown> | null = null

export interface EdgeCore {
  upsertFlag(json: string): void
  clear(): void
  isEnabled(key: string, userKey: string, attrs?: Record<string, string>): boolean
  getValue(key: string, userKey: string, attrs?: Record<string, string>, dflt?: unknown): unknown
  getVariant(key: string, userKey: string, attrs?: Record<string, string>): { enabled: boolean; value: unknown } | null
}

export async function createWasmCore(): Promise<EdgeCore> {
  if (!ready) ready = init()
  await ready

  const store = new CheckgateCoreWasm()
  return {
    upsertFlag: (json) => store.upsert_flag_v2(json),
    clear: () => store.clear_store(),
    isEnabled: (k, u, a = {}) => store.is_enabled(k, u, a),
    getValue: (k, u, a = {}, dflt = null) => {
      const v = store.get_value(k, u, a)
      return v === null || v === undefined ? dflt : v
    },
    getVariant: (k, u, a = {}) => store.get_variant(k, u, a),
  }
}

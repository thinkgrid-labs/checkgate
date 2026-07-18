// Server-side bootstrap building and client-side value access.
//
// The SSR flow:
//   1. On the server, evaluate the flags a page needs for the current user and
//      build a small, serializable "bootstrap" payload (`buildBootstrap`).
//   2. Embed it in the HTML (see serialize.js).
//   3. On the client, render the first paint from that payload
//      (`BootstrapValues`) — identical to what the server rendered, so there's
//      no flag flicker — then let the live SDK take over for updates.

// Current payload schema version. Bump if the shape changes so a stale embed
// from an old deploy can be detected and ignored on the client.
export const BOOTSTRAP_VERSION = 1

/**
 * @typedef {Object} EvalCore The evaluation engine buildBootstrap loads flags
 * into. Matches the `@checkgate/edge` core adapter (and the WASM engine).
 * @property {(flagJson: string) => void} upsertFlag
 * @property {() => void} clear
 * @property {(key: string, userKey: string, attrs?: object) => {enabled: boolean, value: unknown} | null} getVariant
 */

/**
 * Evaluate `keys` for `userKey` on the server and build a bootstrap payload.
 *
 * @param {Object} opts
 * @param {EvalCore} opts.core            Evaluation engine (e.g. the @checkgate/web WASM core).
 * @param {Array<object>} opts.snapshot   The flag snapshot (array of flags) — the same shape `/flags/snapshot` returns.
 * @param {string} opts.userKey           Stable per-user identifier used for evaluation.
 * @param {string[]} [opts.keys]          Flag keys to pre-resolve. Omit to resolve every flag in the snapshot.
 * @param {object} [opts.attributes]      Targeting attributes for the user.
 * @param {boolean} [opts.includeSnapshot=true] Embed the raw snapshot so the client SDK is live-ready without waiting for SSE.
 * @param {() => number} [opts.now]       Clock (ms), injectable for tests.
 * @returns {{v:number, userKey:string, generatedAt:number, values:Record<string,{enabled:boolean,value:unknown}>, flags?: Array<object>}}
 */
export function buildBootstrap(opts) {
  const {
    core,
    snapshot,
    userKey,
    keys,
    attributes = {},
    includeSnapshot = true,
    now = Date.now,
  } = opts

  if (!core || typeof core.getVariant !== 'function' || typeof core.upsertFlag !== 'function') {
    throw new Error('buildBootstrap: a `core` with clear/upsertFlag/getVariant is required.')
  }
  if (!Array.isArray(snapshot)) {
    throw new Error('buildBootstrap: `snapshot` must be an array of flags.')
  }
  if (!userKey) {
    throw new Error('buildBootstrap: `userKey` is required.')
  }

  // Load the snapshot into the engine.
  core.clear()
  for (const flag of snapshot) core.upsertFlag(JSON.stringify(flag))

  // Resolve the requested keys (or every flag in the snapshot).
  const resolveKeys = keys && keys.length > 0 ? keys : snapshot.map(f => f.key)
  const values = {}
  for (const key of resolveKeys) {
    const variant = core.getVariant(key, userKey, attributes)
    if (variant == null) continue
    values[key] = { enabled: Boolean(variant.enabled), value: variant.value ?? null }
  }

  const payload = {
    v: BOOTSTRAP_VERSION,
    userKey,
    generatedAt: now(),
    values,
  }
  if (includeSnapshot) payload.flags = snapshot
  return payload
}

/**
 * Client-side accessor over a bootstrap payload. Gives the same read API shape
 * as the live SDK, so a component can render from server-resolved values on the
 * first paint and swap to the live client later without changing call sites.
 */
export class BootstrapValues {
  /** @param {ReturnType<typeof buildBootstrap>|null|undefined} payload */
  constructor(payload) {
    const ok = payload && typeof payload === 'object' && payload.v === BOOTSTRAP_VERSION
    this.userKey = ok ? payload.userKey : null
    this.flags = ok && Array.isArray(payload.flags) ? payload.flags : []
    this._values = ok && payload.values ? payload.values : {}
    this.valid = Boolean(ok)
  }

  /** Whether a value for `key` was pre-resolved on the server. */
  has(key) {
    return Object.prototype.hasOwnProperty.call(this._values, key)
  }

  /** The on/off decision for `key` (false if not pre-resolved). */
  isEnabled(key) {
    return this._values[key]?.enabled ?? false
  }

  /** The resolved value for `key`, or `defaultValue` if not pre-resolved. */
  getValue(key, defaultValue = null) {
    if (!this.has(key)) return defaultValue
    const v = this._values[key].value
    return v === null || v === undefined ? defaultValue : v
  }

  /** The full `{enabled, value}` for `key`, or null if not pre-resolved. */
  getVariant(key) {
    return this.has(key) ? this._values[key] : null
  }
}

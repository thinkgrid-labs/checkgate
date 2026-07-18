// CheckgateEdge — a runtime-agnostic edge evaluator.
//
// It does NOT evaluate flags itself. Instead it owns the *edge concern*: pull a
// flag snapshot from the Checkgate server, cache it with a freshness window
// (TTL) and optional stale-while-revalidate, survive origin outages by keeping
// the last-known-good snapshot, and delegate the actual evaluation to an
// injected `core`.
//
// In production the `core` is the shared WebAssembly evaluation engine from
// `@checkgate/web`, so edge evaluation is byte-for-byte identical to every
// other SDK. In tests the `core` is a tiny fake — which is why this module has
// zero dependencies and runs anywhere `fetch` exists (Cloudflare Workers, Deno
// Deploy, Fastly, Vercel Edge, Fly.io, Node).

const DEFAULT_TTL_SECONDS = 30
const DEFAULT_SNAPSHOT_PATH = '/flags/snapshot'

/**
 * @typedef {Object} EdgeCore The evaluation engine CheckgateEdge delegates to.
 * @property {(flagJson: string) => void} upsertFlag  Load one flag (JSON string).
 * @property {() => void} clear                        Drop all loaded flags.
 * @property {(key: string, userKey: string, attrs?: object) => boolean} isEnabled
 * @property {(key: string, userKey: string, attrs?: object, defaultValue?: unknown) => unknown} getValue
 * @property {(key: string, userKey: string, attrs?: object) => unknown} getVariant
 */

export class CheckgateEdge {
  /**
   * @param {Object} opts
   * @param {string} opts.serverUrl  Checkgate server base URL.
   * @param {string} opts.sdkKey     Environment-scoped SDK key (Bearer-authed).
   * @param {EdgeCore} opts.core     Evaluation engine to delegate to.
   * @param {number} [opts.ttlSeconds=30]                  Freshness window.
   * @param {number} [opts.staleWhileRevalidateSeconds=0]  Extra window in which a
   *        stale snapshot is served immediately while a refresh runs in the background.
   * @param {typeof fetch} [opts.fetchImpl]  Defaults to globalThis.fetch.
   * @param {() => number} [opts.now]        Clock (ms), injectable for tests.
   * @param {string} [opts.snapshotPath='/flags/snapshot']
   */
  constructor(opts = {}) {
    const {
      serverUrl,
      sdkKey,
      core,
      ttlSeconds = DEFAULT_TTL_SECONDS,
      staleWhileRevalidateSeconds = 0,
      fetchImpl,
      now,
      snapshotPath = DEFAULT_SNAPSHOT_PATH,
    } = opts

    if (!serverUrl) throw new Error('CheckgateEdge: `serverUrl` is required.')
    if (!sdkKey) throw new Error('CheckgateEdge: `sdkKey` is required.')
    if (!core || typeof core.upsertFlag !== 'function' || typeof core.isEnabled !== 'function') {
      throw new Error('CheckgateEdge: a `core` with upsertFlag/clear/isEnabled/getValue/getVariant is required.')
    }

    const resolvedFetch = fetchImpl ?? globalThis.fetch
    if (typeof resolvedFetch !== 'function') {
      throw new Error('CheckgateEdge: no `fetch` available — pass `fetchImpl`.')
    }

    this.serverUrl = String(serverUrl).replace(/\/+$/, '')
    this.snapshotUrl = `${this.serverUrl}${snapshotPath}`
    this.sdkKey = sdkKey
    this.core = core
    this.ttlMs = Math.max(0, ttlSeconds) * 1000
    this.swrMs = Math.max(0, staleWhileRevalidateSeconds) * 1000
    this._fetch = resolvedFetch
    this._now = now ?? Date.now

    this._loaded = false
    this._loadedAt = 0
    this._flagCount = 0
    this._refreshing = null // in-flight refresh promise, for de-duplication
  }

  /** Whether a snapshot has ever been successfully loaded. */
  get isLoaded() {
    return this._loaded
  }

  /** Number of flags in the currently loaded snapshot. */
  get flagCount() {
    return this._flagCount
  }

  /** Epoch ms of the last successful load, or null if never loaded. */
  get lastLoadedAt() {
    return this._loaded ? this._loadedAt : null
  }

  /** Age of the loaded snapshot in ms (Infinity if never loaded). */
  ageMs() {
    return this._loaded ? this._now() - this._loadedAt : Infinity
  }

  /**
   * Fetch the latest snapshot and load it into the core. Concurrent calls share
   * a single in-flight request. On a network error or non-2xx response, a
   * previously-loaded snapshot is kept (fail-open to last-known-good); if none
   * was ever loaded, the error propagates.
   *
   * @returns {Promise<{count: number, refreshed: boolean, status?: number, error?: Error}>}
   */
  refresh() {
    if (this._refreshing) return this._refreshing
    this._refreshing = this._doRefresh().finally(() => {
      this._refreshing = null
    })
    return this._refreshing
  }

  async _doRefresh() {
    let res
    try {
      res = await this._fetch(this.snapshotUrl, {
        headers: {
          Authorization: `Bearer ${this.sdkKey}`,
          Accept: 'application/json',
        },
      })
    } catch (error) {
      if (this._loaded) return { count: this._flagCount, refreshed: false, error }
      throw new Error(`CheckgateEdge: snapshot fetch failed (${error?.message ?? error}).`)
    }

    if (!res.ok) {
      if (this._loaded) return { count: this._flagCount, refreshed: false, status: res.status }
      throw new Error(`CheckgateEdge: snapshot fetch returned HTTP ${res.status}.`)
    }

    const flags = await res.json()
    if (!Array.isArray(flags)) {
      if (this._loaded) return { count: this._flagCount, refreshed: false }
      throw new Error('CheckgateEdge: snapshot response was not a JSON array of flags.')
    }

    this.core.clear()
    for (const flag of flags) this.core.upsertFlag(JSON.stringify(flag))
    this._flagCount = flags.length
    this._loadedAt = this._now()
    this._loaded = true
    return { count: flags.length, refreshed: true }
  }

  /**
   * Guarantee the snapshot is usable before an evaluation:
   *  - never loaded        → block on a refresh.
   *  - within TTL          → do nothing (fast path — the common case on a warm isolate).
   *  - within TTL+SWR      → serve stale now, refresh in the background (via `waitUntil`).
   *  - beyond TTL+SWR      → block on a refresh, keeping last-known-good if it fails.
   *
   * @param {{ waitUntil?: (p: Promise<unknown>) => void }} [opts]
   *        Pass a platform `waitUntil` (e.g. Cloudflare `ctx.waitUntil`) so the
   *        background refresh isn't cancelled when the response is returned.
   */
  async ensureFresh({ waitUntil } = {}) {
    if (!this._loaded) {
      await this.refresh()
      return
    }

    const age = this.ageMs()
    if (age <= this.ttlMs) return

    if (this.swrMs > 0 && age <= this.ttlMs + this.swrMs) {
      const bg = this.refresh().catch(() => {})
      if (typeof waitUntil === 'function') waitUntil(bg)
      return
    }

    // Too stale to serve — block, but never throw away last-known-good.
    await this.refresh().catch(() => {})
  }

  // --- Evaluation (delegates to the injected core) -------------------------

  isEnabled(key, userKey, attrs = {}) {
    return this.core.isEnabled(key, userKey, attrs)
  }

  getValue(key, userKey, attrs = {}, defaultValue = null) {
    return this.core.getValue(key, userKey, attrs, defaultValue)
  }

  getVariant(key, userKey, attrs = {}) {
    return this.core.getVariant(key, userKey, attrs)
  }
}

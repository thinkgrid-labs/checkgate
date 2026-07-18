import { test } from 'node:test'
import assert from 'node:assert/strict'
import { CheckgateEdge } from '../src/index.js'

// --- Test doubles ----------------------------------------------------------

/** A minimal in-memory core that records what CheckgateEdge loads into it. */
function fakeCore() {
  const flags = new Map()
  return {
    flags,
    clears: 0,
    upsertFlag(json) {
      const f = JSON.parse(json)
      flags.set(f.key, f)
    },
    clear() {
      this.clears++
      flags.clear()
    },
    isEnabled(key) {
      return Boolean(flags.get(key)?.is_enabled)
    },
    getValue(key, _u, _a, dflt) {
      const f = flags.get(key)
      return f ? (f.default_value ?? dflt) : dflt
    },
    getVariant(key) {
      return flags.get(key) ?? null
    },
  }
}

/**
 * A fetch stub whose responses are supplied by `queue` (a function of call
 * index → { ok, status, body }). Records every call.
 */
function fakeFetch(handler) {
  const calls = []
  const fn = async (url, init) => {
    const i = calls.length
    calls.push({ url, init })
    const r = handler(i, url, init)
    if (r instanceof Error) throw r
    return {
      ok: r.ok ?? true,
      status: r.status ?? 200,
      json: async () => r.body,
    }
  }
  fn.calls = calls
  return fn
}

/** Mutable injectable clock. */
function clock(start = 1_000_000) {
  const state = { t: start }
  return { now: () => state.t, advance: (ms) => { state.t += ms }, set: (ms) => { state.t = ms } }
}

const FLAGS = [
  { key: 'new-homepage', is_enabled: true, flag_type: 'boolean', default_value: true },
  { key: 'checkout-color', is_enabled: true, flag_type: 'string', default_value: 'blue' },
]

function make(opts = {}) {
  const core = opts.core ?? fakeCore()
  const clk = opts.clk ?? clock()
  const fetchImpl = opts.fetchImpl ?? fakeFetch(() => ({ body: FLAGS }))
  const edge = new CheckgateEdge({
    serverUrl: 'https://flags.example.com/',
    sdkKey: 'sk_test_123',
    core,
    ttlSeconds: 30,
    fetchImpl,
    now: clk.now,
    ...opts.edge,
  })
  return { edge, core, clk, fetchImpl }
}

// --- Construction ----------------------------------------------------------

test('constructor validates required options', () => {
  const core = fakeCore()
  assert.throws(() => new CheckgateEdge({ sdkKey: 'k', core }), /serverUrl/)
  assert.throws(() => new CheckgateEdge({ serverUrl: 'u', core }), /sdkKey/)
  assert.throws(() => new CheckgateEdge({ serverUrl: 'u', sdkKey: 'k' }), /core/)
})

// --- refresh() -------------------------------------------------------------

test('refresh() fetches the snapshot with Bearer auth and loads the core', async () => {
  const { edge, core, fetchImpl } = make()
  const result = await edge.refresh()

  assert.equal(result.refreshed, true)
  assert.equal(result.count, 2)
  assert.equal(edge.isLoaded, true)
  assert.equal(edge.flagCount, 2)
  assert.equal(core.flags.size, 2)

  assert.equal(fetchImpl.calls.length, 1)
  assert.equal(fetchImpl.calls[0].url, 'https://flags.example.com/flags/snapshot')
  assert.equal(fetchImpl.calls[0].init.headers.Authorization, 'Bearer sk_test_123')
})

test('refresh() clears the core before loading (no stale flags linger)', async () => {
  let call = 0
  const fetchImpl = fakeFetch(() => (call++ === 0
    ? { body: FLAGS }
    : { body: [{ key: 'only-one', is_enabled: true }] }))
  const { edge, core } = make({ fetchImpl })

  await edge.refresh()
  assert.equal(core.flags.size, 2)
  await edge.refresh()
  assert.equal(core.flags.size, 1)
  assert.ok(core.flags.has('only-one'))
  assert.ok(!core.flags.has('new-homepage'))
})

test('concurrent refresh() calls are de-duplicated into one fetch', async () => {
  const { edge, fetchImpl } = make()
  await Promise.all([edge.refresh(), edge.refresh(), edge.refresh()])
  assert.equal(fetchImpl.calls.length, 1)
})

// --- ensureFresh() TTL / SWR ----------------------------------------------

test('ensureFresh() loads once, then serves from cache within the TTL', async () => {
  const { edge, fetchImpl, clk } = make()
  await edge.ensureFresh()
  assert.equal(fetchImpl.calls.length, 1)

  clk.advance(29_000) // still inside 30s TTL
  await edge.ensureFresh()
  assert.equal(fetchImpl.calls.length, 1) // no refetch
})

test('ensureFresh() refetches once the TTL has elapsed', async () => {
  const { edge, fetchImpl, clk } = make()
  await edge.ensureFresh()
  clk.advance(31_000) // past 30s TTL
  await edge.ensureFresh()
  assert.equal(fetchImpl.calls.length, 2)
})

test('stale-while-revalidate serves stale immediately and refreshes in the background', async () => {
  const { edge, fetchImpl, clk } = make({ edge: { staleWhileRevalidateSeconds: 60 } })
  await edge.ensureFresh()
  assert.equal(fetchImpl.calls.length, 1)

  clk.advance(45_000) // past TTL(30s), within TTL+SWR(90s)
  const scheduled = []
  await edge.ensureFresh({ waitUntil: (p) => scheduled.push(p) })

  // Returned without blocking on a second fetch, but scheduled one.
  assert.equal(scheduled.length, 1)
  await Promise.all(scheduled)
  assert.equal(fetchImpl.calls.length, 2)
})

// --- Resilience ------------------------------------------------------------

test('a failed refresh keeps the last-known-good snapshot (fail-open)', async () => {
  let call = 0
  const fetchImpl = fakeFetch(() => (call++ === 0 ? { body: FLAGS } : new Error('network down')))
  const { edge, core, clk } = make({ fetchImpl })

  await edge.ensureFresh()
  assert.equal(edge.flagCount, 2)

  clk.advance(31_000)
  await edge.ensureFresh() // refresh throws internally, but must not clear flags
  assert.equal(edge.isLoaded, true)
  assert.equal(core.flags.size, 2)
  assert.equal(edge.isEnabled('new-homepage', 'u1'), true)
})

test('the very first refresh propagates errors (nothing to fall back to)', async () => {
  const fetchImpl = fakeFetch(() => new Error('cold start, origin unreachable'))
  const { edge } = make({ fetchImpl })
  await assert.rejects(() => edge.refresh(), /snapshot fetch failed/)
  assert.equal(edge.isLoaded, false)
})

test('a non-2xx first response throws with the status', async () => {
  const fetchImpl = fakeFetch(() => ({ ok: false, status: 401, body: null }))
  const { edge } = make({ fetchImpl })
  await assert.rejects(() => edge.refresh(), /HTTP 401/)
})

// --- Evaluation delegation -------------------------------------------------

test('evaluation methods delegate to the core after loading', async () => {
  const { edge } = make()
  await edge.ensureFresh()
  assert.equal(edge.isEnabled('new-homepage', 'user_1'), true)
  assert.equal(edge.getValue('checkout-color', 'user_1', {}, 'green'), 'blue')
  assert.equal(edge.getValue('missing', 'user_1', {}, 'fallback'), 'fallback')
  assert.deepEqual(edge.getVariant('new-homepage', 'user_1').key, 'new-homepage')
})

import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  buildBootstrap, BootstrapValues, BOOTSTRAP_VERSION,
  serializeBootstrap, bootstrapScriptTag, readBootstrap,
} from '../src/index.js'

// JS line separators (U+2028 / U+2029) built from char codes so no literal
// invisible characters appear in this source file.
const LS = String.fromCharCode(0x2028)
const PS = String.fromCharCode(0x2029)

// A fake evaluation core standing in for the @checkgate/web WASM engine.
function fakeCore() {
  const flags = new Map()
  return {
    clears: 0,
    flags,
    clear() { this.clears++; flags.clear() },
    upsertFlag(json) { const f = JSON.parse(json); flags.set(f.key, f) },
    getVariant(key) {
      const f = flags.get(key)
      if (!f) return null
      return { enabled: Boolean(f.is_enabled), value: f.default_value ?? null }
    },
  }
}

const SNAPSHOT = [
  { key: 'new-homepage', is_enabled: true, flag_type: 'boolean', default_value: true },
  { key: 'checkout-color', is_enabled: true, flag_type: 'string', default_value: 'blue' },
  { key: 'legacy', is_enabled: false, flag_type: 'boolean', default_value: false },
]

test('buildBootstrap resolves requested keys and embeds the snapshot', () => {
  const core = fakeCore()
  const payload = buildBootstrap({
    core, snapshot: SNAPSHOT, userKey: 'user_1',
    keys: ['new-homepage', 'checkout-color'],
    now: () => 1234,
  })

  assert.equal(payload.v, BOOTSTRAP_VERSION)
  assert.equal(payload.userKey, 'user_1')
  assert.equal(payload.generatedAt, 1234)
  assert.deepEqual(payload.values['new-homepage'], { enabled: true, value: true })
  assert.deepEqual(payload.values['checkout-color'], { enabled: true, value: 'blue' })
  assert.ok(!('legacy' in payload.values)) // not requested
  assert.equal(payload.flags.length, 3)    // snapshot embedded for client liveness
  assert.equal(core.clears, 1)             // core cleared before loading
})

test('buildBootstrap resolves every flag when no keys are given', () => {
  const payload = buildBootstrap({ core: fakeCore(), snapshot: SNAPSHOT, userKey: 'u' })
  assert.deepEqual(Object.keys(payload.values).sort(), ['checkout-color', 'legacy', 'new-homepage'])
})

test('buildBootstrap can omit the snapshot', () => {
  const payload = buildBootstrap({ core: fakeCore(), snapshot: SNAPSHOT, userKey: 'u', includeSnapshot: false })
  assert.equal(payload.flags, undefined)
})

test('buildBootstrap validates inputs', () => {
  assert.throws(() => buildBootstrap({ snapshot: [], userKey: 'u' }), /core/)
  assert.throws(() => buildBootstrap({ core: fakeCore(), snapshot: {}, userKey: 'u' }), /snapshot/)
  assert.throws(() => buildBootstrap({ core: fakeCore(), snapshot: [] }), /userKey/)
})

test('BootstrapValues exposes the live-SDK read shape', () => {
  const payload = buildBootstrap({ core: fakeCore(), snapshot: SNAPSHOT, userKey: 'user_1' })
  const v = new BootstrapValues(payload)
  assert.equal(v.valid, true)
  assert.equal(v.userKey, 'user_1')
  assert.equal(v.isEnabled('new-homepage'), true)
  assert.equal(v.isEnabled('legacy'), false)
  assert.equal(v.getValue('checkout-color', 'green'), 'blue')
  assert.equal(v.getValue('missing', 'fallback'), 'fallback')
  assert.deepEqual(v.getVariant('new-homepage'), { enabled: true, value: true })
  assert.equal(v.getVariant('missing'), null)
})

test('BootstrapValues is safe on missing/garbage payloads', () => {
  for (const bad of [null, undefined, {}, { v: 999 }]) {
    const v = new BootstrapValues(bad)
    assert.equal(v.valid, false)
    assert.equal(v.isEnabled('anything'), false)
    assert.equal(v.getValue('anything', 'd'), 'd')
  }
})

test('serializeBootstrap escapes </script> and JS line separators', () => {
  const payload = {
    v: BOOTSTRAP_VERSION,
    userKey: '</script><script>alert(1)</script>',
    values: { x: { enabled: true, value: `a${LS}b${PS}c` } },
  }
  const s = serializeBootstrap(payload)
  assert.ok(!s.includes('</script>'), 'must not contain a raw </script>')
  assert.ok(!s.includes('<'), 'all < escaped')
  assert.ok(!s.includes(LS) && !s.includes(PS), 'line separators escaped')
  // Still valid JSON that round-trips to the original values.
  assert.equal(JSON.parse(s).userKey, payload.userKey)
  assert.equal(JSON.parse(s).values.x.value, `a${LS}b${PS}c`)
})

test('bootstrapScriptTag wraps the payload and supports a CSP nonce', () => {
  const payload = { v: BOOTSTRAP_VERSION, userKey: 'u', values: {} }
  const tag = bootstrapScriptTag(payload, { varName: '__CG__', nonce: 'abc123' })
  assert.match(tag, /^<script nonce="abc123">window\.__CG__=/)
  assert.match(tag, /<\/script>$/)
})

test('readBootstrap round-trips through a window-like object', () => {
  const payload = buildBootstrap({ core: fakeCore(), snapshot: SNAPSHOT, userKey: 'u' })
  const win = {}
  // Simulate what the embedded <script> does: assign to window.
  win['__CHECKGATE_BOOTSTRAP__'] = JSON.parse(serializeBootstrap(payload))
  const read = readBootstrap('__CHECKGATE_BOOTSTRAP__', win)
  assert.equal(read.userKey, 'u')
  assert.equal(readBootstrap('__CHECKGATE_BOOTSTRAP__', {}), null)
  assert.equal(readBootstrap('__CHECKGATE_BOOTSTRAP__', undefined), null)
})

// Pre-publish smoke test: exercise the server-side core export against the
// freshly built WASM, so a broken engine or init path can never be published.
//
// Run from the package root (sdks/web) after `wasm-pack build`:
//   node scripts/smoke-core.mjs

import { createWasmCore } from '../core.js'

const core = await createWasmCore()

core.upsertFlag(
  JSON.stringify({
    key: 'smoke-bool',
    is_enabled: true,
    rollout_percentage: 100,
    flag_type: 'boolean',
    rules: [],
  }),
)
core.upsertFlag(
  JSON.stringify({
    key: 'smoke-string',
    is_enabled: true,
    rollout_percentage: 100,
    flag_type: 'string',
    default_value: 'blue',
    rules: [],
  }),
)

const checks = [
  ['isEnabled', core.isEnabled('smoke-bool', 'user-1'), true],
  ['getValue', core.getValue('smoke-string', 'user-1', {}, 'fallback'), 'blue'],
  ['getValue default for unknown flag', core.getValue('nope', 'user-1', {}, 'fallback'), 'fallback'],
  ['getVariant.enabled', core.getVariant('smoke-bool', 'user-1')?.enabled, true],
]

let failed = false
for (const [label, actual, expected] of checks) {
  if (actual !== expected) {
    console.error(`  FAIL  ${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`)
    failed = true
  }
}

// clear() must empty the store.
core.clear()
if (core.isEnabled('smoke-bool', 'user-1') !== false) {
  console.error('  FAIL  clear() did not empty the store')
  failed = true
}

if (failed) {
  console.error('core export smoke test FAILED')
  process.exit(1)
}
console.log('core export smoke test passed')

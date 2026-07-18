// Shared helpers: flag normalization, identifier casing, and language literal
// emitters used by the code generators.

/** Valid flag types (mirrors the server's `FlagType` enum). */
export const FLAG_TYPES = ['boolean', 'string', 'integer', 'json']

/**
 * Normalize the raw flag objects returned by the API (or read from a file) into
 * the minimal shape the generators need: `{ key, type, default }`.
 *
 * - `type` falls back to `boolean` (matching the server default for flags that
 *   predate multi-variant support).
 * - `default` is the flag's configured `default_value` when present, otherwise
 *   `undefined` (generators substitute a type-appropriate zero value).
 * - Archived flags and entries without a string `key` are dropped.
 * - Output is de-duplicated by key and sorted, so generation is deterministic.
 */
export function normalizeFlags(raw) {
  if (!Array.isArray(raw)) {
    throw new Error('Expected an array of flags (the /flags API returns a JSON array).')
  }
  const byKey = new Map()
  for (const f of raw) {
    if (!f || typeof f.key !== 'string' || f.key.length === 0) continue
    if (f.archived_at) continue
    const type = FLAG_TYPES.includes(f.flag_type) ? f.flag_type : 'boolean'
    byKey.set(f.key, {
      key: f.key,
      type,
      default: Object.prototype.hasOwnProperty.call(f, 'default_value') ? f.default_value : undefined,
    })
  }
  return [...byKey.values()].sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0))
}

/** Split a flag key into lowercase word parts on any non-alphanumeric boundary. */
function words(key) {
  return key
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2') // split camelCase humps
    .split(/[^a-zA-Z0-9]+/)
    .filter(Boolean)
    .map(w => w.toLowerCase())
}

/** `new-dashboard` → `NewDashboard`. Prefixes `_` if it would start with a digit. */
export function pascalCase(key) {
  const id = words(key).map(w => w.charAt(0).toUpperCase() + w.slice(1)).join('')
  return /^[0-9]/.test(id) || id === '' ? `_${id}` : id
}

/** `new-dashboard` → `newDashboard`. Prefixes `_` if it would start with a digit. */
export function camelCase(key) {
  const p = pascalCase(key).replace(/^_/, '')
  const id = p.charAt(0).toLowerCase() + p.slice(1)
  return /^[0-9]/.test(id) || id === '' ? `_${id}` : id
}

/** `new-dashboard` → `NEW_DASHBOARD`. Prefixes `_` if it would start with a digit. */
export function upperSnakeCase(key) {
  const id = words(key).join('_').toUpperCase()
  return /^[0-9]/.test(id) || id === '' ? `_${id}` : id
}

/**
 * Ensure a set of generated identifiers is unique by suffixing collisions with
 * `_2`, `_3`, … Two distinct keys can normalize to the same identifier
 * (`a.b` and `a-b` → `aB`); this keeps the generated code valid.
 */
export function dedupeIdentifiers(names) {
  const seen = new Map()
  return names.map(name => {
    const n = seen.get(name) ?? 0
    seen.set(name, n + 1)
    return n === 0 ? name : `${name}_${n + 1}`
  })
}

// --- Literal emitters ------------------------------------------------------

const DART_KEYWORDS = new Set([
  'assert', 'break', 'case', 'catch', 'class', 'const', 'continue', 'default',
  'do', 'else', 'enum', 'extends', 'false', 'final', 'finally', 'for', 'if',
  'in', 'is', 'new', 'null', 'rethrow', 'return', 'super', 'switch', 'this',
  'throw', 'true', 'try', 'var', 'void', 'while', 'with',
])

/**
 * Make an identifier safe for Dart. A leading underscore makes a Dart
 * declaration library-*private*, which would hide a generated enum member or
 * method from consumers, so swap it for an `f` (flag) prefix. Reserved words
 * get a `Flag` suffix.
 */
export function safeDartIdent(name) {
  const n = name.startsWith('_') ? `f${name.slice(1)}` : name
  return DART_KEYWORDS.has(n) ? `${n}Flag` : n
}

/** Zero value for a flag type when it has no configured default. */
export function zeroValue(type) {
  switch (type) {
    case 'string': return ''
    case 'integer': return 0
    case 'json': return null
    default: return false
  }
}

/** TypeScript literal from a JSON value. */
export function tsLiteral(value) {
  return JSON.stringify(value)
}

/** Dart literal from a JSON value. `$` is escaped to avoid string interpolation. */
export function dartLiteral(value) {
  if (typeof value === 'string') return `'${value.replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/\$/g, '\\$').replace(/\n/g, '\\n')}'`
  // JSON object/array/number/bool/null literals are all valid Dart literal
  // syntax; only `$` inside nested strings needs escaping.
  return JSON.stringify(value).replace(/\$/g, '\\$')
}

/**
 * Rust literal from a JSON value. `kind` is the flag's Rust value kind:
 * `'bool'`, `'i64'`, `'str'` (a plain string flag), or `'json'` (raw JSON text).
 * String and JSON values become raw string literals with enough `#` hashes to
 * never collide with their content.
 */
export function rustLiteral(value, kind) {
  if (kind === 'bool') return value ? 'true' : 'false'
  if (kind === 'i64') return `${Math.trunc(Number(value))}`
  const text = kind === 'str' ? String(value) : JSON.stringify(value)
  let hashes = '#'
  while (text.includes(`"${hashes}`)) hashes += '#'
  return `r${hashes}"${text}"${hashes}`
}

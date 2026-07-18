// Safe embedding of a bootstrap payload into server-rendered HTML, and reading
// it back on the client.

export const DEFAULT_VAR_NAME = '__CHECKGATE_BOOTSTRAP__'

// Characters that must be escaped when inlining JSON inside a <script> element:
//   <  — a literal "</script>" would end the script element early.
//   >, & — escaped defensively for HTML contexts.
//   U+2028 / U+2029 — valid in JSON strings but are JS line terminators, which
//                     break the inline parse.
function escapeChar(c) {
  switch (c) {
    case '<':
      return '\\u003c'
    case '>':
      return '\\u003e'
    case '&':
      return '\\u0026'
    case '\u2028':
      return '\\u2028'
    case '\u2029':
      return '\\u2029'
    default:
      return c
  }
}

/**
 * JSON-serialize a bootstrap payload, escaped so it is safe to inline inside a
 * `<script>` tag (no `</script>` breakout, no U+2028/U+2029 parse breakage).
 */
export function serializeBootstrap(payload) {
  return JSON.stringify(payload).replace(/[<>&\u2028\u2029]/g, escapeChar)
}

/**
 * Build a full `<script>` tag that assigns the payload to `window[varName]`,
 * ready to drop into your server-rendered `<head>` or before your app bundle.
 *
 * @param {object} payload
 * @param {{ varName?: string, nonce?: string }} [opts] `nonce` sets a CSP nonce.
 * @returns {string}
 */
export function bootstrapScriptTag(payload, opts = {}) {
  const varName = opts.varName || DEFAULT_VAR_NAME
  const nonce = opts.nonce ? ` nonce="${opts.nonce}"` : ''
  return `<script${nonce}>window.${varName}=${serializeBootstrap(payload)}</script>`
}

/**
 * Read a bootstrap payload previously embedded with bootstrapScriptTag.
 * Returns the payload object, or null if absent.
 *
 * @param {string} [varName]
 * @param {any} [win] Window-like object (defaults to globalThis).
 */
export function readBootstrap(varName = DEFAULT_VAR_NAME, win = globalThis) {
  if (!win || typeof win !== 'object') return null
  return win[varName] ?? null
}

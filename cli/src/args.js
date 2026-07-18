// Minimal, dependency-free argument parser for the `checkgate` CLI.

const ALIASES = { l: 'lang', o: 'out', u: 'url', e: 'env', t: 'token', i: 'input', h: 'help' }
const BOOLEAN_FLAGS = new Set(['help', 'version'])

/**
 * Parse argv (without the leading `node` / script entries) into
 * `{ command, options }`. Supports `--flag value`, `--flag=value`, short
 * aliases, and boolean flags (`--help`, `--version`).
 */
export function parseArgs(argv) {
  const options = {}
  let command = null
  const positional = []

  for (let i = 0; i < argv.length; i++) {
    let arg = argv[i]
    if (!arg.startsWith('-')) {
      if (command === null) command = arg
      else positional.push(arg)
      continue
    }

    let key = arg.replace(/^-+/, '')
    let value

    const eq = key.indexOf('=')
    if (eq !== -1) {
      value = key.slice(eq + 1)
      key = key.slice(0, eq)
    }

    key = ALIASES[key] ?? key

    if (BOOLEAN_FLAGS.has(key)) {
      options[key] = true
      continue
    }

    if (value === undefined) {
      const next = argv[i + 1]
      if (next === undefined || next.startsWith('-')) {
        // A lone `--flag` with no value: treat as boolean true.
        options[key] = true
        continue
      }
      value = next
      i++
    }
    options[key] = value
  }

  return { command, options, positional }
}

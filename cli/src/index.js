// Orchestrates the `checkgate` CLI: parse args, load flags, generate code, write.

import { writeFile, mkdir } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { parseArgs } from './args.js'
import { loadFlags } from './source.js'
import { normalizeFlags } from './util.js'
import { generate, resolveLang, LANG_EXT, SUPPORTED_LANGS } from './generate.js'

const VERSION = '0.1.20'

const HELP = `checkgate — type-safe flag accessors from your Checkgate flags

Usage:
  checkgate typegen --lang <langs> [options]

Languages (comma-separated for more than one):
  ts | typescript, dart, rust | rs

Source (choose one):
  --input, -i <file>     Read flags from a local JSON file (a /flags export)
  --url, -u <url>        Checkgate server base URL        (env: CHECKGATE_URL)
  --env, -e <env-id>     Environment id to read flags from (env: CHECKGATE_ENV)
  --token, -t <token>    Personal access token / SDK key   (env: CHECKGATE_TOKEN)

Output:
  --out, -o <file>       Write to a file (single language). Omit to print to stdout.
  --out-dir <dir>        Write flags.<ext> per language (required for multiple languages).

Other:
  --help, -h             Show this help
  --version              Show version

Examples:
  checkgate typegen --lang ts --url http://localhost:3000 --env <id> --token <pat> -o flags.ts
  checkgate typegen --lang ts,dart,rust --input flags.json --out-dir ./generated
  CHECKGATE_URL=... CHECKGATE_ENV=... CHECKGATE_TOKEN=... checkgate typegen -l rust
`

function optWithEnv(options, key, envKey) {
  return options[key] ?? process.env[envKey]
}

/** Run the CLI. Returns an exit code; throws only on programmer error. */
export async function run(argv) {
  const { command, options } = parseArgs(argv)

  if (options.version) {
    process.stdout.write(`${VERSION}\n`)
    return 0
  }
  if (options.help || !command) {
    process.stdout.write(HELP)
    return command ? 0 : 1
  }

  if (command !== 'typegen') {
    process.stderr.write(`Unknown command: ${command}\n\n${HELP}`)
    return 1
  }

  // Resolve languages.
  const langNames = String(options.lang ?? '').split(',').map(s => s.trim()).filter(Boolean)
  if (langNames.length === 0) {
    process.stderr.write('Error: --lang is required (ts, dart, rust — comma-separated for more).\n')
    return 1
  }
  const langs = []
  for (const name of langNames) {
    const lang = resolveLang(name)
    if (!lang) {
      process.stderr.write(`Error: unsupported language "${name}". Supported: ${SUPPORTED_LANGS.join(', ')}.\n`)
      return 1
    }
    langs.push(lang)
  }

  if (langs.length > 1 && !options['out-dir']) {
    process.stderr.write('Error: generating multiple languages requires --out-dir.\n')
    return 1
  }

  // Load + normalize flags.
  const source = {
    input: options.input,
    url: optWithEnv(options, 'url', 'CHECKGATE_URL'),
    env: optWithEnv(options, 'env', 'CHECKGATE_ENV'),
    token: optWithEnv(options, 'token', 'CHECKGATE_TOKEN'),
  }
  const raw = await loadFlags(source)
  const flags = normalizeFlags(raw)
  const sourceLabel = source.input ? source.input : `${source.url} (env ${source.env})`
  const meta = { source: sourceLabel, count: flags.length }

  // Generate + write.
  for (const lang of langs) {
    const code = generate(lang, flags, meta)
    if (options['out-dir']) {
      const file = join(options['out-dir'], `flags.${LANG_EXT[lang]}`)
      await mkdir(dirname(file), { recursive: true })
      await writeFile(file, code)
      process.stderr.write(`Wrote ${flags.length} flag(s) → ${file}\n`)
    } else if (options.out) {
      await mkdir(dirname(options.out), { recursive: true })
      await writeFile(options.out, code)
      process.stderr.write(`Wrote ${flags.length} flag(s) → ${options.out}\n`)
    } else {
      process.stdout.write(code)
    }
  }

  return 0
}

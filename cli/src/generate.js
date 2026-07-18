// Language dispatch for code generation.

import { generate as ts } from './generators/typescript.js'
import { generate as dart } from './generators/dart.js'
import { generate as rust } from './generators/rust.js'

const GENERATORS = { typescript: ts, dart, rust }

/** Canonical language name from a user-supplied alias, or null if unknown. */
export function resolveLang(name) {
  const n = String(name || '').toLowerCase()
  if (n === 'ts' || n === 'typescript') return 'typescript'
  if (n === 'dart') return 'dart'
  if (n === 'rs' || n === 'rust') return 'rust'
  return null
}

export const LANG_EXT = { typescript: 'ts', dart: 'dart', rust: 'rs' }

export const SUPPORTED_LANGS = Object.keys(GENERATORS)

/** Run a single language generator against normalized flags. */
export function generate(lang, flags, meta) {
  const gen = GENERATORS[lang]
  if (!gen) throw new Error(`Unsupported language: ${lang}`)
  return gen(flags, meta)
}

#!/usr/bin/env node
import { run } from '../src/index.js'

run(process.argv.slice(2))
  .then(code => process.exit(code))
  .catch(err => {
    process.stderr.write(`Error: ${err && err.message ? err.message : err}\n`)
    process.exit(1)
  })

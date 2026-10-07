// <dist>/inject.js is loaded by the media server's page by a fixed URL; it must be one
// standalone file. A shared chunk (an `import` in it) means something imported
// src/inject/* from another entry — copy the constant instead (see player/params.ts).
// Usage: node scripts/check-inject.mjs [dist dir, default dist]
import { readFileSync } from 'node:fs'

const file = `${process.argv[2] ?? 'dist'}/inject.js`
const code = readFileSync(file, 'utf8')
if (/\bimport\s*[{*("'\w]/.test(code) || /\bexport\b/.test(code)) {
  console.error(`${file} is not standalone (contains import/export)`)
  process.exit(1)
}

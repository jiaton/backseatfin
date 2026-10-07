// dist/inject.js is loaded by Emby's page by a fixed URL; it must be one standalone
// file. A shared chunk (an `import` in it) means something imported src/inject/* from
// another entry — copy the constant instead (see features/player/lib/params.ts).
import { readFileSync } from 'node:fs'

const code = readFileSync('dist/inject.js', 'utf8')
if (/\bimport\s*[{*("'\w]/.test(code) || /\bexport\b/.test(code)) {
  console.error('dist/inject.js is not standalone (contains import/export)')
  process.exit(1)
}

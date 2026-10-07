// Token discipline for TSX (stylelint only sees .css): no raw hex colors and no raw
// Tailwind palette classes outside src/index.css — use the theme tokens instead
// (bg-primary, text-muted-foreground, text-status-good, ...). See AGENTS.md "Styling".
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

const PALETTE =
  /\b(?:bg|text|border|ring|fill|stroke|from|to|via|outline|decoration|shadow|accent|caret)-(?:slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)-\d{2,3}\b/
const HEX = /#[0-9a-fA-F]{3,8}\b/
const ARBITRARY_COLOR = /\b(?:bg|text|border|fill|stroke)-\[(?:#|rgb|hsl|oklch)/

function* walk(dir) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) yield* walk(p)
    else if (/\.(tsx?|jsx?)$/.test(name) && !name.endsWith('.d.ts')) yield p
  }
}

let bad = 0
for (const file of walk('src')) {
  readFileSync(file, 'utf8')
    .split('\n')
    .forEach((line, i) => {
      for (const [re, what] of [[PALETTE, 'raw palette class'], [HEX, 'raw hex color'], [ARBITRARY_COLOR, 'arbitrary color']]) {
        const m = line.match(re)
        if (m) {
          console.error(`${file}:${i + 1}: ${what} "${m[0]}" — use a theme token`)
          bad++
        }
      }
    })
}
process.exit(bad ? 1 : 0)

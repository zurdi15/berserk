// Genera un SVG independiente por cada runa del catálogo (docs/assets/runes/
// <nombre>.svg): reutilizables fuera de la app (documentación, edición
// manual, referencia visual) sin tener que levantar Vue para verlas. Mismas
// convenciones que BkRune.vue (viewBox 32×32, stroke-width 2, linecap
// square) para que lo exportado sea un calco fiel de lo que la app pinta.
//
// El hex y el fondo transparente son literales A PROPÓSITO: docs/assets/
// queda fuera de src/, así que scripts/guard-tokens.sh no lo toca — un
// asset generado y consumido fuera de la app no tiene por qué pasar por el
// sistema de tokens (que existe para disciplinar el código fuente, no los
// artefactos derivados).
import { mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const AURORA = '#4FD8C4'

const here = dirname(fileURLToPath(import.meta.url))
const { RUNES } = await import(resolve(here, '../src/lib/runes.ts'))
const outDir = resolve(here, '../../docs/assets/runes')

function svgFor(pathData) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" fill="none">
  <path d="${pathData}" stroke="${AURORA}" stroke-width="2" stroke-linecap="square"/>
</svg>
`
}

// limpiar antes de regenerar: si una runa se renombra o se borra del
// diccionario, su SVG viejo no debe sobrevivir huérfano en el directorio
rmSync(outDir, { recursive: true, force: true })
mkdirSync(outDir, { recursive: true })

for (const [name, pathData] of Object.entries(RUNES)) {
  writeFileSync(resolve(outDir, `${name}.svg`), svgFor(pathData))
}

// autocomprobación: todas las claves de RUNES deben haber producido un
// fichero con un path no vacío — si esto falla, algo en el import de arriba
// o en el propio catálogo está roto, y mejor que reviente aquí (con
// process.exit) que generar SVGs a medias en silencio
const runeNames = Object.keys(RUNES)
const written = new Set(readdirSync(outDir).map((f) => f.replace(/\.svg$/, '')))
const missing = runeNames.filter((name) => !written.has(name))
const empty = runeNames.filter((name) => !RUNES[name] || RUNES[name].trim() === '')

if (missing.length > 0 || empty.length > 0) {
  if (missing.length > 0) console.error(`✗ generate-rune-svgs: faltan ficheros para: ${missing.join(', ')}`)
  if (empty.length > 0) console.error(`✗ generate-rune-svgs: paths vacíos en RUNES: ${empty.join(', ')}`)
  process.exit(1)
}

console.log(`✓ generate-rune-svgs — ${runeNames.length} SVGs escritos en docs/assets/runes/`)

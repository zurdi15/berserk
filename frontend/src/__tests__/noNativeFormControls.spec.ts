// @vitest-environment node

// Round 7: en Android, <select>/<input type="date|time"> abren el picker
// nativo del SO — fuera de la estética del sistema de diseño. Este test
// recorre TODO src/ y falla si algún consumidor reintroduce uno de estos
// controles en vez de usar BkSelect/BkDateField/BkTimeField.
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const SRC_DIR = fileURLToPath(new URL('..', import.meta.url))

// las propias primitivas están exentas: son el reemplazo sancionado, y sus
// comentarios explicativos mencionan literalmente lo que sustituyen
// ("Reemplaza <input type=\"time\">...") — no son un uso real del control
const EXEMPT = ['/lib/BkSelect.vue', '/lib/BkDateField.vue', '/lib/BkTimeField.vue']

function isExempt(path: string): boolean {
  return EXEMPT.some((suffix) => path.endsWith(suffix))
}

function walkVueFiles(dir: string): string[] {
  let files: string[] = []
  for (const entry of readdirSync(dir)) {
    const full = `${dir}/${entry}`
    const stats = statSync(full)
    if (stats.isDirectory()) {
      if (entry === '__tests__' || entry === 'node_modules') continue
      files = files.concat(walkVueFiles(full))
    } else if (full.endsWith('.vue')) {
      files.push(full)
    }
  }
  return files
}

describe('no native OS form pickers left in src/ (round 7: form primitives)', () => {
  const files = walkVueFiles(SRC_DIR).filter((f) => !isExempt(f))

  it('no literal <select> element anywhere outside BkSelect.vue itself', () => {
    const offenders = files.filter((f) => /<select[\s>]/.test(readFileSync(f, 'utf-8')))
    expect(offenders).toEqual([])
  })

  it('no literal type="date" attribute anywhere outside BkDateField.vue itself', () => {
    const offenders = files.filter((f) => /type="date"/.test(readFileSync(f, 'utf-8')))
    expect(offenders).toEqual([])
  })

  it('no literal type="time" attribute anywhere outside BkTimeField.vue itself', () => {
    const offenders = files.filter((f) => /type="time"/.test(readFileSync(f, 'utf-8')))
    expect(offenders).toEqual([])
  })
})

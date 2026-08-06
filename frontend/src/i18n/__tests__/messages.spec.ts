import { readFileSync, readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { describe, expect, it } from 'vitest'

import { en } from '../en'
import { es } from '../es'

function flatten(obj: Record<string, unknown>, prefix = ''): string[] {
  return Object.entries(obj).flatMap(([key, value]) =>
    typeof value === 'object' && value !== null
      ? flatten(value as Record<string, unknown>, `${prefix}${key}.`)
      : [`${prefix}${key}`],
  )
}

// la lista de slugs vive en el código del backend: si aparece un detail nuevo
// sin clave errors.*, este test debe fallar sin que nadie recuerde ampliarlo
const backendDir = join(dirname(fileURLToPath(import.meta.url)), '../../../../backend/app')
function backendSlugs(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true, recursive: true })
    .filter((e) => e.isFile() && e.name.endsWith('.py'))
    .flatMap((e) => [...readFileSync(join(e.parentPath, e.name), 'utf8').matchAll(/detail="([a-z_]+)"/g)].map((m) => m[1]))
}

describe('i18n messages', () => {
  it('es and en share the exact same key tree', () => {
    expect(flatten(es).sort()).toEqual(flatten(en).sort())
  })

  it('covers every backend error slug plus generic fallback', () => {
    const keys = flatten(es)
    const slugs = [...new Set(backendSlugs(backendDir))]
    // guarda contra una ruta rota a backendDir: sin esto, 0 slugs encontrados
    // dejaría el test comprobando solo 'generic' y pasando en falso
    expect(slugs.length).toBeGreaterThan(20)
    for (const slug of [...slugs, 'generic']) {
      expect(keys).toContain(`errors.${slug}`)
    }
  })
})

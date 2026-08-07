import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { UserOut } from '@/api/auth'
import { useAthleteStore } from '../athlete'

const freyja: UserOut = { id: 7, username: 'freyja', is_admin: false, locale: 'es', units: 'kg', timezone: 'UTC', color: '#7C8FFF' }

// entorno de este repo: el localStorage global es un stub roto de Node
// (--localstorage-file sin ruta válida) sin métodos reales — ni happy-dom lo
// sustituye. Mismo mock en memoria que uiPrefs.spec.ts para poder probar la
// persistencia de verdad, no solo la degradación a "sin persistir".
function mockStorage(): Storage {
  const store = new Map<string, string>()
  return {
    getItem: (key: string) => (store.has(key) ? store.get(key)! : null),
    setItem: (key: string, value: string) => { store.set(key, value) },
    removeItem: (key: string) => { store.delete(key) },
    clear: () => { store.clear() },
    key: (index: number) => Array.from(store.keys())[index] ?? null,
    get length() { return store.size },
  } as Storage
}

describe('athlete store', () => {
  beforeEach(() => setActivePinia(createPinia()))

  it('exposes user_id only while viewing someone else', () => {
    const store = useAthleteStore()
    expect(store.userId).toBeUndefined()
    expect(store.isViewing).toBe(false)
    store.view(freyja)
    expect(store.userId).toBe(7)
    expect(store.isViewing).toBe(true)
    store.clear()
    expect(store.userId).toBeUndefined()
  })

  // el color del atleta viaja tal cual desde UserOut hasta el store: el
  // dot del calendario lo consume vía athlete.viewing?.color (ver MonthGrid)
  it('carries the viewed athlete color through untouched', () => {
    const store = useAthleteStore()
    store.view(freyja)
    expect(store.viewing?.color).toBe('#7C8FFF')
  })

  // item 4 (v0.4.0, ROOT CAUSE del bug real: "en el calendario no veo los
  // dots de otro user al que le he compartido y me ha compartido"). Ni el
  // backend (calendar.py ya filtraba scheduled Y workouts por target.id) ni
  // el hilo de athlete.userId hacia getMonth estaban rotos — reproducido en
  // vivo (dos usuarios, grant mutuo, navegador real) los dots SÍ aparecían
  // justo tras elegir "ver" a alguien. Lo que no sobrevivía era este store:
  // `viewing` solo vivía en memoria, así que cualquier recarga completa (F5,
  // o el móvil evictando la PWA en segundo plano — el mismo caso que ya
  // forzó a persistir el countdown de cardio) la perdía en silencio: el
  // banner "Viendo a X" desaparecía y el calendario volvía a pintar los
  // datos PROPIOS del viewer sin avisar — si ese mes no tenía nada propio,
  // se veía literalmente sin dots.
  describe('persistence across a reload (localStorage)', () => {
    afterEach(() => vi.unstubAllGlobals())

    it('a fresh store instance rehydrates who was being viewed', () => {
      vi.stubGlobal('localStorage', mockStorage())
      const first = useAthleteStore()
      first.view(freyja)

      // simula una recarga: Pinia se recrea entera, localStorage (mockeado
      // arriba) es el mismo backing store, como sobreviviría de verdad
      setActivePinia(createPinia())
      const afterReload = useAthleteStore()
      expect(afterReload.userId).toBe(7)
      expect(afterReload.isViewing).toBe(true)
      expect(afterReload.viewing?.username).toBe('freyja')
    })

    it('clear() also wipes the persisted athlete, so a reload after "dejar de ver" stays cleared', () => {
      vi.stubGlobal('localStorage', mockStorage())
      const first = useAthleteStore()
      first.view(freyja)
      first.clear()

      setActivePinia(createPinia())
      const afterReload = useAthleteStore()
      expect(afterReload.isViewing).toBe(false)
      expect(afterReload.userId).toBeUndefined()
    })

    it('persists under a namespaced key, verbatim', () => {
      const storage = mockStorage()
      vi.stubGlobal('localStorage', storage)
      useAthleteStore().view(freyja)
      expect(JSON.parse(storage.getItem('berserk:athlete-viewing')!)).toEqual(freyja)
    })

    it('degrades to "viewing nobody" instead of throwing on a malformed (non-JSON) stored value', () => {
      const storage = mockStorage()
      storage.setItem('berserk:athlete-viewing', 'not even json')
      vi.stubGlobal('localStorage', storage)

      expect(() => useAthleteStore()).not.toThrow()
      expect(useAthleteStore().isViewing).toBe(false)
    })

    it('degrades to "viewing nobody" instead of throwing on a well-formed-but-wrong-shaped stored value', () => {
      const storage = mockStorage()
      storage.setItem('berserk:athlete-viewing', JSON.stringify({ foo: 'bar' }))
      vi.stubGlobal('localStorage', storage)

      expect(useAthleteStore().isViewing).toBe(false)
    })

    it('degrades silently instead of throwing when localStorage is blocked entirely', () => {
      vi.stubGlobal('localStorage', {
        getItem: () => { throw new Error('blocked') },
        setItem: () => { throw new Error('blocked') },
        removeItem: () => { throw new Error('blocked') },
      })

      expect(() => useAthleteStore()).not.toThrow()
      const store = useAthleteStore()
      expect(() => store.view(freyja)).not.toThrow()
      // el estado en memoria sigue funcionando aunque no persista
      expect(store.userId).toBe(7)
      expect(() => store.clear()).not.toThrow()
    })
  })
})

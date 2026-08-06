import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { getRestAutoEnabled, setRestAutoEnabled } from '../uiPrefs'

// entorno de este repo: el localStorage global es un stub roto de Node
// (--localstorage-file sin ruta válida, ver el warning en cada test run) sin
// ningún método real — ni happy-dom lo sustituye. Se sustituye por un mock
// en memoria real vía vi.stubGlobal para poder probar la persistencia de
// verdad, no solo la degradación a default (que es lo único que se ejercita
// contra el stub roto).
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

describe('uiPrefs: rest-auto preference', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('defaults to true (opt-OUT, not opt-in) when nothing was persisted yet', () => {
    vi.stubGlobal('localStorage', mockStorage())
    expect(getRestAutoEnabled()).toBe(true)
  })

  it('setRestAutoEnabled persists the value under a namespaced key, and getRestAutoEnabled reads it back', () => {
    vi.stubGlobal('localStorage', mockStorage())

    setRestAutoEnabled(false)
    expect(localStorage.getItem('berserk:rest-auto-enabled')).toBe('false')
    expect(getRestAutoEnabled()).toBe(false)

    setRestAutoEnabled(true)
    expect(localStorage.getItem('berserk:rest-auto-enabled')).toBe('true')
    expect(getRestAutoEnabled()).toBe(true)
  })

  it('survives a reload: a fresh read against the same backing store still sees a value written earlier', () => {
    const storage = mockStorage()
    vi.stubGlobal('localStorage', storage)
    setRestAutoEnabled(false)

    // "recarga": nada en memoria del lado de la app, solo lo que quedó en el
    // mismo storage — simula reabrir la pestaña
    vi.stubGlobal('localStorage', storage)
    expect(getRestAutoEnabled()).toBe(false)
  })

  it('degrades to the true default instead of throwing when localStorage.getItem fails', () => {
    vi.stubGlobal('localStorage', {
      getItem: () => { throw new Error('blocked') },
      setItem: () => {},
    })
    expect(getRestAutoEnabled()).toBe(true)
  })

  it('degrades silently instead of throwing when localStorage.setItem fails', () => {
    vi.stubGlobal('localStorage', {
      getItem: () => null,
      setItem: () => { throw new Error('quota exceeded') },
    })
    expect(() => setRestAutoEnabled(false)).not.toThrow()
  })
})

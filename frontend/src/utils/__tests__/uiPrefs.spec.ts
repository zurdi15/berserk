import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  clearPersistedCardioCountdown,
  getPersistedCardioCountdown,
  getRestAutoEnabled,
  getThemeMode,
  setPersistedCardioCountdown,
  setRestAutoEnabled,
  setThemeMode,
} from '../uiPrefs'

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

// v0.3.2 CARDIO-COUNTDOWN PERSISTENCE: mismo patrón exacto (namespaced key,
// try/catch degradado) que rest-auto, pero para un único countdown de cardio
// en curso — a diferencia de rest-auto, este pref no tiene un default
// significativo (nada corriendo = null), así que además de get/set hace
// falta un clear explícito.
describe('uiPrefs: persisted cardio countdown', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('returns null when nothing was persisted yet', () => {
    vi.stubGlobal('localStorage', mockStorage())
    expect(getPersistedCardioCountdown()).toBeNull()
  })

  it('setPersistedCardioCountdown persists under a namespaced key, and getPersistedCardioCountdown reads it back verbatim', () => {
    vi.stubGlobal('localStorage', mockStorage())
    const value = { endsAt: 1_754_000_000_000, workoutId: 1, workoutExerciseId: 20, targetSeconds: 1800, distanceM: 5000 }

    setPersistedCardioCountdown(value)

    expect(localStorage.getItem('berserk:cardio-countdown')).toBe(JSON.stringify(value))
    expect(getPersistedCardioCountdown()).toEqual(value)
  })

  it('distanceM is optional: round-trips fine when omitted', () => {
    vi.stubGlobal('localStorage', mockStorage())
    const value = { endsAt: 1_754_000_000_000, workoutId: 1, workoutExerciseId: 20, targetSeconds: 60 }

    setPersistedCardioCountdown(value)

    expect(getPersistedCardioCountdown()).toEqual(value)
  })

  it('clearPersistedCardioCountdown removes it — a later get sees null again', () => {
    vi.stubGlobal('localStorage', mockStorage())
    setPersistedCardioCountdown({ endsAt: 1, workoutId: 1, workoutExerciseId: 20, targetSeconds: 60 })

    clearPersistedCardioCountdown()

    expect(getPersistedCardioCountdown()).toBeNull()
  })

  it('degrades to null instead of throwing on corrupted (non-JSON) stored content', () => {
    const storage = mockStorage()
    storage.setItem('berserk:cardio-countdown', 'not json{')
    vi.stubGlobal('localStorage', storage)

    expect(getPersistedCardioCountdown()).toBeNull()
  })

  it('degrades to null instead of throwing on a well-formed-but-wrong-shaped stored value (foreign/stale data)', () => {
    const storage = mockStorage()
    storage.setItem('berserk:cardio-countdown', JSON.stringify({ foo: 'bar' }))
    vi.stubGlobal('localStorage', storage)

    expect(getPersistedCardioCountdown()).toBeNull()
  })

  it('degrades to null instead of throwing when localStorage.getItem fails', () => {
    vi.stubGlobal('localStorage', {
      getItem: () => { throw new Error('blocked') },
      setItem: () => {},
    })
    expect(getPersistedCardioCountdown()).toBeNull()
  })

  it('degrades silently instead of throwing when localStorage.setItem fails', () => {
    vi.stubGlobal('localStorage', {
      getItem: () => null,
      setItem: () => { throw new Error('quota exceeded') },
    })
    expect(() =>
      setPersistedCardioCountdown({ endsAt: 1, workoutId: 1, workoutExerciseId: 20, targetSeconds: 60 }),
    ).not.toThrow()
  })

  it('degrades silently instead of throwing when localStorage.removeItem fails', () => {
    vi.stubGlobal('localStorage', {
      getItem: () => null,
      removeItem: () => { throw new Error('blocked') },
    })
    expect(() => clearPersistedCardioCountdown()).not.toThrow()
  })
})

// v0.4.0 LIGHT THEME: mismo patrón try/catch degradado, pero con un enum
// validado (dark/light/system) en vez de un booleano o un shape libre — un
// valor corrupto o de una versión ajena debe caer a 'system', nunca colarse tal cual
describe('uiPrefs: theme mode', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('defaults to "system" when nothing was persisted yet', () => {
    vi.stubGlobal('localStorage', mockStorage())
    expect(getThemeMode()).toBe('system')
  })

  it('setThemeMode persists under a namespaced key, and getThemeMode reads it back', () => {
    vi.stubGlobal('localStorage', mockStorage())

    setThemeMode('light')
    expect(localStorage.getItem('berserk:theme')).toBe('light')
    expect(getThemeMode()).toBe('light')

    setThemeMode('dark')
    expect(getThemeMode()).toBe('dark')

    setThemeMode('system')
    expect(getThemeMode()).toBe('system')
  })

  it('survives a reload: a fresh read against the same backing store still sees the persisted mode', () => {
    const storage = mockStorage()
    vi.stubGlobal('localStorage', storage)
    setThemeMode('light')

    vi.stubGlobal('localStorage', storage)
    expect(getThemeMode()).toBe('light')
  })

  it('falls back to "system" instead of trusting a corrupted/foreign stored value (stale shape from another key, or garbage)', () => {
    const storage = mockStorage()
    storage.setItem('berserk:theme', 'sepia')
    vi.stubGlobal('localStorage', storage)

    expect(getThemeMode()).toBe('system')
  })

  it('degrades to "system" instead of throwing when localStorage.getItem fails', () => {
    vi.stubGlobal('localStorage', {
      getItem: () => { throw new Error('blocked') },
      setItem: () => {},
    })
    expect(getThemeMode()).toBe('system')
  })

  it('degrades silently instead of throwing when localStorage.setItem fails', () => {
    vi.stubGlobal('localStorage', {
      getItem: () => null,
      setItem: () => { throw new Error('quota exceeded') },
    })
    expect(() => setThemeMode('light')).not.toThrow()
  })
})

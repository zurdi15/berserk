import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { applyTheme, initTheme, resolveIsLight, setTheme } from '../theme'

// mismo stub roto de localStorage que uiPrefs.spec.ts documenta: el global
// de este entorno no tiene métodos reales, así que las pruebas que pasan por
// getThemeMode/setThemeMode (initTheme, setTheme) necesitan un mock en
// memoria de verdad.
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

// fake MediaQueryList: soporta addEventListener/removeEventListener('change')
// de verdad (a diferencia del `{ matches } as MediaQueryList` que basta para
// los tests que solo LEEN matches una vez) y expone setMatches() para
// disparar el evento 'change' a mano, como haría el SO real al cambiar de
// tema mientras la pestaña sigue abierta.
function makeMql(initialMatches: boolean) {
  let matches = initialMatches
  const listeners = new Set<() => void>()
  const mql = {
    get matches() { return matches },
    addEventListener: vi.fn((_event: string, cb: () => void) => { listeners.add(cb) }),
    removeEventListener: vi.fn((_event: string, cb: () => void) => { listeners.delete(cb) }),
  } as unknown as MediaQueryList
  return {
    mql,
    setMatches(next: boolean) {
      matches = next
      listeners.forEach((cb) => cb())
    },
    listenerCount: () => listeners.size,
  }
}

function setThemeColorMeta(content: string) {
  document.head.innerHTML = `<meta name="theme-color" content="${content}">`
}

// applyTheme relee --bk-bg-void del DOM en vez de hardcodear su hex (el
// guard de tokens lo prohibiría) — en el entorno de test no hay ninguna hoja
// de estilos real cargada (mismo motivo documentado en chartColors.spec.ts),
// así que se simula el efecto de tokens.css escribiendo el custom property
// directamente como estaría YA RESUELTO tras el toggle de clase real
function stubVoidToken(hex: string) {
  document.documentElement.style.setProperty('--bk-bg-void', hex)
}

describe('utils/theme: resolveIsLight (pure)', () => {
  afterEach(() => vi.restoreAllMocks())

  it('"dark" is never light, regardless of system preference', () => {
    vi.spyOn(window, 'matchMedia').mockReturnValue(makeMql(true).mql)
    expect(resolveIsLight('dark')).toBe(false)
  })

  it('"light" is always light, regardless of system preference', () => {
    vi.spyOn(window, 'matchMedia').mockReturnValue(makeMql(false).mql)
    expect(resolveIsLight('light')).toBe(true)
  })

  it('"system" follows matchMedia(prefers-color-scheme: light)', () => {
    vi.spyOn(window, 'matchMedia').mockReturnValue(makeMql(true).mql)
    expect(resolveIsLight('system')).toBe(true)

    vi.spyOn(window, 'matchMedia').mockReturnValue(makeMql(false).mql)
    expect(resolveIsLight('system')).toBe(false)
  })

  it('"system" without matchMedia support falls back to dark instead of throwing', () => {
    vi.stubGlobal('matchMedia', undefined)
    expect(resolveIsLight('system')).toBe(false)
    vi.unstubAllGlobals()
  })
})

describe('utils/theme: applyTheme (DOM)', () => {
  beforeEach(() => setThemeColorMeta('#000000'))
  afterEach(() => {
    document.documentElement.classList.remove('bk-light')
    document.documentElement.style.removeProperty('--bk-bg-void')
    document.head.innerHTML = ''
    vi.restoreAllMocks()
  })

  it('adds html.bk-light for "light"', () => {
    applyTheme('light')
    expect(document.documentElement.classList.contains('bk-light')).toBe(true)
  })

  it('removes html.bk-light for "dark"', () => {
    document.documentElement.classList.add('bk-light')
    applyTheme('dark')
    expect(document.documentElement.classList.contains('bk-light')).toBe(false)
  })

  it('writes whatever --bk-bg-void currently resolves to onto the theme-color meta (never a hardcoded hex — the guard forbids raw hex outside tokens/index.ts)', () => {
    stubVoidToken('#ABCDEF')
    applyTheme('dark')
    expect(document.querySelector('meta[name="theme-color"]')!.getAttribute('content')).toBe('#ABCDEF')
  })

  it('re-reads --bk-bg-void AFTER toggling the class, so it reflects whatever tokens.css cascades to for the resolved theme (not a stale value from before the toggle)', () => {
    stubVoidToken('#111111')
    applyTheme('dark')
    expect(document.querySelector('meta[name="theme-color"]')!.getAttribute('content')).toBe('#111111')

    stubVoidToken('#EEEEEE')
    applyTheme('light')
    expect(document.querySelector('meta[name="theme-color"]')!.getAttribute('content')).toBe('#EEEEEE')
  })

  it('"system" resolves against the live matchMedia result', () => {
    vi.spyOn(window, 'matchMedia').mockReturnValue(makeMql(true).mql)
    applyTheme('system')
    expect(document.documentElement.classList.contains('bk-light')).toBe(true)
  })

  it('never throws if the theme-color meta tag is missing (degrades silently)', () => {
    document.head.innerHTML = ''
    expect(() => applyTheme('light')).not.toThrow()
  })

  it('never throws and leaves the meta untouched if --bk-bg-void has no resolved value (e.g. tokens.css not loaded yet)', () => {
    expect(() => applyTheme('light')).not.toThrow()
    expect(document.querySelector('meta[name="theme-color"]')!.getAttribute('content')).toBe('#000000')
  })

  it('dispatches a global bk:theme-change event, for canvas-painted consumers (BkChart) that CSS cascades cannot reach', () => {
    const handler = vi.fn()
    window.addEventListener('bk:theme-change', handler)
    applyTheme('dark')
    expect(handler).toHaveBeenCalledTimes(1)
    window.removeEventListener('bk:theme-change', handler)
  })
})

describe('utils/theme: initTheme / setTheme (system-listener lifecycle)', () => {
  beforeEach(() => {
    setThemeColorMeta('#0A0C0F')
    vi.stubGlobal('localStorage', mockStorage())
  })
  afterEach(() => {
    document.documentElement.classList.remove('bk-light')
    document.head.innerHTML = ''
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('initTheme reads the persisted mode and applies it', () => {
    localStorage.setItem('berserk:theme', 'light')
    initTheme()
    expect(document.documentElement.classList.contains('bk-light')).toBe(true)
  })

  it('initTheme with a persisted "system" mode subscribes to matchMedia and reacts to a later change event', () => {
    const { mql, setMatches } = makeMql(false)
    vi.spyOn(window, 'matchMedia').mockReturnValue(mql)
    localStorage.setItem('berserk:theme', 'system')

    initTheme()
    expect(document.documentElement.classList.contains('bk-light')).toBe(false)

    // el SO cambia de oscuro a claro con la pestaña ya abierta
    setMatches(true)
    expect(document.documentElement.classList.contains('bk-light')).toBe(true)
  })

  it('initTheme with a persisted non-"system" mode does NOT subscribe to matchMedia (no listener to react to a system change)', () => {
    const { mql, listenerCount } = makeMql(false)
    vi.spyOn(window, 'matchMedia').mockReturnValue(mql)
    localStorage.setItem('berserk:theme', 'dark')

    initTheme()

    expect(listenerCount()).toBe(0)
  })

  it('setTheme persists the new mode so a later getThemeMode/initTheme sees it', () => {
    setTheme('light')
    expect(localStorage.getItem('berserk:theme')).toBe('light')
  })

  it('setTheme applies immediately (no reload needed to see the toggle take effect)', () => {
    setTheme('light')
    expect(document.documentElement.classList.contains('bk-light')).toBe(true)
    setTheme('dark')
    expect(document.documentElement.classList.contains('bk-light')).toBe(false)
  })

  it('switching AWAY from "system" tears down the old matchMedia listener (no leak, no stale reaction to a system change after opting out)', () => {
    const { mql, setMatches, listenerCount } = makeMql(false)
    vi.spyOn(window, 'matchMedia').mockReturnValue(mql)

    setTheme('system')
    expect(listenerCount()).toBe(1)

    setTheme('dark')
    expect(listenerCount()).toBe(0)

    // si quedara un listener colgado, esto forzaría bk-light pese al modo 'dark' explícito
    setMatches(true)
    expect(document.documentElement.classList.contains('bk-light')).toBe(false)
  })

  it('calling setTheme("system") repeatedly never accumulates more than one listener', () => {
    const { mql, listenerCount } = makeMql(false)
    vi.spyOn(window, 'matchMedia').mockReturnValue(mql)

    setTheme('system')
    setTheme('system')
    setTheme('system')

    expect(listenerCount()).toBe(1)
  })
})

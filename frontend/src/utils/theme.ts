// v0.4.0 LIGHT THEME: aplica la preferencia de tema (uiPrefs.ThemeMode) al
// documento en runtime. El guard contra el flash inicial vive aparte, en el
// script inline de index.html (tiene que correr ANTES de que este módulo
// siquiera se parsee) — este archivo es el que mantiene el estado correcto
// una vez la app ya está viva: toggles desde SettingsCard y cambios en vivo
// del tema del sistema operativo mientras mode === 'system'.
import { getThemeMode, setThemeMode, type ThemeMode } from './uiPrefs'

const MEDIA_QUERY = '(prefers-color-scheme: light)'

function systemPrefersLight(): boolean {
  return typeof window !== 'undefined' && typeof window.matchMedia === 'function'
    ? window.matchMedia(MEDIA_QUERY).matches
    : false
}

// exportada para poder testear la resolución sin pasar por el DOM
export function resolveIsLight(mode: ThemeMode): boolean {
  return mode === 'light' || (mode === 'system' && systemPrefersLight())
}

// aplica la clase + el meta theme-color para el modo dado. No toca
// localStorage (eso es cosa de uiPrefs) ni el listener de sistema (eso es
// cosa de watchSystemTheme) — una única responsabilidad, testeable aparte.
export function applyTheme(mode: ThemeMode): void {
  const isLight = resolveIsLight(mode)
  document.documentElement.classList.toggle('bk-light', isLight)

  // el color real lo define tokens.css (--bk-bg-void, distinto bajo :root y
  // bajo html.bk-light) — se RELEE del DOM en vez de hardcodear el hex aquí:
  // el guard de tokens (guard:tokens) prohíbe hex crudo fuera de
  // tokens/index.ts, y a diferencia del script inline de index.html —que
  // corre ANTES de que exista ninguna hoja de estilos, así que ahí sí hace
  // falta duplicar el hex a mano— este módulo se ejecuta con la app ya
  // montada: el custom property siempre está resuelto de verdad, y la
  // reasignación de clase de arriba ya recalculó la cascada de forma
  // síncrona para cuando se lee aquí.
  const meta = document.querySelector('meta[name="theme-color"]')
  const voidColor = getComputedStyle(document.documentElement).getPropertyValue('--bk-bg-void').trim()
  if (meta && voidColor) meta.setAttribute('content', voidColor)

  // BkChart pinta en <canvas> vía uPlot: un cambio de clase en <html> no lo
  // repinta solo (CSS no llega a un canvas). Le avisamos con un evento
  // global en vez de acoplar BkChart a este módulo — cualquier otro
  // consumidor futuro de colores por canvas puede engancharse igual.
  window.dispatchEvent(new Event('bk:theme-change'))
}

let stopWatchingSystem: (() => void) | null = null

function watchSystemTheme(mode: ThemeMode): void {
  stopWatchingSystem?.()
  stopWatchingSystem = null
  if (mode !== 'system' || typeof window.matchMedia !== 'function') return

  const mql = window.matchMedia(MEDIA_QUERY)
  const onChange = () => applyTheme('system')
  mql.addEventListener('change', onChange)
  stopWatchingSystem = () => mql.removeEventListener('change', onChange)
}

// arranque de la app (llamado una vez desde main.ts): aplica lo persistido y
// engancha el listener de sistema si hace falta. El script inline de
// index.html ya dejó la clase/meta correctas antes del primer paint — esto
// es lo que mantiene ambas cosas correctas DESPUÉS, mientras dura la sesión.
export function initTheme(): void {
  const mode = getThemeMode()
  applyTheme(mode)
  watchSystemTheme(mode)
}

// llamado por el picker de Ajustes: persiste + aplica + re-engancha (o
// desengancha) el listener de sistema según el nuevo modo
export function setTheme(mode: ThemeMode): void {
  setThemeMode(mode)
  applyTheme(mode)
  watchSystemTheme(mode)
}

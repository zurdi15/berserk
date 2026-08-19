// v0.21.4 (zurdi: "un splashart mientras se carga todo, así la carga
// inicial es directa y no hay saltos de elementos"): el splash de arranque
// cubre la app mientras prefetchSections calienta el viewCache de todas las
// secciones — la vista de aterrizaje se monta DESPUÉS (ShellView gatea el
// RouterView con bootSplashActive), así que hidrata de caché ya caliente y
// pinta entera de golpe, sin saltos.
//
// Tiempos: un mínimo para que el tallado de la runa no parpadee, y un TOPE
// duro — con red lenta el splash jamás secuestra la app: se retira y cada
// sección carga con su flujo de siempre (el prefetch sigue corriendo detrás
// y deja la caché lista para las demás).
import { ref } from 'vue'

import { prefetchSections } from './prefetchSections'

export const SPLASH_MIN_MS = 700
export const SPLASH_MAX_MS = 2500

export const bootSplashActive = ref(false)

export function runBootSplash(): void {
  bootSplashActive.value = true
  const minShown = new Promise((resolve) => setTimeout(resolve, SPLASH_MIN_MS))
  const prefetchCapped = Promise.race([
    prefetchSections(),
    new Promise((resolve) => setTimeout(resolve, SPLASH_MAX_MS)),
  ])
  void Promise.all([minShown, prefetchCapped]).then(() => {
    bootSplashActive.value = false
  })
}

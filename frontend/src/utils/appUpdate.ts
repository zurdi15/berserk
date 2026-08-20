// v0.37.0 (zurdi: "aunque cargue sigo viendo una versión antigua en el iPhone.
// no sé cómo forzar que cargue de nuevo"): hasta ahora el service worker se
// actualizaba solo (autoUpdate), pero el NUEVO no toma el control hasta que
// muere la última pestaña — y en una PWA instalada en iOS "volver a abrir" es
// traerla del segundo plano, así que la versión vieja podía vivir días. Ahora
// el SW nuevo se queda esperando y la app enseña una banda "Nueva versión ·
// Actualizar" (StatusBanners) que aplica el cambio y recarga, como WhatsApp
// Web. Vale también dentro de la shell Android: el WebView carga este mismo
// bundle del servidor y usa el mismo SW.
import { ref } from 'vue'
import { registerSW } from 'virtual:pwa-register'

// cada cuánto se pregunta al servidor por un sw.js nuevo con la app abierta
// (una PWA que no se cierra nunca jamás repetiría la comprobación del arranque)
const CHECK_INTERVAL_MS = 60 * 60 * 1000

export const updateAvailable = ref(false)

let applyUpdate: ((reload?: boolean) => Promise<void>) | null = null
let started = false

export function initAppUpdate(): void {
  if (started || typeof window === 'undefined' || !('serviceWorker' in navigator)) return
  started = true
  applyUpdate = registerSW({
    immediate: true,
    onNeedRefresh() {
      updateAvailable.value = true
    },
    onRegisteredSW(_url, registration) {
      if (!registration) return
      const check = () => void registration.update().catch(() => {})
      setInterval(check, CHECK_INTERVAL_MS)
      // al volver a la app (iOS la congela en segundo plano): comprobar ya
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') check()
      })
    },
  })
}

// El SW en espera toma el control (skipWaiting + clientsClaim) y la página se
// recarga con el bundle nuevo. Sin SW registrado (dev) solo recarga.
export async function applyAppUpdate(): Promise<void> {
  updateAvailable.value = false
  if (applyUpdate) await applyUpdate(true)
  else window.location.reload()
}

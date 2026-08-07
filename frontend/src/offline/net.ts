import { ref } from 'vue'

// v0.6.0 offline de gimnasio: estado de red observable por toda la app.
// navigator.onLine es OPTIMISTA (wifi sin internet reporta true), así que la
// verdad la fija quien de verdad habla con el servidor: client.ts llama a
// markOffline() cuando un fetch muere por red y a markOnline() con cada
// respuesta real — los eventos online/offline del navegador solo son el
// disparador barato de reintento (recuperar red dispara los callbacks de
// onBackOnline, donde el outbox engancha su replay).
export const online = ref(typeof navigator === 'undefined' ? true : navigator.onLine)

type BackOnlineCallback = () => void
const backOnlineCallbacks = new Set<BackOnlineCallback>()

export function markOffline() {
  online.value = false
}

export function markOnline() {
  const wasOffline = !online.value
  online.value = true
  if (wasOffline) {
    for (const callback of backOnlineCallbacks) callback()
  }
}

// devuelve un dispose para tests; en la app viven lo que vive la sesión
export function onBackOnline(callback: BackOnlineCallback): () => void {
  backOnlineCallbacks.add(callback)
  return () => backOnlineCallbacks.delete(callback)
}

// los listeners del navegador se registran UNA vez desde ShellView (no aquí
// en import-time: los tests importan este módulo sin querer listeners)
export function attachNetListeners() {
  window.addEventListener('online', markOnline)
  window.addEventListener('offline', markOffline)
  document.addEventListener('visibilitychange', () => {
    // volver a la app (móvil desbloqueado, pestaña recuperada) con el SO
    // reportando red = oportunidad de sincronizar aunque el evento 'online'
    // se haya perdido mientras la pestaña estaba congelada
    if (document.visibilityState === 'visible' && navigator.onLine) markOnline()
  })
}

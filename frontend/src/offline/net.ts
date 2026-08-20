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

// v0.34.0: sonda mientras estamos offline — si la app se queda quieta no hay
// ninguna petición que descubra que la red volvió, y el replay del outbox
// espera a markOnline(). Solo en la app (tras attachNetListeners): los tests
// importan este módulo sin querer timers.
const PROBE_MS = 15_000
let probe: ReturnType<typeof setInterval> | null = null
let listenersAttached = false

function startProbe() {
  if (probe !== null || !listenersAttached) return
  probe = setInterval(() => {
    fetch('/api/v1/auth/status', { cache: 'no-store', credentials: 'same-origin', signal: AbortSignal.timeout(5_000) })
      .then((response) => {
        if (response.ok) markOnline()
      })
      .catch(() => {
        // seguimos offline
      })
  }, PROBE_MS)
}

function stopProbe() {
  if (probe === null) return
  clearInterval(probe)
  probe = null
}

export function markOffline() {
  online.value = false
  startProbe()
}

export function markOnline() {
  const wasOffline = !online.value
  online.value = true
  stopProbe()
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
  listenersAttached = true
  if (!online.value) startProbe()
  window.addEventListener('online', markOnline)
  window.addEventListener('offline', markOffline)
  document.addEventListener('visibilitychange', () => {
    // volver a la app (móvil desbloqueado, pestaña recuperada) con el SO
    // reportando red = oportunidad de sincronizar aunque el evento 'online'
    // se haya perdido mientras la pestaña estaba congelada
    if (document.visibilityState === 'visible' && navigator.onLine) markOnline()
  })
}

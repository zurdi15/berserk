// v0.38.0 (zurdi: "el fin de cardio no tiene el mismo feedback que el de
// descanso"): la notificación del sistema al terminar una cuenta atrás vivía
// dentro de restTimer.ts (notifyRestOver) y el cardio no la tenía. Aquí, para
// que descanso y cardio avisen exactamente igual. Todo lo demás es tal cual
// estaba en el store.

/**
 * Aviso del sistema al llegar a cero. SOLO con la página oculta: visible, las
 * señales in-app (vibración, countdown/¡Tiempo!) ya avisan y la notificación
 * sería ruido. Silenciosa si no hay permiso o el entorno no la soporta.
 */
export async function showTimerNotification(title: string, body: string, tag: string): Promise<void> {
  if (typeof document === 'undefined' || document.visibilityState !== 'hidden') return
  if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return

  const options: NotificationOptions = { body, icon: '/icons/pwa-192.png', tag }

  try {
    // Android en concreto lanza "Illegal constructor" al hacer
    // `new Notification()` desde una página con un service worker activo:
    // hay que pasar por el registro cuando existe. vite-pwa (generateSW,
    // ver vite.config.ts) no necesita código propio para esto —
    // showNotification() es un método nativo de cualquier
    // ServiceWorkerRegistration activa, generada o escrita a mano. En dev
    // (SW deshabilitado) o navegadores sin SW, new Notification() es el
    // camino pragmático: sigue siendo una PWA funcional sin él. El await
    // solo se paga cuando de verdad hay SW que consultar — así el camino
    // sin SW no cede el hilo de más.
    let registration: ServiceWorkerRegistration | undefined
    if ('serviceWorker' in navigator) registration = await navigator.serviceWorker.getRegistration()
    if (registration) await registration.showNotification(title, options)
    else new Notification(title, options)
  } catch {
    // notificación no soportada/bloqueada en este entorno: la vibración ya avisó
  }
}

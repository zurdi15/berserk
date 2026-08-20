// v0.36.0 Web Push (zurdi: "mi novia tiene iPhone y usa la app... no puedo
// pagar por la app de ios"): vite-pwa genera el service worker (generateSW,
// ver vite.config.ts) y este fichero se le inyecta con importScripts — es la
// única forma de añadir handlers propios sin pasar a injectManifest y
// reescribir el precache a mano. Aquí solo se pinta lo que manda el backend
// (services/push.py: title/body/tag/url); la lógica de "cuándo" vive allí.
self.addEventListener('push', (event) => {
  let payload = {}
  try {
    payload = event.data ? event.data.json() : {}
  } catch {
    payload = { title: 'berserk', body: event.data ? event.data.text() : '' }
  }
  const title = payload.title || 'berserk'
  const options = {
    body: payload.body || '',
    // misma tag que el aviso local de restTimer.ts: si la pestaña seguía viva
    // y ya lo mostró, el push lo reemplaza en vez de duplicarlo
    tag: payload.tag || 'berserk-push',
    renotify: true,
    icon: '/icons/pwa-192.png',
    badge: '/icons/pwa-192.png',
    vibrate: [200, 100, 200, 100, 400],
    data: { url: payload.url || '/' },
  }
  event.waitUntil(self.registration.showNotification(title, options))
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const url = (event.notification.data && event.notification.data.url) || '/'
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      // la PWA ya abierta: al frente, sin abrir otra ventana (en iOS una
      // segunda ventana de la PWA instalada ni siquiera existe)
      for (const client of clients) {
        if ('focus' in client) {
          if ('navigate' in client && !client.url.includes(url)) client.navigate(url).catch(() => {})
          return client.focus()
        }
      }
      return self.clients.openWindow(url)
    }),
  )
})

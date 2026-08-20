import '@fontsource/chakra-petch/latin-600.css'
import '@fontsource/chakra-petch/latin-700.css'
import '@fontsource-variable/inter'
import '@fontsource/jetbrains-mono/latin-400.css'
import '@fontsource/jetbrains-mono/latin-600.css'
import './styles/base.css'
import './styles/animations.css'

import { createPinia } from 'pinia'
import { createApp } from 'vue'

import { setUnauthorizedHandler } from './api/client'
import App from './App.vue'
import { i18n } from './i18n'
import { router } from './router'
import { useAuthStore } from './stores/auth'
import { useAthleteStore } from './stores/athlete'
import { useActiveWorkoutStore } from './stores/activeWorkout'
import { initTheme } from './utils/theme'
import { initAppUpdate } from './utils/appUpdate'

// el script inline de index.html ya aplicó la clase/meta correctas antes del
// primer paint (evita el flash) — esto reafirma el estado y, sobre todo,
// engancha el listener de prefers-color-scheme para el modo 'system' (el
// script inline es un IIFE de un solo disparo, no puede dejar nada vivo)
initTheme()

const app = createApp(App)
app.use(createPinia())
app.use(router)
app.use(i18n)

setUnauthorizedHandler(() => {
  const auth = useAuthStore()
  auth.user = null
  // cerrar sesión no puede dejar el "viendo a X" ni el entreno cacheado del usuario anterior
  useAthleteStore().clear()
  useActiveWorkoutStore().reset()
  const current = router.currentRoute.value.name
  // durante el arranque (ready aún false) el guard resuelve el destino él
  // mismo; y si ya estamos en una ruta pública no hay nada que redirigir.
  // sesión muerta a mitad de uso: fuera al login sin bucles (el guard haría
  // lo mismo, pero solo en navegación; esto cubre cualquier fetch).
  if (!auth.ready || current === 'login' || current === 'bootstrap') return
  router.push({ name: 'login' })
})

app.mount('#app')
// v0.37.0: registro del service worker + aviso de versión nueva (ver appUpdate.ts)
initAppUpdate()

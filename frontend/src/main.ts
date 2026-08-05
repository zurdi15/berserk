import '@fontsource/chakra-petch/600.css'
import '@fontsource/chakra-petch/700.css'
import '@fontsource-variable/inter'
import '@fontsource/jetbrains-mono/400.css'
import '@fontsource/jetbrains-mono/600.css'
import './styles/base.css'
import './styles/animations.css'

import { createPinia } from 'pinia'
import { createApp } from 'vue'

import { setUnauthorizedHandler } from './api/client'
import App from './App.vue'
import { i18n } from './i18n'
import { router } from './router'
import { useAuthStore } from './stores/auth'

const app = createApp(App)
app.use(createPinia())
app.use(router)
app.use(i18n)

setUnauthorizedHandler(() => {
  const auth = useAuthStore()
  auth.user = null
  const current = router.currentRoute.value.name
  // durante el arranque (ready aún false) el guard resuelve el destino él
  // mismo; y si ya estamos en una ruta pública no hay nada que redirigir.
  // sesión muerta a mitad de uso: fuera al login sin bucles (el guard haría
  // lo mismo, pero solo en navegación; esto cubre cualquier fetch).
  if (!auth.ready || current === 'login' || current === 'bootstrap') return
  router.push({ name: 'login' })
})

app.mount('#app')

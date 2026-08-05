import '@fontsource/chakra-petch/600.css'
import '@fontsource/chakra-petch/700.css'
import '@fontsource-variable/inter'
import '@fontsource/jetbrains-mono/400.css'
import '@fontsource/jetbrains-mono/600.css'
import './styles/base.css'
import './styles/animations.css'

import { createPinia } from 'pinia'
import { createApp } from 'vue'

import App from './App.vue'
import { createI18nInstance } from './i18n'
import { router } from './router'

const app = createApp(App)
app.use(createPinia())
app.use(router)
app.use(createI18nInstance())
app.mount('#app')

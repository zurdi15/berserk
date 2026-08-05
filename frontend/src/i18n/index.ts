import { createI18n } from 'vue-i18n'

import { en } from './en'
import { es } from './es'

export type Locale = 'es' | 'en'

export function createI18nInstance(locale: Locale = 'es') {
  return createI18n({
    legacy: false,
    locale,
    fallbackLocale: 'es',
    messages: { es, en },
  })
}

// instancia única: los helpers fuera de componentes (toasts de error,
// sincronización de locale del backend) necesitan el mismo i18n que la app
export const i18n = createI18nInstance()

export function applyLocale(locale: string) {
  if (locale !== 'es' && locale !== 'en') return
  i18n.global.locale.value = locale
  document.documentElement.lang = locale
}

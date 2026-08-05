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

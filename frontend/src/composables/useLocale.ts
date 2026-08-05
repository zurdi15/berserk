import { useI18n } from 'vue-i18n'

import type { Locale } from '@/i18n'

// persist es inyectable: la Task 7 conecta el PATCH /users/me real; los tests
// y el arranque sin sesión usan el no-op
export function useLocale(persist: (locale: Locale) => void = () => {}) {
  const { locale } = useI18n()

  function setLocale(next: Locale) {
    locale.value = next
    document.documentElement.lang = next
    persist(next)
  }

  return { locale, setLocale }
}

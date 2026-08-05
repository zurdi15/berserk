import { applyLocale, type Locale } from '@/i18n'

// persist es inyectable: Perfil conecta el PATCH /users/me; sin sesión, no-op
export function useLocale(persist: (locale: Locale) => void = () => {}) {
  function setLocale(next: Locale) {
    applyLocale(next)
    persist(next)
  }
  return { setLocale }
}

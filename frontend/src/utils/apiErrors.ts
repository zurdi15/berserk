import { ApiError } from '@/api/client'
import { i18n } from '@/i18n'
import { useToastStore } from '@/stores/toast'

export function toastApiError(error: unknown) {
  const slug = error instanceof ApiError ? error.slug : 'generic'
  const key = `errors.${slug}`
  const message = i18n.global.te(key) ? i18n.global.t(key) : i18n.global.t('errors.generic')
  useToastStore().push('error', message)
}

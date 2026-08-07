import { ApiError, OfflineError } from '@/api/client'
import { i18n } from '@/i18n'
import { useToastStore } from '@/stores/toast'

// item (v0.4.0): tres niveles de fallback, nunca directo a "Algo ha
// fallado" — 1) el slug específico (ya sea uno del backend o uno reconstruido
// por client.ts a partir de una lista de validación, p.ej. password_too_short)
// si existe traducción; 2) errors.validation con el CAMPO interpolado, si
// client.ts pudo identificar cuál era (fallback genérico pero útil: dice
// AL MENOS qué campo falló); 3) errors.generic, solo cuando no hay ninguna
// pista aprovechable.
export function toastApiError(error: unknown) {
  const message = resolveApiErrorMessage(error)
  useToastStore().push('error', message)
}

export function resolveApiErrorMessage(error: unknown): string {
  // v0.6.0 offline: sin red no es "algo ha fallado" — es un estado con
  // nombre y con instrucción implícita (reintenta con cobertura). Solo llega
  // aquí en los flujos que EXIGEN red (descartar entreno, arrancar una
  // rutina jamás vista, lecturas sin cache) — el resto encola en el outbox.
  if (error instanceof OfflineError) return i18n.global.t('errors.offline')
  if (!(error instanceof ApiError)) return i18n.global.t('errors.generic')

  // "validation" (el fallback fielded de client.ts) SIEMPRE necesita el
  // campo interpolado cuando lo hay — se resuelve ANTES de la comprobación
  // genérica de abajo, que si no encontraría la clave (existe de sobra) y
  // devolvería el placeholder {field} sin interpolar
  if (error.slug === 'validation' && error.field) {
    return i18n.global.t('errors.validation', { field: error.field })
  }

  const specificKey = `errors.${error.slug}`
  if (i18n.global.te(specificKey)) return i18n.global.t(specificKey)

  return i18n.global.t('errors.generic')
}

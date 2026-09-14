import { ApiError, OfflineError } from '@/api/client'
import { i18n } from '@/i18n'
import { useToastStore } from '@/stores/toast'

// item (v0.4.0): tres niveles de fallback, nunca directo a "Algo ha
// fallado" — 1) el slug específico (ya sea uno del backend o uno reconstruido
// por client.ts a partir de una lista de validación, p.ej. password_too_short)
// si existe traducción; 2) errors.validation con el CAMPO interpolado, si
// client.ts pudo identificar cuál era (fallback genérico pero útil: dice
// AL MENOS qué campo falló); 3) el código HTTP, cuando el servidor no mandó
// un slug (un 502 del ingress con el pod reiniciando, un 500, un 413…);
// 4) errors.generic CON el detalle técnico (slug · status) — un "algo ha
// fallado" mudo no da nada que contar al administrador (v0.40.2, zurdi:
// "habría que mejorar mucho los toast de error").
export function toastApiError(error: unknown) {
  const message = resolveApiErrorMessage(error)
  useToastStore().push('error', message)
}

// v0.40.2: mensajes por código HTTP para respuestas SIN slug del backend —
// el ingress contestando por un pod caído (502/503/504), un 500 del propio
// backend, un cuerpo rechazado por tamaño (413) o el límite de peticiones
const STATUS_KEYS: Record<number, string> = {
  401: 'not_authenticated',
  403: 'forbidden',
  404: 'not_found',
  409: 'conflict',
  413: 'payload_too_large',
  429: 'too_many_requests',
  500: 'server_error',
  502: 'server_unavailable',
  503: 'server_unavailable',
  504: 'server_unavailable',
}

export function resolveApiErrorMessage(error: unknown): string {
  // v0.6.0 offline: sin red no es "algo ha fallado" — es un estado con
  // nombre y con instrucción implícita (reintenta con cobertura). Solo llega
  // aquí en los flujos que EXIGEN red (descartar entreno, arrancar una
  // rutina jamás vista, lecturas sin cache) — el resto encola en el outbox.
  // v0.40.2: un timeout (el servidor no contestó a tiempo) se cuenta aparte:
  // la red puede estar bien y ser el servidor el que se ahoga
  if (error instanceof OfflineError) {
    return i18n.global.t(error.reason === 'timeout' ? 'errors.timeout' : 'errors.offline')
  }
  if (!(error instanceof ApiError)) return i18n.global.t('errors.generic')

  // "validation" (el fallback fielded de client.ts) SIEMPRE necesita el
  // campo interpolado cuando lo hay — se resuelve ANTES de la comprobación
  // genérica de abajo, que si no encontraría la clave (existe de sobra) y
  // devolvería el placeholder {field} sin interpolar
  if (error.slug === 'validation' && error.field) {
    return i18n.global.t('errors.validation', { field: error.field })
  }

  // sin slug del backend (client.ts pone 'generic' cuando el cuerpo no trae
  // detail — típico del ingress contestando por un pod caído): el código
  // HTTP ya dice bastante. Va ANTES del slug porque 'generic' también tiene
  // traducción propia y se la comería.
  const statusKey = STATUS_KEYS[error.status]
  if (statusKey && error.slug === 'generic') return i18n.global.t(`errors.${statusKey}`)

  const specificKey = `errors.${error.slug}`
  if (i18n.global.te(specificKey)) return i18n.global.t(specificKey)

  // slug desconocido (backend más nuevo que el bundle, o un caso sin
  // traducción): genérico, pero con el detalle para poder contarlo
  return i18n.global.t('errors.generic_detail', { detail: `${error.slug} · ${error.status}` })
}

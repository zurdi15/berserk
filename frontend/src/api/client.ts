import { cacheRead, readCached } from '@/offline/readCache'
import { markOffline, markOnline } from '@/offline/net'

export class ApiError extends Error {
  constructor(
    public status: number,
    public slug: string,
    // item (v0.4.0): nombre del campo (snake_case, tal cual lo reporta
    // pydantic) cuando slug es el fallback genérico "validation" — permite
    // interpolar errors.validation ("Valor no válido en {field}") en vez de
    // un mensaje mudo. undefined para cualquier otro slug.
    public field?: string,
  ) {
    super(slug)
  }
}

// v0.6.0 offline: un fetch que muere por RED (TypeError — DNS, sin
// cobertura, servidor caído) es una categoría distinta de un error HTTP del
// servidor: las mutaciones del entreno lo capturan para encolar en el outbox
// y los GETs sin cache lo propagan para que la vista muestre su error normal
export class OfflineError extends Error {
  constructor() {
    super('offline')
  }
}

let unauthorizedHandler: (() => void) | null = null

export function setUnauthorizedHandler(fn: (() => void) | null) {
  unauthorizedHandler = fn
}

const BASE = '/api/v1'

// v0.34.0 (zurdi: "si se va la conexión con el backend la app se vuelve loca,
// se queda pillada, y si le das varias veces a añadir un ejercicio luego se
// añaden todos de golpe"): fetch no tiene timeout, y cuando la red muere "a
// medias" (wifi asociada sin salida, servidor que no contesta) la petición se
// quedaba colgada minutos — ni error ni offline, así que cada toque lanzaba
// otra petición que acababa llegando toda junta. Un timeout convierte ese
// limbo en OfflineError: las mutaciones del entreno caen al outbox y las
// lecturas a la cache. Las subidas (apiForm) tienen más margen.
const REQUEST_TIMEOUT_MS = 8_000
const UPLOAD_TIMEOUT_MS = 30_000

function timedSignal(ms: number): { signal: AbortSignal; clear: () => void } {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), ms)
  return { signal: controller.signal, clear: () => clearTimeout(timer) }
}

// v0.17.0 act-as: mientras un admin actúa como otro usuario (ver
// utils/actAs.ts), TODA petición lleva el header — el backend resuelve al
// objetivo en get_current_user, así que lecturas y mutaciones van "como si
// estuviese logado como ese usuario". Lectura directa del storage por
// petición (barata y sin estado duplicado); import inline del literal para
// no acoplar client.ts a utils/ (mismo criterio que las claves del outbox).
function actAsHeader(): Record<string, string> {
  try {
    const raw = localStorage.getItem('bk:act-as')
    if (raw === null) return {}
    const parsed = JSON.parse(raw) as { id?: unknown }
    return typeof parsed?.id === 'number' ? { 'X-Bk-Act-As': String(parsed.id) } : {}
  } catch {
    return {}
  }
}

// item (v0.4.0): los 422 de pydantic traen detail como una LISTA de errores
// de validación (uno por campo), nunca un string — antes CUALQUIERA de estos
// colapsaba al slug fijo 'generic' ("Algo ha fallado", inútil para saber qué
// corregir: zurdi lo reportó al escribir una contraseña inválida). Ahora se
// extrae el PRIMER error de la lista:
//  - los ValueError propios de un @field_validator (password_too_long,
//    color_invalid, timezone_invalid...) llevan su slug literal incrustado
//    en el mensaje que antepone pydantic ("Value error, <slug>") — se separa
//    con una regex, así los slugs YA existentes en errors.* se reutilizan
//    sin tocar el backend.
//  - las violaciones de longitud de Field(min_length=/max_length=) no traen
//    slug propio: se intenta <campo>_<tipo> (p.ej. "password_too_short",
//    ver FIELD_ALIASES/TYPE_SUFFIXES) — si esa clave no existe en errors.*,
//    toastApiError cae más abajo a errors.validation con el campo interpolado.
const FIELD_ALIASES: Record<string, string> = {
  // new_password (PasswordChangeIn) y current_password comparten las mismas
  // claves de error que password (Credentials/UserUpdateIn) — no tiene
  // sentido una clave new_password_too_short aparte de password_too_short
  new_password: 'password',
  current_password: 'password',
}

const TYPE_SUFFIXES: Record<string, string> = {
  string_too_short: 'too_short',
  string_too_long: 'too_long',
}

interface PydanticValidationEntry {
  type?: unknown
  loc?: unknown
  msg?: unknown
}

function fromValidationList(detail: unknown[]): { slug: string; field?: string } {
  const first = detail[0] as PydanticValidationEntry
  const loc = Array.isArray(first?.loc) ? first.loc : []
  const field = loc.length ? String(loc[loc.length - 1]) : undefined

  if (first?.type === 'value_error' && typeof first.msg === 'string') {
    const match = /^Value error,\s*(.+)$/.exec(first.msg)
    if (match) return { slug: match[1] }
  }
  if (field && typeof first?.type === 'string') {
    const suffix = TYPE_SUFFIXES[first.type]
    if (suffix) return { slug: `${FIELD_ALIASES[field] ?? field}_${suffix}`, field }
  }
  return { slug: 'validation', field: field ?? 'unknown' }
}

function toSlug(detail: unknown): { slug: string; field?: string } {
  if (typeof detail === 'string') return { slug: detail }
  if (Array.isArray(detail) && detail.length > 0) return fromValidationList(detail)
  return { slug: 'generic' }
}

// v0.12.0 media: subida multipart — mismo contrato de errores/offline que
// api(), pero con FormData (el navegador pone el boundary; nada de
// Content-Type manual) y sin cache de lecturas (solo se usa para POSTs)
export async function apiForm<T = unknown>(path: string, form: FormData): Promise<T> {
  let response: Response
  const timed = timedSignal(UPLOAD_TIMEOUT_MS)
  try {
    response = await fetch(`${BASE}${path}`, {
      method: 'POST',
      credentials: 'same-origin',
      headers: actAsHeader(),
      body: form,
      signal: timed.signal,
    })
  } catch {
    markOffline()
    throw new OfflineError()
  } finally {
    timed.clear()
  }
  markOnline()
  if (!response.ok) {
    const payload = await response.json().catch(() => ({}))
    const { slug, field } = toSlug((payload as { detail?: unknown }).detail)
    if (response.status === 401 && slug === 'not_authenticated') {
      unauthorizedHandler?.()
    }
    throw new ApiError(response.status, slug, field)
  }
  if (response.status === 204) return undefined as T
  return (await response.json()) as T
}

export async function api<T = unknown>(
  path: string,
  options: { method?: string; body?: unknown } = {},
): Promise<T> {
  const method = options.method ?? 'GET'
  let response: Response
  const timed = timedSignal(REQUEST_TIMEOUT_MS)
  try {
    response = await fetch(`${BASE}${path}`, {
      method,
      credentials: 'same-origin',
      headers: {
        ...(options.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        ...actAsHeader(),
      },
      body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
      signal: timed.signal,
    })
  } catch {
    // v0.6.0 offline: fetch solo LANZA por fallo de red/CORS, nunca por un
    // status HTTP — aquí no hubo servidor. Un GET intenta salvarse con la
    // última lectura buena (readCache); todo lo demás propaga OfflineError.
    markOffline()
    if (method === 'GET') {
      const cached = readCached<T>(path)
      if (cached.hit) return cached.data
    }
    throw new OfflineError()
  } finally {
    timed.clear()
  }
  // cualquier respuesta real (aunque sea un 4xx) prueba que hay servidor
  markOnline()
  if (!response.ok) {
    const payload = await response.json().catch(() => ({}))
    const { slug, field } = toSlug((payload as { detail?: unknown }).detail)
    // solo not_authenticated dispara el handler: invalid_credentials (login fallido)
    // es un error de usuario, no una sesión muerta a mitad de uso
    if (response.status === 401 && slug === 'not_authenticated') {
      unauthorizedHandler?.()
    }
    throw new ApiError(response.status, slug, field)
  }
  if (response.status === 204) return undefined as T
  const data = (await response.json()) as T
  // v0.6.0 offline: toda lectura buena alimenta la cache (solo se sirve
  // cuando la red falla — ver el catch de arriba y readCache.ts)
  if (method === 'GET') cacheRead(path, data)
  return data
}

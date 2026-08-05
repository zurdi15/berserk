export class ApiError extends Error {
  constructor(
    public status: number,
    public slug: string,
  ) {
    super(slug)
  }
}

let unauthorizedHandler: (() => void) | null = null

export function setUnauthorizedHandler(fn: (() => void) | null) {
  unauthorizedHandler = fn
}

const BASE = '/api/v1'

// los 422 de pydantic traen detail como lista de objetos: para el usuario son
// un fallo de validación genérico, los slugs útiles siempre son string
function toSlug(detail: unknown): string {
  return typeof detail === 'string' ? detail : 'generic'
}

export async function api<T = unknown>(
  path: string,
  options: { method?: string; body?: unknown } = {},
): Promise<T> {
  const response = await fetch(`${BASE}${path}`, {
    method: options.method ?? 'GET',
    credentials: 'same-origin',
    headers: options.body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
  })
  if (!response.ok) {
    const payload = await response.json().catch(() => ({}))
    const slug = toSlug((payload as { detail?: unknown }).detail)
    // solo not_authenticated dispara el handler: invalid_credentials (login fallido)
    // es un error de usuario, no una sesión muerta a mitad de uso
    if (response.status === 401 && slug === 'not_authenticated') {
      unauthorizedHandler?.()
    }
    throw new ApiError(response.status, slug)
  }
  if (response.status === 204) return undefined as T
  return (await response.json()) as T
}

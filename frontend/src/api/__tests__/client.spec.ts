import { afterEach, describe, expect, it, vi } from 'vitest'

import { api, ApiError, setUnauthorizedHandler } from '../client'

function mockFetch(status: number, body?: unknown) {
  vi.stubGlobal('fetch', vi.fn(async () => new Response(
    body === undefined ? null : JSON.stringify(body),
    { status, headers: { 'Content-Type': 'application/json' } },
  )))
}

afterEach(() => vi.unstubAllGlobals())

describe('api client', () => {
  it('returns parsed json on 200', async () => {
    mockFetch(200, { ok: true })
    await expect(api('/health')).resolves.toEqual({ ok: true })
  })

  // v0.17.0 act-as: con el modo activo (utils/actAs.ts), TODA petición lleva
  // el header — el backend resuelve al usuario objetivo en get_current_user
  it('adds the X-Bk-Act-As header while act-as mode is stored, and omits it otherwise', async () => {
    mockFetch(200, { ok: true })
    localStorage.setItem('bk:act-as', JSON.stringify({ id: 7, username: 'loki' }))
    await api('/routines', { method: 'POST', body: { name: 'x' } })
    let call = vi.mocked(fetch).mock.calls.at(-1)![1] as RequestInit
    expect((call.headers as Record<string, string>)['X-Bk-Act-As']).toBe('7')

    localStorage.removeItem('bk:act-as')
    await api('/routines')
    call = vi.mocked(fetch).mock.calls.at(-1)![1] as RequestInit
    expect((call.headers as Record<string, string>)['X-Bk-Act-As']).toBeUndefined()
  })

  it('returns undefined on 204', async () => {
    mockFetch(204)
    await expect(api('/auth/logout', { method: 'POST' })).resolves.toBeUndefined()
  })

  it('throws ApiError with slug from string detail', async () => {
    mockFetch(401, { detail: 'invalid_credentials' })
    const error: unknown = await api('/auth/login', { method: 'POST', body: {} }).catch((e) => e)
    expect(error).toBeInstanceOf(ApiError)
    expect((error as ApiError).status).toBe(401)
    expect((error as ApiError).slug).toBe('invalid_credentials')
  })

  // item (v0.4.0): antes CUALQUIER 422 de pydantic (detail siempre es una
  // lista, nunca un string) colapsaba al slug fijo 'generic' — "Algo ha
  // fallado" sin decir qué corregir. Los 3 casos de abajo usan el shape REAL
  // que devuelve FastAPI/pydantic v2 (comprobado contra el backend, ver
  // fromValidationList en client.ts), no una forma inventada.

  it('extracts the embedded slug from a custom @field_validator ValueError (e.g. password_too_long)', async () => {
    mockFetch(422, {
      detail: [
        {
          type: 'value_error',
          loc: ['body', 'new_password'],
          msg: 'Value error, password_too_long',
          input: 'x'.repeat(80),
          ctx: { error: {} },
        },
      ],
    })
    const error: unknown = await api('/auth/password', { method: 'POST', body: {} }).catch((e) => e)
    expect((error as ApiError).slug).toBe('password_too_long')
    expect((error as ApiError).field).toBeUndefined()
  })

  it('builds a <field>_too_short slug from a Field(min_length=) violation, aliasing new_password to password', async () => {
    mockFetch(422, {
      detail: [
        {
          type: 'string_too_short',
          loc: ['body', 'new_password'],
          msg: 'String should have at least 8 characters',
          input: 'short',
          ctx: { min_length: 8 },
        },
      ],
    })
    const error: unknown = await api('/auth/password', { method: 'POST', body: {} }).catch((e) => e)
    expect((error as ApiError).slug).toBe('password_too_short')
  })

  it('falls back to the fielded "validation" slug (with the raw field name) for a violation type with no mapped suffix', async () => {
    mockFetch(422, {
      detail: [
        {
          type: 'int_parsing',
          loc: ['body', 'is_admin'],
          msg: 'Input should be a valid integer',
          input: 'not-a-bool',
        },
      ],
    })
    const error: unknown = await api('/admin/users/1', { method: 'PATCH', body: {} }).catch((e) => e)
    expect((error as ApiError).slug).toBe('validation')
    expect((error as ApiError).field).toBe('is_admin')
  })

  it('calls handler on 401 with not_authenticated slug', async () => {
    const handler = vi.fn()
    setUnauthorizedHandler(handler)
    mockFetch(401, { detail: 'not_authenticated' })
    try {
      await api('/auth/me')
    } catch {
      // ignore error
    }
    expect(handler).toHaveBeenCalledOnce()
    setUnauthorizedHandler(null)
  })

  it('does not call handler on 401 with invalid_credentials slug', async () => {
    const handler = vi.fn()
    setUnauthorizedHandler(handler)
    mockFetch(401, { detail: 'invalid_credentials' })
    try {
      await api('/auth/login', { method: 'POST', body: {} })
    } catch {
      // ignore error
    }
    expect(handler).not.toHaveBeenCalled()
    setUnauthorizedHandler(null)
  })
})

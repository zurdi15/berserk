import { afterEach, describe, expect, it, vi } from 'vitest'

import { api, ApiError } from '../client'

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

  it('falls back to generic slug on non-string detail (422 pydantic)', async () => {
    mockFetch(422, { detail: [{ msg: 'password_too_long' }] })
    const error: unknown = await api('/auth/bootstrap', { method: 'POST', body: {} }).catch((e) => e)
    expect((error as ApiError).slug).toBe('generic')
  })
})

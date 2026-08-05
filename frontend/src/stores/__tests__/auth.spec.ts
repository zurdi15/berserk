import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/api/auth', () => ({
  getStatus: vi.fn(),
  me: vi.fn(),
  login: vi.fn(),
  logout: vi.fn(),
  bootstrap: vi.fn(),
  updateSettings: vi.fn(),
}))

import * as authApi from '@/api/auth'
import { ApiError } from '@/api/client'
import { useAuthStore } from '../auth'

const user = { id: 1, username: 'thor', is_admin: true, locale: 'es', units: 'kg', timezone: 'Europe/Madrid' }

describe('auth store', () => {
  beforeEach(() => setActivePinia(createPinia()))

  it('init resolves session when cookie is valid', async () => {
    vi.mocked(authApi.getStatus).mockResolvedValue({ bootstrapped: true })
    vi.mocked(authApi.me).mockResolvedValue(user)
    const store = useAuthStore()
    await store.init()
    expect(store.ready).toBe(true)
    expect(store.isAuthenticated).toBe(true)
    expect(store.user?.username).toBe('thor')
  })

  it('init leaves user null on 401 without throwing', async () => {
    vi.mocked(authApi.getStatus).mockResolvedValue({ bootstrapped: true })
    vi.mocked(authApi.me).mockRejectedValue(new ApiError(401, 'not_authenticated'))
    const store = useAuthStore()
    await store.init()
    expect(store.ready).toBe(true)
    expect(store.isAuthenticated).toBe(false)
  })

  it('login sets the user', async () => {
    vi.mocked(authApi.login).mockResolvedValue(user)
    const store = useAuthStore()
    await store.login('thor', 'secret123')
    expect(store.isAuthenticated).toBe(true)
  })

  it('applies the user locale on session resolution', async () => {
    vi.mocked(authApi.getStatus).mockResolvedValue({ bootstrapped: true })
    vi.mocked(authApi.me).mockResolvedValue({ ...user, locale: 'en' })
    const store = useAuthStore()
    await store.init()
    const { i18n } = await import('@/i18n')
    expect(i18n.global.locale.value).toBe('en')
  })

  it('does not cache ready on non-401 init failure', async () => {
    vi.mocked(authApi.getStatus).mockRejectedValue(new ApiError(500, 'generic'))
    const store = useAuthStore()
    await expect(store.init()).rejects.toBeInstanceOf(ApiError)
    expect(store.ready).toBe(false)
    // recuperación: el siguiente init reintenta de verdad
    vi.mocked(authApi.getStatus).mockResolvedValue({ bootstrapped: true })
    vi.mocked(authApi.me).mockResolvedValue(user)
    await store.init()
    expect(store.ready).toBe(true)
  })
})

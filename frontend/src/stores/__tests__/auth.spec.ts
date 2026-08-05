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
})

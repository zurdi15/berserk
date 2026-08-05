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

import { router } from '../index'

const user = { id: 1, username: 'thor', is_admin: true, locale: 'es', units: 'kg', timezone: 'Europe/Madrid' }

describe('router catch-all', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.mocked(authApi.getStatus).mockResolvedValue({ bootstrapped: true })
    vi.mocked(authApi.me).mockResolvedValue(user)
  })

  it('redirects unknown paths to today instead of a blank/404 view', async () => {
    await router.push('/this/route/does/not/exist')
    expect(router.currentRoute.value.name).toBe('today')
  })
})

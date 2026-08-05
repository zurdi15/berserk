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
import { ApiError, setUnauthorizedHandler } from '@/api/client'
import { useAuthStore } from '@/stores/auth'
import { useToastStore } from '@/stores/toast'
import { router } from '../index'

describe('cold-boot race with 401 handler', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('handler defers on 401 during cold boot (ready === false)', async () => {
    const handlerSpy = vi.fn()
    setUnauthorizedHandler(handlerSpy)

    // me() rejects with not_authenticated during boot
    vi.mocked(authApi.getStatus).mockResolvedValue({ bootstrapped: true })
    vi.mocked(authApi.me).mockRejectedValue(new ApiError(401, 'not_authenticated'))

    const auth = useAuthStore()
    const initialReady = auth.ready
    expect(initialReady).toBe(false) // boot starts with ready=false

    // navigate to protected route during boot
    await router.push('/today')

    // should end up on login (guard redirected, not handler)
    expect(router.currentRoute.value.name).toBe('login')
    // auth is now ready after init
    expect(auth.ready).toBe(true)

    // cleanup
    setUnauthorizedHandler(null)
  })

  it('does not double toast when init fails navigating to login', async () => {
    const toastStore = useToastStore()
    const initialToastCount = toastStore.toasts.length

    vi.mocked(authApi.getStatus).mockRejectedValue(new ApiError(500, 'generic'))

    // navigate to login
    await router.push('/login')

    // should be on login
    expect(router.currentRoute.value.name).toBe('login')
    // no toast added (navigating TO login, not redirecting TO login)
    expect(toastStore.toasts.length - initialToastCount).toBe(0)
  })
})

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const apiMock = vi.fn()
vi.mock('@/api/client', () => ({ api: (...args: unknown[]) => apiMock(...args) }))
const nativeMock = { isNativeShell: vi.fn(() => false) }
vi.mock('@/utils/nativeShell', () => ({ isNativeShell: () => nativeMock.isNativeShell() }))

import { cancelWebPushTimer, enableWebPush, getWebPushState, scheduleWebPushTimer } from '../webPush'

// v0.36.0 Web Push: el estado se deriva del entorno (shell, iOS sin instalar,
// permiso, flag local) y los timers solo hablan con el backend cuando está ON
function fakePushEnv(permission: NotificationPermission = 'granted') {
  const subscription = {
    endpoint: 'https://push.example/abc',
    toJSON: () => ({ endpoint: 'https://push.example/abc', keys: { p256dh: 'p', auth: 'a' } }),
    unsubscribe: vi.fn(async () => true),
  }
  const pushManager = {
    getSubscription: vi.fn(async () => null),
    subscribe: vi.fn(async () => subscription),
  }
  Object.defineProperty(navigator, 'serviceWorker', {
    configurable: true,
    value: { ready: Promise.resolve({ pushManager }) },
  })
  ;(window as unknown as { PushManager: unknown }).PushManager = function PushManager() {}
  const NotificationStub = function Notification() {} as unknown as typeof Notification
  Object.defineProperty(NotificationStub, 'permission', { configurable: true, value: permission, writable: true })
  ;(NotificationStub as unknown as { requestPermission: () => Promise<NotificationPermission> }).requestPermission = vi.fn(async (): Promise<NotificationPermission> => 'granted')
  ;(globalThis as unknown as { Notification: typeof Notification }).Notification = NotificationStub
  return { pushManager, subscription }
}

describe('webPush', () => {
  beforeEach(() => {
    localStorage.clear()
    apiMock.mockReset()
    nativeMock.isNativeShell.mockReturnValue(false)
  })
  afterEach(() => {
    vi.restoreAllMocks()
    delete (globalThis as unknown as { Notification?: unknown }).Notification
    delete (window as unknown as { PushManager?: unknown }).PushManager
  })

  it('is unsupported inside the native shell even with a Push API', () => {
    fakePushEnv()
    nativeMock.isNativeShell.mockReturnValue(true)
    expect(getWebPushState()).toBe('unsupported')
  })

  it('asks iPhone users to install the PWA before subscribing', () => {
    fakePushEnv()
    vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) Safari')
    expect(getWebPushState()).toBe('needs-install')
  })

  it('does not schedule timers while off, and schedules/cancels once enabled', async () => {
    fakePushEnv()
    expect(getWebPushState()).toBe('off')
    await scheduleWebPushTimer('rest', Date.now() + 60_000, 'Descanso terminado', 'Press banca')
    expect(apiMock).not.toHaveBeenCalled()

    apiMock.mockResolvedValueOnce({ enabled: true, public_key: 'BAAA' }).mockResolvedValue(undefined)
    expect(await enableWebPush()).toBe('on')
    expect(apiMock).toHaveBeenCalledWith('/push/subscriptions', expect.objectContaining({ method: 'PUT' }))

    apiMock.mockClear()
    await scheduleWebPushTimer('rest', 1_700_000_000_000, 'Descanso terminado', 'Press banca')
    const [path, options] = apiMock.mock.calls[0] as [string, { method: string; body: { fire_at: string; kind: string } }]
    expect(path).toMatch(/^\/push\/timers\/.+-rest$/)
    expect(options.method).toBe('PUT')
    expect(options.body.kind).toBe('rest')
    expect(options.body.fire_at).toBe(new Date(1_700_000_000_000).toISOString())

    apiMock.mockClear()
    await cancelWebPushTimer('rest')
    expect(apiMock).toHaveBeenCalledWith(path, { method: 'DELETE' })
  })

  it('swallows backend failures when scheduling (the in-app timer still rings)', async () => {
    fakePushEnv()
    localStorage.setItem('berserk:web-push-enabled', 'true')
    apiMock.mockRejectedValue(new Error('offline'))
    await expect(scheduleWebPushTimer('cardio', Date.now(), 'Cardio terminado', '')).resolves.toBeUndefined()
  })
})

import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'

import { useRestTimerStore } from '../restTimer'

describe('rest timer store', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.useFakeTimers()
    vi.setSystemTime(1_000_000)
  })
  afterEach(() => vi.useRealTimers())

  it('counts down from absolute timestamps (survives missed ticks)', () => {
    const timer = useRestTimerStore()
    timer.start(90)
    expect(timer.active).toBe(true)
    expect(timer.remaining).toBe(90)
    // el móvil bloqueado no ejecuta intervals: saltamos 60s de golpe
    vi.setSystemTime(1_000_000 + 60_000)
    vi.advanceTimersByTime(500)
    expect(timer.remaining).toBe(30)
    expect(timer.progress).toBeCloseTo(30 / 90, 2)
  })

  it('vibrates once and auto-clears after the grace period', () => {
    const vibrate = vi.fn()
    vi.stubGlobal('navigator', { vibrate })
    const timer = useRestTimerStore()
    timer.start(10)
    vi.setSystemTime(1_000_000 + 10_500)
    vi.advanceTimersByTime(600)
    expect(vibrate).toHaveBeenCalledTimes(1)
    vi.advanceTimersByTime(3_100)
    expect(timer.active).toBe(false)
    vi.unstubAllGlobals()
  })

  it('restarting replaces the previous countdown', () => {
    const timer = useRestTimerStore()
    timer.start(90)
    timer.start(30)
    expect(timer.remaining).toBe(30)
    expect(timer.total).toBe(30)
  })

  it('cancels stale grace-window timeout on restart (avoids wiping new timer)', () => {
    const vibrate = vi.fn()
    vi.stubGlobal('navigator', { vibrate })
    const timer = useRestTimerStore()
    // First timer: 10 seconds
    timer.start(10)
    // Jump past expiration + grace window threshold
    vi.setSystemTime(1_000_000 + 10_500)
    vi.advanceTimersByTime(600)
    expect(vibrate).toHaveBeenCalledTimes(1)
    expect(timer.active).toBe(true) // still active during grace period
    // Re-start new timer within grace window (1s into grace period)
    timer.start(60)
    // Advance 4 seconds (past original grace window end)
    vi.advanceTimersByTime(4_000)
    // New timer should still be running, not wiped by stale grace timeout
    expect(timer.active).toBe(true)
    expect(timer.remaining).toBeGreaterThan(50) // 60 - 4 - 5 ≈ 50+
    vi.unstubAllGlobals()
  })

  it('label formats remaining seconds as m:ss (shared by the CTA countdown, item 1)', () => {
    const timer = useRestTimerStore()
    timer.start(90)
    expect(timer.label).toBe('1:30')
    vi.setSystemTime(1_000_000 + 65_000)
    vi.advanceTimersByTime(500)
    expect(timer.label).toBe('0:25')
  })
})

// item 2 (v0.3.0, feedback de gym de zurdi: "notificación en mobile del
// timer"). happy-dom (entorno de test) no expone Notification global — por
// eso todo lo que sigue mockea Notification/permission a mano.
describe('rest timer store — mobile notification on rest-over', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.useFakeTimers()
    vi.setSystemTime(1_000_000)
  })
  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  // arranca el timer y salta al momento justo después de que expire — deja
  // el interval disparar el tick que dispara vibración/notificación.
  // *Async* (advanceTimersByTimeAsync, no advanceTimersByTime): notifyRestOver
  // puede tener un await real de por medio (getRegistration del SW) y esta
  // variante sí drena esas promesas antes de devolver el control al test.
  async function expireAfter(timer: ReturnType<typeof useRestTimerStore>, seconds: number, name?: string) {
    timer.start(seconds, name)
    vi.setSystemTime(1_000_000 + seconds * 1000 + 500)
    await vi.advanceTimersByTimeAsync(600)
  }

  it('requests permission lazily on the first start() (user gesture), never again after that', () => {
    const requestPermission = vi.fn()
    vi.stubGlobal('Notification', { permission: 'default', requestPermission })
    vi.stubGlobal('navigator', { vibrate: vi.fn() })

    const timer = useRestTimerStore()
    // nunca al cargar / crear el store — solo cuando arranca un descanso de verdad
    expect(requestPermission).not.toHaveBeenCalled()

    timer.start(10)
    expect(requestPermission).toHaveBeenCalledTimes(1)

    timer.start(20)
    timer.start(30)
    expect(requestPermission).toHaveBeenCalledTimes(1) // sigue siendo 1: no se repite
  })

  it('does not re-request when permission is already granted or denied (still only attempted once)', () => {
    const requestPermission = vi.fn()
    vi.stubGlobal('Notification', { permission: 'granted', requestPermission })
    vi.stubGlobal('navigator', { vibrate: vi.fn() })

    const timer = useRestTimerStore()
    timer.start(10)
    expect(requestPermission).not.toHaveBeenCalled() // ya no está en 'default': nada que pedir
  })

  it('fires a system notification (title/body/icon) when the rest ends while the page is hidden', async () => {
    const NotificationMock = vi.fn()
    Object.assign(NotificationMock, { permission: 'granted', requestPermission: vi.fn() })
    vi.stubGlobal('Notification', NotificationMock)
    vi.stubGlobal('navigator', { vibrate: vi.fn() }) // sin serviceWorker: camino síncrono de new Notification()
    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden')

    const timer = useRestTimerStore()
    await expireAfter(timer, 10)

    expect(NotificationMock).toHaveBeenCalledTimes(1)
    const [title, options] = NotificationMock.mock.calls[0]
    expect(title).toBe('Descanso terminado')
    expect(options).toMatchObject({ body: 'Toca para volver al entreno.', icon: '/icons/pwa-192.png' })
  })

  it('includes the exercise name in the body when start() was given one', async () => {
    const NotificationMock = vi.fn()
    Object.assign(NotificationMock, { permission: 'granted', requestPermission: vi.fn() })
    vi.stubGlobal('Notification', NotificationMock)
    vi.stubGlobal('navigator', { vibrate: vi.fn() })
    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden')

    const timer = useRestTimerStore()
    await expireAfter(timer, 10, 'Press banca')

    const [, options] = NotificationMock.mock.calls[0]
    expect(options.body).toBe('Toca para volver a Press banca.')
  })

  it('does NOT notify while the page is visible — the in-app cues (vibration + CTA countdown) are enough', async () => {
    const NotificationMock = vi.fn()
    Object.assign(NotificationMock, { permission: 'granted', requestPermission: vi.fn() })
    vi.stubGlobal('Notification', NotificationMock)
    const vibrate = vi.fn()
    vi.stubGlobal('navigator', { vibrate })
    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible')

    const timer = useRestTimerStore()
    await expireAfter(timer, 10)

    expect(vibrate).toHaveBeenCalledTimes(1) // la vibración no depende de la visibilidad
    expect(NotificationMock).not.toHaveBeenCalled()
  })

  it('permission denied: does not throw, no notification attempted, vibration still fires', async () => {
    // objeto plano (no vi.fn()): si el guard de permiso fallara y el código
    // intentara `new Notification()` sobre esto, explotaría con
    // "not a constructor" — un throw aquí tumba el test igualmente
    vi.stubGlobal('Notification', { permission: 'denied', requestPermission: vi.fn() })
    const vibrate = vi.fn()
    vi.stubGlobal('navigator', { vibrate })
    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden')

    const timer = useRestTimerStore()
    await expireAfter(timer, 10)
    expect(vibrate).toHaveBeenCalledTimes(1)
  })

  it('no Notification support at all (older browser): does not throw, vibration still fires', async () => {
    vi.stubGlobal('Notification', undefined)
    const vibrate = vi.fn()
    vi.stubGlobal('navigator', { vibrate })
    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden')

    const timer = useRestTimerStore()
    await expireAfter(timer, 10)
    expect(vibrate).toHaveBeenCalledTimes(1)
  })

  it('prefers the active service worker registration (showNotification) over the bare constructor when one exists', async () => {
    const showNotification = vi.fn()
    const NotificationMock = vi.fn()
    Object.assign(NotificationMock, { permission: 'granted', requestPermission: vi.fn() })
    vi.stubGlobal('Notification', NotificationMock)
    vi.stubGlobal('navigator', {
      vibrate: vi.fn(),
      serviceWorker: { getRegistration: vi.fn(async () => ({ showNotification })) },
    })
    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden')

    const timer = useRestTimerStore()
    await expireAfter(timer, 10)

    expect(showNotification).toHaveBeenCalledTimes(1)
    expect(NotificationMock).not.toHaveBeenCalled() // nunca el constructor plano si hay SW
  })
})

// v0.28.0 reloj: el descanso se publica en la Data Layer (vía el shell) y se
// puede cancelar desde la muñeca. Stub de window.Capacitor como en
// utils/__tests__/nativeShell.spec.ts.
describe('rest timer store — Galaxy Watch (Data Layer vía shell)', () => {
  type CapacitorStub = { isNativePlatform: () => boolean; Plugins: Record<string, unknown> }
  let handler: ((data: { kind?: string }) => void) | null = null
  const syncTimer = vi.fn().mockResolvedValue(undefined)

  beforeEach(() => {
    setActivePinia(createPinia())
    vi.useFakeTimers()
    vi.setSystemTime(1_000_000)
    syncTimer.mockClear()
    handler = null
    const stub: CapacitorStub = {
      isNativePlatform: () => true,
      Plugins: {
        LocalNotifications: {
          requestPermissions: vi.fn().mockResolvedValue({ display: 'granted' }),
          schedule: vi.fn().mockResolvedValue(undefined),
          cancel: vi.fn().mockResolvedValue(undefined),
        },
        BkOngoing: {
          startCountdown: vi.fn().mockResolvedValue(undefined),
          stop: vi.fn().mockResolvedValue(undefined),
          scheduleEndAlarm: vi.fn().mockResolvedValue(undefined),
          cancelEndAlarm: vi.fn().mockResolvedValue(undefined),
          getAppInfo: vi.fn().mockResolvedValue({ versionName: '0.28.0' }),
          syncTimer,
          addListener: vi.fn((_event: string, callback: (data: { kind?: string }) => void) => {
            handler = callback
            return Promise.resolve({ remove: () => Promise.resolve() })
          }),
        },
      },
    }
    ;(globalThis as { Capacitor?: CapacitorStub }).Capacitor = stub
  })
  afterEach(() => {
    delete (globalThis as { Capacitor?: CapacitorStub }).Capacitor
    vi.useRealTimers()
  })

  it('start publica running con el endsAt absoluto y el ejercicio; clear publica stopped', () => {
    const timer = useRestTimerStore()
    timer.start(90, 'Press banca')
    expect(syncTimer).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: 'rest',
        state: 'running',
        targetEpochMs: 1_000_000 + 90_000,
        totalMs: 90_000,
        title: expect.stringContaining('Press banca'),
      }),
    )
    timer.clear()
    expect(syncTimer).toHaveBeenLastCalledWith({ kind: 'rest', state: 'stopped', targetEpochMs: 0, totalMs: 0, title: '', reason: 'cancelled' })
  })

  it('cancelar desde el reloj hace clear() del descanso activo (y solo del descanso)', () => {
    const timer = useRestTimerStore()
    timer.start(60)
    expect(handler).not.toBeNull()
    handler!({ kind: 'cardio' })
    expect(timer.active).toBe(true)
    handler!({ kind: 'rest' })
    expect(timer.active).toBe(false)
    expect(syncTimer).toHaveBeenLastCalledWith({ kind: 'rest', state: 'stopped', targetEpochMs: 0, totalMs: 0, title: '', reason: 'cancelled' })
  })

  // v0.29.0: el reloj sigue vibrando hasta el OK si el descanso terminó solo
  it('terminar solo publica stopped con reason finished (el reloj no calla); cancelar, cancelled', () => {
    vi.stubGlobal('navigator', { vibrate: vi.fn() })
    const timer = useRestTimerStore()
    timer.start(10)
    vi.setSystemTime(1_000_000 + 10_500)
    vi.advanceTimersByTime(600)
    vi.advanceTimersByTime(3_100)
    expect(timer.active).toBe(false)
    expect(syncTimer).toHaveBeenLastCalledWith(expect.objectContaining({ kind: 'rest', state: 'stopped', reason: 'finished' }))
    vi.unstubAllGlobals()
  })
})

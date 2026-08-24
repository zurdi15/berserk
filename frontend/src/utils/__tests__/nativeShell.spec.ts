// v0.16.0 — puente del shell Android: lo que se puede probar sin nativo es
// la LÓGICA de detección/gating, que es justo donde vivió el crash real de
// zurdi ("al darle a registrar serie la apk se cierra"): un shell viejo NO
// debe recibir scheduleEndAlarm (SecurityException nativa = app muerta, el
// catch de JS no la ve), y la comparación de versiones decide el aviso de
// "hay APK nueva".
import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  checkNativeShellUpdate,
  getWearStatus,
  hasWearBridge,
  hasWearExerciseBridge,
  onWearExerciseCommand,
  onWearTimerCancelled,
  openNativeShellDownload,
  scheduleNativeRestNotification,
  startNativeRestCountdown,
  syncWearExercise,
  syncWearTimer,
} from '../nativeShell'

type CapacitorStub = {
  isNativePlatform: () => boolean
  Plugins: Record<string, unknown>
}

function installCapacitor(bkOngoing: Record<string, unknown>): void {
  const stub: CapacitorStub = {
    isNativePlatform: () => true,
    Plugins: {
      // el permiso memoizado se resuelve concedido para no interferir
      LocalNotifications: {
        requestPermissions: vi.fn().mockResolvedValue({ display: 'granted' }),
        schedule: vi.fn().mockResolvedValue(undefined),
        cancel: vi.fn().mockResolvedValue(undefined),
      },
      BkOngoing: bkOngoing,
    },
  }
  ;(globalThis as { Capacitor?: CapacitorStub }).Capacitor = stub
}

afterEach(() => {
  delete (globalThis as { Capacitor?: CapacitorStub }).Capacitor
  vi.restoreAllMocks()
})

describe('checkNativeShellUpdate', () => {
  it('fuera del shell nunca hay actualización', async () => {
    expect(await checkNativeShellUpdate('0.16.0')).toEqual({
      available: false,
      shellVersion: null,
    })
  })

  it('un shell sin getAppInfo es por definición más viejo que este bundle', async () => {
    installCapacitor({})
    expect(await checkNativeShellUpdate('0.16.0')).toEqual({
      available: true,
      shellVersion: null,
    })
  })

  it('shell por detrás del bundle → hay actualización; al día o por delante → no', async () => {
    installCapacitor({ getAppInfo: vi.fn().mockResolvedValue({ versionName: '0.15.0' }) })
    expect(await checkNativeShellUpdate('0.16.0')).toEqual({
      available: true,
      shellVersion: '0.15.0',
    })

    installCapacitor({ getAppInfo: vi.fn().mockResolvedValue({ versionName: '0.16.0' }) })
    expect((await checkNativeShellUpdate('0.16.0')).available).toBe(false)

    // comparación numérica por componente, no lexicográfica ("0.9.0" > "0.16.0" como string)
    installCapacitor({ getAppInfo: vi.fn().mockResolvedValue({ versionName: '0.9.0' }) })
    expect((await checkNativeShellUpdate('0.16.0')).available).toBe(true)

    installCapacitor({ getAppInfo: vi.fn().mockResolvedValue({ versionName: '1.0.0' }) })
    expect((await checkNativeShellUpdate('0.16.0')).available).toBe(false)
  })
})

describe('scheduleNativeRestNotification — gating del crash de shells viejos', () => {
  it('shell viejo (scheduleEndAlarm sin getAppInfo): NO llama al alarm, cae a LocalNotifications', async () => {
    const scheduleEndAlarm = vi.fn().mockResolvedValue(undefined)
    installCapacitor({ scheduleEndAlarm })
    await scheduleNativeRestNotification(Date.now() + 60_000, 'berserk', 'fin')
    expect(scheduleEndAlarm).not.toHaveBeenCalled()
    const cap = (globalThis as { Capacitor?: CapacitorStub }).Capacitor!
    const locals = cap.Plugins.LocalNotifications as { schedule: ReturnType<typeof vi.fn> }
    expect(locals.schedule).toHaveBeenCalledTimes(1)
  })

  it('shell con el fix (getAppInfo presente): usa scheduleEndAlarm', async () => {
    const scheduleEndAlarm = vi.fn().mockResolvedValue(undefined)
    installCapacitor({
      scheduleEndAlarm,
      getAppInfo: vi.fn().mockResolvedValue({ versionName: '0.16.0' }),
    })
    await scheduleNativeRestNotification(Date.now() + 60_000, 'berserk', 'fin')
    expect(scheduleEndAlarm).toHaveBeenCalledTimes(1)
  })
})

describe('openNativeShellDownload', () => {
  it('abre el asset de la release con openUrl del plugin', async () => {
    const openUrl = vi.fn().mockResolvedValue(undefined)
    installCapacitor({ openUrl })
    await openNativeShellDownload('0.16.0')
    expect(openUrl).toHaveBeenCalledWith({
      url: 'https://github.com/zurdi15/berserk/releases/download/v0.16.0/berserk-v0.16.0.apk',
    })
  })

  it('shell viejo sin openUrl: window.open como fallback', async () => {
    installCapacitor({})
    const open = vi.spyOn(window, 'open').mockReturnValue(null)
    await openNativeShellDownload('0.16.0')
    expect(open).toHaveBeenCalledWith(
      'https://github.com/zurdi15/berserk/releases/download/v0.16.0/berserk-v0.16.0.apk',
      '_blank',
    )
  })
})

// v0.28.0 reloj: el puente a la Data Layer es opcional (las shells anteriores
// no tienen syncTimer) y SIEMPRE silencioso — nada del reloj puede romper el
// descanso del móvil.
describe('reloj Wear OS — syncWearTimer / getWearStatus / onWearTimerCancelled', () => {
  it('fuera del shell o sin syncTimer (APK vieja): no-op sin error', async () => {
    expect(hasWearBridge()).toBe(false)
    await expect(
      syncWearTimer({ kind: 'rest', state: 'running', targetEpochMs: 1, totalMs: 1, title: 'x' }),
    ).resolves.toBeUndefined()
    installCapacitor({})
    expect(hasWearBridge()).toBe(false)
    await expect(syncWearTimer({ kind: 'rest', state: 'stopped' })).resolves.toBeUndefined()
    expect(await getWearStatus()).toBeNull()
  })

  it('con syncTimer: publica el payload completo (defaults para lo opcional)', async () => {
    const syncTimer = vi.fn().mockResolvedValue(undefined)
    installCapacitor({ syncTimer })
    expect(hasWearBridge()).toBe(true)
    await syncWearTimer({ kind: 'cardio', state: 'running', targetEpochMs: 5_000, totalMs: 4_000, title: 'Cardio · Cinta' })
    expect(syncTimer).toHaveBeenCalledWith({
      kind: 'cardio',
      state: 'running',
      targetEpochMs: 5_000,
      totalMs: 4_000,
      title: 'Cardio · Cinta',
      reason: '',
    })
    await syncWearTimer({ kind: 'cardio', state: 'stopped' })
    expect(syncTimer).toHaveBeenLastCalledWith({ kind: 'cardio', state: 'stopped', targetEpochMs: 0, totalMs: 0, title: '', reason: '' })
    await syncWearTimer({ kind: 'rest', state: 'stopped', reason: 'finished' })
    expect(syncTimer).toHaveBeenLastCalledWith(expect.objectContaining({ reason: 'finished' }))
  })

  it('un fallo nativo (sin Play Services) no se propaga', async () => {
    installCapacitor({ syncTimer: vi.fn().mockRejectedValue(new Error('no gms')) })
    await expect(syncWearTimer({ kind: 'rest', state: 'stopped' })).resolves.toBeUndefined()
  })

  it('getWearStatus normaliza la respuesta nativa (y un fallo es null)', async () => {
    installCapacitor({
      getWearStatus: vi.fn().mockResolvedValue({ playServices: true, connected: true, appInstalled: true, watchName: 'Galaxy Watch8' }),
    })
    expect(await getWearStatus()).toEqual({ playServices: true, connected: true, appInstalled: true, watchName: 'Galaxy Watch8' })

    installCapacitor({ getWearStatus: vi.fn().mockResolvedValue({ playServices: true, watchName: null }) })
    expect(await getWearStatus()).toEqual({ playServices: true, connected: false, appInstalled: false, watchName: null })

    installCapacitor({ getWearStatus: vi.fn().mockRejectedValue(new Error('boom')) })
    expect(await getWearStatus()).toBeNull()
  })

  it('onWearTimerCancelled: una suscripción por plugin, reparto por kind y baja', () => {
    let handler: ((data: { kind?: string }) => void) | null = null
    const addListener = vi.fn((_event: string, callback: (data: { kind?: string }) => void) => {
      handler = callback
      return Promise.resolve({ remove: () => Promise.resolve() })
    })
    installCapacitor({ syncTimer: vi.fn(), addListener })

    const first = vi.fn()
    const second = vi.fn()
    const offFirst = onWearTimerCancelled(first)
    onWearTimerCancelled(second)
    expect(addListener).toHaveBeenCalledTimes(1)
    expect(addListener).toHaveBeenCalledWith('timerCancelled', expect.any(Function))

    handler!({ kind: 'rest' })
    expect(first).toHaveBeenCalledWith('rest')
    expect(second).toHaveBeenCalledWith('rest')

    // kind desconocido: se ignora
    handler!({ kind: 'nap' })
    expect(first).toHaveBeenCalledTimes(1)

    offFirst()
    handler!({ kind: 'cardio' })
    expect(first).toHaveBeenCalledTimes(1)
    expect(second).toHaveBeenCalledTimes(2)
  })
})

// v0.30.0: la tarjeta "bonita" del móvil recibe subtítulo e imagen ABSOLUTA
describe('startNativeRestCountdown — extras para la tarjeta del móvil', () => {
  it('manda subtítulo e imagen absoluta; sin extras, cadenas vacías', async () => {
    const startCountdown = vi.fn().mockResolvedValue(undefined)
    installCapacitor({ startCountdown })
    await startNativeRestCountdown(5_000, 'Descanso', { subtitle: 'Press banca', imageUrl: '/api/v1/exercises/7/image' })
    expect(startCountdown).toHaveBeenCalledWith(
      expect.objectContaining({ id: 1002, whenMs: 5_000, title: 'Descanso', subtitle: 'Press banca', imageUrl: expect.stringMatching(/^https?:\/\/.+\/api\/v1\/exercises\/7\/image$/) }),
    )
    await startNativeRestCountdown(6_000, 'Descanso')
    expect(startCountdown).toHaveBeenLastCalledWith(expect.objectContaining({ subtitle: '', imageUrl: '' }))
  })
})

// v0.38.0 (zurdi: "añadir serie desde el reloj y poder finalizar ejercicio"):
// el ejercicio actual va al reloj por un DataItem propio y las órdenes vuelven
// como evento `exerciseCommand`; misma disciplina que el puente de timers —
// opcional (shells anteriores no tienen syncExercise) y silencioso
describe('reloj Wear OS — syncWearExercise / onWearExerciseCommand', () => {
  it('sin syncExercise: no-op sin error; con él, payload completo con defaults', async () => {
    installCapacitor({})
    expect(hasWearExerciseBridge()).toBe(false)
    await expect(syncWearExercise({ state: 'none' })).resolves.toBeUndefined()

    const syncExercise = vi.fn().mockResolvedValue(undefined)
    installCapacitor({ syncExercise })
    expect(hasWearExerciseBridge()).toBe(true)
    await syncWearExercise({ state: 'exercise', weid: 20, name: 'Press banca', setsDone: 1, setsTarget: 3, nextLabel: '8 × 60 kg', canLog: true })
    expect(syncExercise).toHaveBeenCalledWith({
      state: 'exercise',
      weid: 20,
      name: 'Press banca',
      setsDone: 1,
      setsTarget: 3,
      nextLabel: '8 × 60 kg',
      canLog: true,
      completed: false,
      // v0.39.0: sin desglose = sin steppers en el reloj
      reps: 0, loadMode: 'none', load: 0, loadUnit: '', loadStep: 0, loadMin: 0, loadMax: 0,
    })
    await syncWearExercise({ state: 'none' })
    expect(syncExercise).toHaveBeenLastCalledWith({
      state: 'none', weid: 0, name: '', setsDone: 0, setsTarget: 0, nextLabel: '', canLog: false, completed: false,
      reps: 0, loadMode: 'none', load: 0, loadUnit: '', loadStep: 0, loadMin: 0, loadMax: 0,
    })

    installCapacitor({ syncExercise: vi.fn().mockRejectedValue(new Error('no gms')) })
    await expect(syncWearExercise({ state: 'none' })).resolves.toBeUndefined()
  })

  it('onWearExerciseCommand: reparte action + weid (también negativos), ignora lo malformado, y baja', () => {
    let handler: ((data: Record<string, unknown>) => void) | null = null
    const addListener = vi.fn((event: string, callback: (data: Record<string, unknown>) => void) => {
      if (event === 'exerciseCommand') handler = callback
      return Promise.resolve({ remove: () => Promise.resolve() })
    })
    installCapacitor({ syncExercise: vi.fn(), addListener })

    const listener = vi.fn()
    const off = onWearExerciseCommand(listener)
    expect(addListener).toHaveBeenCalledWith('exerciseCommand', expect.any(Function))

    handler!({ action: 'logSet', weid: 20 })
    expect(listener).toHaveBeenCalledWith('logSet', 20, {})
    // alta hecha sin red en el móvil: id temporal negativo, vale igual
    handler!({ action: 'complete', weid: -3 })
    expect(listener).toHaveBeenCalledWith('complete', -3, {})
    // v0.39.0: lo ajustado en los steppers del reloj viaja con la orden; lo
    // que no sea un número positivo se ignora
    handler!({ action: 'logSet', weid: 20, reps: 8, load: 62.5 })
    expect(listener).toHaveBeenCalledWith('logSet', 20, { reps: 8, load: 62.5 })
    handler!({ action: 'logSet', weid: 20, reps: 'ocho', load: -1 })
    expect(listener).toHaveBeenLastCalledWith('logSet', 20, {})

    handler!({ action: 'nap', weid: 1 })
    handler!({ action: 'logSet', weid: 'x' })
    expect(listener).toHaveBeenCalledTimes(4)

    off()
    handler!({ action: 'logSet', weid: 20 })
    expect(listener).toHaveBeenCalledTimes(4)
  })
})

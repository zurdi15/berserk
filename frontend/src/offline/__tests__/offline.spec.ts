import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/api/domain', () => ({
  startWorkout: vi.fn(),
  addWorkoutExercise: vi.fn(),
  logSet: vi.fn(),
  updateSet: vi.fn(),
  deleteSet: vi.fn(),
  updateWorkoutExercise: vi.fn(),
  removeWorkoutExercise: vi.fn(),
  finishWorkout: vi.fn(),
}))

import * as domain from '@/api/domain'
import { ApiError, OfflineError } from '@/api/client'
import * as outbox from '../outbox'
import { markOffline, markOnline, onBackOnline, online } from '../net'
import { cacheRead, clearReadCache, readCached } from '../readCache'

// entorno de este repo: el localStorage global es un stub roto de Node —
// mismo mock en memoria que athlete.spec.ts/uiPrefs.spec.ts
function mockStorage(): Storage {
  const store = new Map<string, string>()
  return {
    getItem: (key: string) => (store.has(key) ? store.get(key)! : null),
    setItem: (key: string, value: string) => { store.set(key, value) },
    removeItem: (key: string) => { store.delete(key) },
    clear: () => { store.clear() },
    key: (index: number) => Array.from(store.keys())[index] ?? null,
    get length() { return store.size },
  } as Storage
}

describe('offline/net', () => {
  beforeEach(() => {
    online.value = true
  })

  it('markOffline flips the flag; markOnline fires the back-online callbacks exactly on the transition', () => {
    const callback = vi.fn()
    const dispose = onBackOnline(callback)

    markOnline() // ya online: sin transición, sin callback
    expect(callback).not.toHaveBeenCalled()

    markOffline()
    expect(online.value).toBe(false)
    markOnline()
    expect(online.value).toBe(true)
    expect(callback).toHaveBeenCalledTimes(1)
    dispose()
  })
})

describe('offline/readCache', () => {
  beforeEach(() => vi.stubGlobal('localStorage', mockStorage()))

  it('round-trips reads and clears only its own keys', () => {
    localStorage.setItem('bk:theme', 'dark')
    cacheRead('/workouts/active', { id: 4 })
    expect(readCached('/workouts/active')).toEqual({ hit: true, data: { id: 4 } })
    expect(readCached('/never-seen')).toEqual({ hit: false })

    clearReadCache()
    expect(readCached('/workouts/active')).toEqual({ hit: false })
    // las claves ajenas (uiPrefs, etc.) no se tocan
    expect(localStorage.getItem('bk:theme')).toBe('dark')
  })
})

describe('offline/outbox replay', () => {
  beforeEach(() => {
    vi.stubGlobal('localStorage', mockStorage())
    outbox.refreshPendingCount()
    vi.clearAllMocks()
  })

  function queueOfflineWorkoutChain() {
    // cadena completa creada offline: entreno temporal (-1) desde rutina con
    // un ejercicio copiado (-2), una serie (-3) y el cierre — todo con
    // referencias temporales que el replay debe resolver en orden
    outbox.enqueue({
      id: 'uuid-start',
      kind: 'startWorkout',
      tempWorkoutId: -1,
      body: { routine_id: 9 },
      tempExerciseIds: [-2],
    })
    outbox.enqueue({
      id: 'uuid-set',
      kind: 'logSet',
      workoutId: -1,
      exerciseId: -2,
      tempSetId: -3,
      body: { reps: 5, weight_kg: 100 },
    })
    outbox.enqueue({ id: 'uuid-finish', kind: 'finishWorkout', workoutId: -1 })
  }

  it('replays FIFO resolving temp ids across the chain and reports the drain', async () => {
    queueOfflineWorkoutChain()
    expect(outbox.pendingCount.value).toBe(3)

    vi.mocked(domain.startWorkout).mockResolvedValue({ id: 100, exercises: [{ id: 200 }] } as never)
    vi.mocked(domain.logSet).mockResolvedValue({ set: { id: 300 }, new_records: [] } as never)
    vi.mocked(domain.finishWorkout).mockResolvedValue({} as never)
    const drained = vi.fn()
    const dispose = outbox.onDrained(drained)

    await outbox.syncNow()

    expect(domain.startWorkout).toHaveBeenCalledWith({ routine_id: 9, client_id: 'uuid-start' })
    expect(domain.logSet).toHaveBeenCalledWith(100, 200, { reps: 5, weight_kg: 100, client_id: 'uuid-set' })
    expect(domain.finishWorkout).toHaveBeenCalledWith(100)
    expect(outbox.pendingCount.value).toBe(0)
    expect(drained).toHaveBeenCalledWith({ synced: 3, conflicts: 0 })
    dispose()
  })

  it('a network failure mid-replay stops the drain and keeps the remaining queue intact', async () => {
    queueOfflineWorkoutChain()
    vi.mocked(domain.startWorkout).mockResolvedValue({ id: 100, exercises: [{ id: 200 }] } as never)
    vi.mocked(domain.logSet).mockRejectedValue(new OfflineError())
    const drained = vi.fn()
    const dispose = outbox.onDrained(drained)

    await outbox.syncNow()

    // el start sí entró (se quita de la cola); la serie y el cierre esperan
    expect(outbox.pendingCount.value).toBe(2)
    expect(drained).not.toHaveBeenCalled()

    // reintento con red: el mapa temp→real PERSISTIDO resuelve el workout -1
    // aunque su entrada ya no esté en la cola
    vi.mocked(domain.logSet).mockResolvedValue({ set: { id: 300 }, new_records: [] } as never)
    vi.mocked(domain.finishWorkout).mockResolvedValue({} as never)
    await outbox.syncNow()
    expect(domain.logSet).toHaveBeenLastCalledWith(100, 200, expect.objectContaining({ client_id: 'uuid-set' }))
    expect(outbox.pendingCount.value).toBe(0)
    expect(drained).toHaveBeenCalledWith({ synced: 2, conflicts: 0 })
    dispose()
  })

  it('a real server rejection drops the entry as a conflict and the queue keeps draining', async () => {
    queueOfflineWorkoutChain()
    vi.mocked(domain.startWorkout).mockResolvedValue({ id: 100, exercises: [{ id: 200 }] } as never)
    vi.mocked(domain.logSet).mockRejectedValue(new ApiError(422, 'invalid_set_fields'))
    vi.mocked(domain.finishWorkout).mockResolvedValue({} as never)
    const drained = vi.fn()
    const dispose = outbox.onDrained(drained)

    await outbox.syncNow()

    expect(outbox.pendingCount.value).toBe(0)
    expect(domain.finishWorkout).toHaveBeenCalledWith(100)
    expect(drained).toHaveBeenCalledWith({ synced: 2, conflicts: 1 })
    dispose()
  })

  it('replaying a delete that 404s counts as success (it is already gone)', async () => {
    outbox.enqueue({ id: 'uuid-del', kind: 'deleteSet', workoutId: 4, exerciseId: 7, setId: 9 })
    vi.mocked(domain.deleteSet).mockRejectedValue(new ApiError(404, 'not_found'))
    const drained = vi.fn()
    const dispose = outbox.onDrained(drained)

    await outbox.syncNow()

    expect(outbox.pendingCount.value).toBe(0)
    expect(drained).toHaveBeenCalledWith({ synced: 1, conflicts: 0 })
    dispose()
  })
})

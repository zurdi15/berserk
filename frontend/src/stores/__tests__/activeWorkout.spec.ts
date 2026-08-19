import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/api/domain', () => ({
  getActiveWorkout: vi.fn(),
  startWorkout: vi.fn(),
  getWorkout: vi.fn(),
  finishWorkout: vi.fn(),
  logSet: vi.fn(),
  addWorkoutExercise: vi.fn(),
  removeWorkoutExercise: vi.fn(),
  reorderWorkoutExercises: vi.fn(),
  updateSet: vi.fn(),
  deleteSet: vi.fn(),
  deleteWorkout: vi.fn(),
  getExerciseHistory: vi.fn(),
  updateWorkoutExercise: vi.fn(),
}))

import * as domain from '@/api/domain'
import { ApiError } from '@/api/client'
import { useActiveWorkoutStore } from '../activeWorkout'
import { useRestTimerStore } from '../restTimer'

const workout = { id: 4, date: '2026-08-05', ended_at: null, exercises: [], muscle_tag_ids: [] }

describe('active workout store', () => {
  beforeEach(() => setActivePinia(createPinia()))

  it('resume swallows no_active_workout silently', async () => {
    vi.mocked(domain.getActiveWorkout).mockRejectedValue(new ApiError(404, 'no_active_workout'))
    const store = useActiveWorkoutStore()
    await store.resume()
    expect(store.workout).toBeNull()
  })

  it('logSet refreshes and queues new records', async () => {
    vi.mocked(domain.getActiveWorkout).mockResolvedValue(workout as never)
    const store = useActiveWorkoutStore()
    await store.resume()
    vi.mocked(domain.logSet).mockResolvedValue({
      set: { id: 1, set_number: 1 },
      new_records: [{ id: 9, kind: 'max_weight', value: 100 }],
    } as never)
    vi.mocked(domain.getWorkout).mockResolvedValue(workout as never)
    await store.logSet(9, { reps: 5, weight_kg: 100, is_warmup: false })
    expect(store.lastRecords).toHaveLength(1)
    expect(domain.getWorkout).toHaveBeenCalledWith(4)
  })

  // v0.17.0 bloques: el alta desde el stepper viaja con la etiqueta del
  // bloque visible; sin etiqueta no manda block_label (comportamiento viejo)
  it('addExercise forwards the block label to the API (and omits it when absent)', async () => {
    vi.mocked(domain.getActiveWorkout).mockResolvedValue(workout as never)
    const store = useActiveWorkoutStore()
    await store.resume()
    vi.mocked(domain.addWorkoutExercise).mockResolvedValue({ id: 7 } as never)
    vi.mocked(domain.getWorkout).mockResolvedValue(workout as never)

    await store.addExercise(9, 'Empuje')
    expect(domain.addWorkoutExercise).toHaveBeenCalledWith(4, {
      exercise_id: 9,
      block_label: 'Empuje',
    })

    await store.addExercise(10)
    expect(domain.addWorkoutExercise).toHaveBeenLastCalledWith(4, {
      exercise_id: 10,
      block_label: undefined,
    })
  })

  // v0.18.1: mover un ejercicio de bloque mid-entreno (PATCH block_label)
  it('setExerciseBlock patches the block label and refreshes', async () => {
    vi.mocked(domain.getActiveWorkout).mockResolvedValue(workout as never)
    const store = useActiveWorkoutStore()
    await store.resume()
    vi.mocked(domain.updateWorkoutExercise).mockResolvedValue({} as never)
    vi.mocked(domain.getWorkout).mockResolvedValue(workout as never)

    await store.setExerciseBlock(9, 'Tirón')
    expect(domain.updateWorkoutExercise).toHaveBeenCalledWith(4, 9, { block_label: 'Tirón' })

    await store.setExerciseBlock(9, null)
    expect(domain.updateWorkoutExercise).toHaveBeenLastCalledWith(4, 9, { block_label: null })
  })

  it('updateSet never touches lastRecords (celebration only fires from live logging via logSet)', async () => {
    vi.mocked(domain.getActiveWorkout).mockResolvedValue(workout as never)
    const store = useActiveWorkoutStore()
    await store.resume()
    store.lastRecords = [{ id: 9, kind: 'max_weight', value: 100 }] as never
    vi.mocked(domain.updateSet).mockResolvedValue(undefined as never)
    vi.mocked(domain.getWorkout).mockResolvedValue(workout as never)

    await store.updateSet(9, 1, { reps: 5, weight_kg: 100, is_warmup: false })

    expect(store.lastRecords).toHaveLength(1)
    expect(store.lastRecords[0]).toEqual({ id: 9, kind: 'max_weight', value: 100 })
  })

  it('finish returns the workout and clears state', async () => {
    vi.mocked(domain.getActiveWorkout).mockResolvedValue(workout as never)
    const store = useActiveWorkoutStore()
    await store.resume()
    vi.mocked(domain.finishWorkout).mockResolvedValue({ ...workout, ended_at: 'x' } as never)
    const finished = await store.finish()
    expect(finished.ended_at).toBe('x')
    expect(store.workout).toBeNull()
  })

  it('discard resets workout and lastRecords and stops the rest timer when the API resolves', async () => {
    vi.mocked(domain.getActiveWorkout).mockResolvedValue(workout as never)
    const store = useActiveWorkoutStore()
    await store.resume()
    store.lastRecords = [{ id: 9, kind: 'max_weight', value: 100 }] as any
    const restTimer = useRestTimerStore()
    restTimer.start(60)
    vi.mocked(domain.deleteWorkout).mockResolvedValue(undefined as never)

    await store.discard()

    expect(domain.deleteWorkout).toHaveBeenCalledWith(4)
    expect(store.workout).toBeNull()
    expect(store.lastRecords).toEqual([])
    expect(restTimer.active).toBe(false)
  })

  it('discard propagates the API error without clearing workout, lastRecords or the rest timer', async () => {
    vi.mocked(domain.getActiveWorkout).mockResolvedValue(workout as never)
    const store = useActiveWorkoutStore()
    await store.resume()
    store.lastRecords = [{ id: 9, kind: 'max_weight', value: 100 }] as any
    const restTimer = useRestTimerStore()
    restTimer.start(60)
    vi.mocked(domain.deleteWorkout).mockRejectedValue(new Error('boom'))

    await expect(store.discard()).rejects.toThrow('boom')

    expect(store.workout).toEqual(workout)
    expect(store.lastRecords).toEqual([{ id: 9, kind: 'max_weight', value: 100 }])
    expect(restTimer.active).toBe(true)
  })

  it('reset clears workout and lastRecords (for logout)', () => {
    const store = useActiveWorkoutStore()
    store.workout = workout as any
    store.lastRecords = [{ id: 9, kind: 'max_weight', value: 100 }] as any
    store.reset()
    expect(store.workout).toBeNull()
    expect(store.lastRecords).toHaveLength(0)
  })

  describe('exerciseHistory (item 3)', () => {
    // los tests de este bloque afirman conteos exactos de llamadas: el mock
    // de domain no se limpia solo entre tests (no hay clearMocks global aquí,
    // ver otros describe de este archivo que solo usan toHaveBeenCalledWith)
    beforeEach(() => {
      vi.mocked(domain.getExerciseHistory).mockClear()
    })

    it('fetches with the current workout id as exclude_workout_id and caches the result', async () => {
      vi.mocked(domain.getActiveWorkout).mockResolvedValue(workout as never)
      const store = useActiveWorkoutStore()
      await store.resume()
      vi.mocked(domain.getExerciseHistory).mockResolvedValue({
        workout_id: 1, date: '2026-08-01', sets: [],
      } as never)

      const first = await store.exerciseHistory(5)
      const second = await store.exerciseHistory(5)

      expect(domain.getExerciseHistory).toHaveBeenCalledWith(5, { exclude_workout_id: 4 })
      expect(domain.getExerciseHistory).toHaveBeenCalledTimes(1)
      expect(first).toEqual(second)
    })

    it('caches a null result too (never trained) without refetching', async () => {
      vi.mocked(domain.getActiveWorkout).mockResolvedValue(workout as never)
      const store = useActiveWorkoutStore()
      await store.resume()
      vi.mocked(domain.getExerciseHistory).mockResolvedValue(null as never)

      expect(await store.exerciseHistory(5)).toBeNull()
      expect(await store.exerciseHistory(5)).toBeNull()
      expect(domain.getExerciseHistory).toHaveBeenCalledTimes(1)
    })

    it('resume clears the cache since it may resolve to a different workout', async () => {
      vi.mocked(domain.getActiveWorkout).mockResolvedValue(workout as never)
      const store = useActiveWorkoutStore()
      await store.resume()
      vi.mocked(domain.getExerciseHistory).mockResolvedValue({
        workout_id: 1, date: '2026-08-01', sets: [],
      } as never)
      await store.exerciseHistory(5)

      await store.resume()
      await store.exerciseHistory(5)

      expect(domain.getExerciseHistory).toHaveBeenCalledTimes(2)
    })
  })

  it('setExerciseRest patches the workout exercise and refreshes (item 11)', async () => {
    vi.mocked(domain.getActiveWorkout).mockResolvedValue(workout as never)
    const store = useActiveWorkoutStore()
    await store.resume()
    vi.mocked(domain.updateWorkoutExercise).mockResolvedValue({ id: 9, rest_seconds: 120 } as never)
    vi.mocked(domain.getWorkout).mockResolvedValue(workout as never)

    await store.setExerciseRest(9, 120)

    expect(domain.updateWorkoutExercise).toHaveBeenCalledWith(4, 9, { rest_seconds: 120 })
    expect(domain.getWorkout).toHaveBeenCalledWith(4)
  })
})

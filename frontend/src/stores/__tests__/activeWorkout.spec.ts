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
}))

import * as domain from '@/api/domain'
import { ApiError } from '@/api/client'
import { useActiveWorkoutStore } from '../activeWorkout'

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

  it('reset clears workout and lastRecords (for logout)', () => {
    const store = useActiveWorkoutStore()
    store.workout = workout as any
    store.lastRecords = [{ id: 9, kind: 'max_weight', value: 100 }] as any
    store.reset()
    expect(store.workout).toBeNull()
    expect(store.lastRecords).toHaveLength(0)
  })
})

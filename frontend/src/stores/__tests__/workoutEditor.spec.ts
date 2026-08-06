import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/api/domain', () => ({
  getWorkout: vi.fn(),
  logSet: vi.fn(),
  addWorkoutExercise: vi.fn(),
  removeWorkoutExercise: vi.fn(),
  reorderWorkoutExercises: vi.fn(),
  updateSet: vi.fn(),
  deleteSet: vi.fn(),
  setWorkoutMuscleTags: vi.fn(),
  updateWorkout: vi.fn(),
}))

import * as domain from '@/api/domain'
import { useWorkoutEditorStore } from '../workoutEditor'

const workout = {
  id: 4,
  date: '2026-07-20',
  started_at: '2026-07-20T12:00:00',
  ended_at: '2026-07-20T12:00:00',
  routine_id: null,
  note: null,
  feeling: null,
  exercises: [],
  muscle_tag_ids: [],
}

describe('workout editor store', () => {
  beforeEach(() => setActivePinia(createPinia()))

  it('load fetches the workout by id, not the "active" one', async () => {
    vi.mocked(domain.getWorkout).mockResolvedValue(workout as never)
    const store = useWorkoutEditorStore()
    await store.load(4)
    expect(domain.getWorkout).toHaveBeenCalledWith(4)
    expect(store.workout).toEqual(workout)
  })

  it('has no lastRecords (no celebration state) unlike activeWorkout', async () => {
    vi.mocked(domain.getWorkout).mockResolvedValue(workout as never)
    const store = useWorkoutEditorStore()
    await store.load(4)
    expect('lastRecords' in store).toBe(false)
  })

  it('logSet refreshes the workout from the server after logging', async () => {
    vi.mocked(domain.getWorkout).mockResolvedValue(workout as never)
    const store = useWorkoutEditorStore()
    await store.load(4)
    vi.mocked(domain.logSet).mockResolvedValue({
      set: { id: 1, set_number: 1 },
      new_records: [{ id: 9, kind: 'max_weight', value: 100 }],
    } as never)

    const result = await store.logSet(9, { reps: 5, weight_kg: 100, is_warmup: false })

    expect(domain.logSet).toHaveBeenCalledWith(4, 9, { reps: 5, weight_kg: 100, is_warmup: false })
    expect(domain.getWorkout).toHaveBeenCalledWith(4)
    expect(result.new_records).toHaveLength(1)
  })

  it('updateSet refreshes the workout from the server', async () => {
    vi.mocked(domain.getWorkout).mockResolvedValue(workout as never)
    const store = useWorkoutEditorStore()
    await store.load(4)
    vi.mocked(domain.updateSet).mockResolvedValue(undefined as never)
    vi.mocked(domain.getWorkout).mockClear()
    vi.mocked(domain.getWorkout).mockResolvedValue(workout as never)

    await store.updateSet(9, 1, { reps: 6, weight_kg: 100, is_warmup: false })

    expect(domain.updateSet).toHaveBeenCalledWith(4, 9, 1, { reps: 6, weight_kg: 100, is_warmup: false })
    expect(domain.getWorkout).toHaveBeenCalledWith(4)
  })

  it('deleteSet refreshes the workout from the server', async () => {
    vi.mocked(domain.getWorkout).mockResolvedValue(workout as never)
    const store = useWorkoutEditorStore()
    await store.load(4)
    vi.mocked(domain.deleteSet).mockResolvedValue(undefined as never)

    await store.deleteSet(9, 1)

    expect(domain.deleteSet).toHaveBeenCalledWith(4, 9, 1)
  })

  it('addExercise and removeExercise refresh the workout from the server', async () => {
    vi.mocked(domain.getWorkout).mockResolvedValue(workout as never)
    const store = useWorkoutEditorStore()
    await store.load(4)
    vi.mocked(domain.addWorkoutExercise).mockResolvedValue({ id: 1 } as never)
    vi.mocked(domain.removeWorkoutExercise).mockResolvedValue(undefined as never)

    await store.addExercise(5)
    expect(domain.addWorkoutExercise).toHaveBeenCalledWith(4, { exercise_id: 5 })

    await store.removeExercise(1)
    expect(domain.removeWorkoutExercise).toHaveBeenCalledWith(4, 1)
  })

  it('reorder assigns the workout returned by the endpoint directly', async () => {
    vi.mocked(domain.getWorkout).mockResolvedValue(workout as never)
    const store = useWorkoutEditorStore()
    await store.load(4)
    const reordered = { ...workout, id: 4 }
    vi.mocked(domain.reorderWorkoutExercises).mockResolvedValue(reordered as never)

    await store.reorder([2, 1])

    expect(domain.reorderWorkoutExercises).toHaveBeenCalledWith(4, [2, 1])
    expect(store.workout).toEqual(reordered)
  })

  it('setMuscleTags assigns the workout returned by the endpoint directly', async () => {
    vi.mocked(domain.getWorkout).mockResolvedValue(workout as never)
    const store = useWorkoutEditorStore()
    await store.load(4)
    vi.mocked(domain.setWorkoutMuscleTags).mockResolvedValue({ ...workout, muscle_tag_ids: [1] } as never)

    await store.setMuscleTags([1])

    expect(domain.setWorkoutMuscleTags).toHaveBeenCalledWith(4, [1])
    expect(store.workout?.muscle_tag_ids).toEqual([1])
  })

  it('patch sends date/note/feeling to updateWorkout and assigns the response', async () => {
    vi.mocked(domain.getWorkout).mockResolvedValue(workout as never)
    const store = useWorkoutEditorStore()
    await store.load(4)
    vi.mocked(domain.updateWorkout).mockResolvedValue({ ...workout, date: '2026-07-21' } as never)

    await store.patch({ date: '2026-07-21' })

    expect(domain.updateWorkout).toHaveBeenCalledWith(4, { date: '2026-07-21' })
    expect(store.workout?.date).toBe('2026-07-21')
  })

  it('reset clears the loaded workout', async () => {
    vi.mocked(domain.getWorkout).mockResolvedValue(workout as never)
    const store = useWorkoutEditorStore()
    await store.load(4)
    store.reset()
    expect(store.workout).toBeNull()
  })
})

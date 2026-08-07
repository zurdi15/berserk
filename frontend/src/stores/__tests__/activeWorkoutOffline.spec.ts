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
  listRoutines: vi.fn(),
}))

import * as domain from '@/api/domain'
import type { WorkoutOut } from '@/api/domain'
import { online } from '@/offline/net'
import * as outbox from '@/offline/outbox'
import { useActiveWorkoutStore } from '../activeWorkout'

// v0.6.0 offline de gimnasio: las ramas offline del store — cambio optimista
// local + entrada en el outbox + snapshot persistido, sin tocar la API
function baseWorkout(): WorkoutOut {
  return {
    id: 4,
    date: '2026-08-07',
    started_at: '2026-08-07T10:00:00',
    ended_at: null,
    routine_id: null,
    note: null,
    feeling: null,
    stretched: false,
    exercises: [
      { id: 7, exercise_id: 1, position: 1, note: null, rest_seconds: 90, superset_group: null, sets: [] },
    ],
    muscle_tag_ids: [],
  }
}

function loadQueue() {
  return JSON.parse(localStorage.getItem('bk:outbox') ?? '[]')
}

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

describe('active workout store — offline branches', () => {
  beforeEach(() => {
    vi.stubGlobal('localStorage', mockStorage())
    setActivePinia(createPinia())
    outbox.refreshPendingCount()
    online.value = false
    vi.clearAllMocks()
  })

  it('logSet offline: optimistic temp set, outbox entry, snapshot persisted, no API call', async () => {
    const store = useActiveWorkoutStore()
    store.workout = baseWorkout()

    const result = await store.logSet(7, { reps: 5, weight_kg: 100 })

    expect(domain.logSet).not.toHaveBeenCalled()
    expect(result.set.id).toBeLessThan(0)
    expect(result.new_records).toEqual([])
    expect(store.workout!.exercises[0].sets).toHaveLength(1)
    expect(store.workout!.exercises[0].sets[0].set_number).toBe(1)

    const queue = loadQueue()
    expect(queue).toHaveLength(1)
    expect(queue[0]).toMatchObject({ kind: 'logSet', workoutId: 4, exerciseId: 7, body: { reps: 5, weight_kg: 100 } })

    const snapshot = JSON.parse(localStorage.getItem('bk:active-workout')!)
    expect(snapshot.exercises[0].sets).toHaveLength(1)
  })

  it('start offline from a cached routine builds the local copy with temp ids', async () => {
    vi.mocked(domain.listRoutines).mockResolvedValue([
      {
        id: 9,
        exercises: [
          { id: 51, exercise_id: 1, position: 1, rest_seconds: 60, superset_group: 0 },
          { id: 52, exercise_id: 2, position: 2, rest_seconds: 60, superset_group: 0 },
        ],
      },
    ] as never)
    const store = useActiveWorkoutStore()

    await store.start({ routine_id: 9 })

    expect(domain.startWorkout).not.toHaveBeenCalled()
    expect(store.workout!.id).toBeLessThan(0)
    expect(store.workout!.exercises).toHaveLength(2)
    expect(store.workout!.exercises.every((e) => e.id < 0)).toBe(true)
    expect(store.workout!.exercises[0].superset_group).toBe(0)

    const queue = loadQueue()
    expect(queue[0]).toMatchObject({ kind: 'startWorkout', body: { routine_id: 9 } })
    expect(queue[0].tempExerciseIds).toHaveLength(2)
  })

  it('finish offline returns the locally-closed workout and queues the finish', async () => {
    const store = useActiveWorkoutStore()
    store.workout = baseWorkout()

    const finished = await store.finish()

    expect(domain.finishWorkout).not.toHaveBeenCalled()
    expect(finished.ended_at).not.toBeNull()
    expect(store.workout).toBeNull()
    expect(loadQueue()).toEqual([expect.objectContaining({ kind: 'finishWorkout', workoutId: 4 })])
    // cerrar limpia el snapshot: no hay entreno activo que reanudar
    expect(localStorage.getItem('bk:active-workout')).toBeNull()
  })

  it('resume with a pending queue trusts the local snapshot over the server', async () => {
    const store = useActiveWorkoutStore()
    store.workout = baseWorkout() // el watch persiste el snapshot
    outbox.enqueue({ id: 'u1', kind: 'finishWorkout', workoutId: 4 })
    store.workout = null
    localStorage.setItem('bk:active-workout', JSON.stringify(baseWorkout()))

    online.value = true // hay red, pero la cola manda
    await store.resume()

    expect(domain.getActiveWorkout).not.toHaveBeenCalled()
    expect(store.workout!.id).toBe(4)
  })

  // v0.8.0: añadir un par enlazado compone altas + bulk — offline entero
  it('addSupersetPair offline: two temp exercises linked as one group, three outbox entries in order', async () => {
    const store = useActiveWorkoutStore()
    store.workout = baseWorkout()

    await store.addSupersetPair(11, 12)

    const exercises = store.workout!.exercises
    expect(exercises).toHaveLength(3)
    expect(exercises.map((e) => e.superset_group)).toEqual([null, 0, 0])
    expect(exercises[1].id).toBeLessThan(0)
    expect(exercises[2].id).toBeLessThan(0)

    const queue = loadQueue()
    expect(queue.map((entry: { kind: string }) => entry.kind)).toEqual([
      'addExercise',
      'addExercise',
      'setSupersetGroups',
    ])
  })

  // v0.7.0: superseries editables mid-workout también sin red
  it('setSupersetGroups offline: applies the grouping locally and queues the bulk entry', async () => {
    const store = useActiveWorkoutStore()
    const base = baseWorkout()
    base.exercises.push({ id: 8, exercise_id: 2, position: 2, note: null, rest_seconds: null, superset_group: null, sets: [] })
    store.workout = base

    await store.setSupersetGroups([0, 0])

    expect(store.workout!.exercises.map((e) => e.superset_group)).toEqual([0, 0])
    expect(loadQueue()).toEqual([
      expect.objectContaining({
        kind: 'setSupersetGroups',
        workoutId: 4,
        groups: [
          { exerciseId: 7, group: 0 },
          { exerciseId: 8, group: 0 },
        ],
      }),
    ])
  })

  it('mutations keep queueing while the outbox has pending entries even if back online (strict FIFO)', async () => {
    const store = useActiveWorkoutStore()
    store.workout = baseWorkout()
    await store.logSet(7, { reps: 5 })

    online.value = true // vuelve la red con la cola sin drenar
    await store.logSet(7, { reps: 8 })

    expect(domain.logSet).not.toHaveBeenCalled()
    expect(loadQueue()).toHaveLength(2)
    expect(store.workout!.exercises[0].sets.map((s) => s.set_number)).toEqual([1, 2])
  })
})

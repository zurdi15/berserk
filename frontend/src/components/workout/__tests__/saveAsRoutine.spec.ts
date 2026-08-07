import { describe, expect, it } from 'vitest'

import { buildRoutineExercisesFromWorkout } from '../saveAsRoutine'

function set(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 1, set_number: 1, reps: 8, weight_kg: 80, duration_seconds: null,
    distance_m: null, is_warmup: false, rpe: null, completed_at: 'x',
    ...overrides,
  }
}

function workout(exercises: unknown[]) {
  return {
    id: 1, date: '2026-08-06', started_at: 'x', ended_at: 'x', routine_id: null,
    note: null, feeling: null, stretched: false, muscle_tag_ids: [], exercises,
  } as never
}

describe('buildRoutineExercisesFromWorkout (item 5)', () => {
  it('maps exercise_id, order, and rest_seconds straight through', () => {
    const w = workout([
      { id: 20, exercise_id: 5, position: 0, note: null, rest_seconds: 120, sets: [set()] },
      { id: 21, exercise_id: 7, position: 1, note: null, rest_seconds: null, sets: [set()] },
    ])
    const items = buildRoutineExercisesFromWorkout(w)
    expect(items.map((i) => i.exercise_id)).toEqual([5, 7])
    expect(items[0].rest_seconds).toBe(120)
    expect(items[1].rest_seconds).toBeNull()
  })

  it('target_sets counts effective (non-warmup) sets only', () => {
    const w = workout([
      { id: 20, exercise_id: 5, position: 0, note: null, rest_seconds: null, sets: [
        set({ id: 1, is_warmup: true }), set({ id: 2 }), set({ id: 3 }), set({ id: 4 }),
      ] },
    ])
    expect(buildRoutineExercisesFromWorkout(w)[0].target_sets).toBe(3)
  })

  it('falls back to counting all sets when every set was warmup, and to 3 when there are none', () => {
    const warmupOnly = workout([
      { id: 20, exercise_id: 5, position: 0, note: null, rest_seconds: null, sets: [set({ is_warmup: true }), set({ id: 2, is_warmup: true })] },
    ])
    expect(buildRoutineExercisesFromWorkout(warmupOnly)[0].target_sets).toBe(2)

    const noSets = workout([
      { id: 20, exercise_id: 5, position: 0, note: null, rest_seconds: null, sets: [] },
    ])
    expect(buildRoutineExercisesFromWorkout(noSets)[0].target_sets).toBe(3)
  })

  it('target_reps is the mode of effective reps, not an average that was never actually done', () => {
    const w = workout([
      { id: 20, exercise_id: 5, position: 0, note: null, rest_seconds: null, sets: [
        set({ id: 1, reps: 8 }), set({ id: 2, reps: 8 }), set({ id: 3, reps: 6 }),
      ] },
    ])
    expect(buildRoutineExercisesFromWorkout(w)[0].target_reps).toBe(8)
  })

  it('target_weight_kg is the weight of the LAST effective set with a recorded weight', () => {
    const w = workout([
      { id: 20, exercise_id: 5, position: 0, note: null, rest_seconds: null, sets: [
        set({ id: 1, weight_kg: 80 }), set({ id: 2, weight_kg: 82.5 }), set({ id: 3, weight_kg: 85 }),
      ] },
    ])
    expect(buildRoutineExercisesFromWorkout(w)[0].target_weight_kg).toBe(85)
  })

  it('timed/cardio exercises (no reps) get target_reps null', () => {
    const w = workout([
      { id: 20, exercise_id: 9, position: 0, note: null, rest_seconds: null, sets: [
        set({ id: 1, reps: null, weight_kg: null, duration_seconds: 1800 }),
      ] },
    ])
    const item = buildRoutineExercisesFromWorkout(w)[0]
    expect(item.target_reps).toBeNull()
    expect(item.target_weight_kg).toBeNull()
  })

  it('returns an empty array for a workout with no exercises', () => {
    expect(buildRoutineExercisesFromWorkout(workout([]))).toEqual([])
  })

  describe('fix M5: clamps to the backend limits (RoutineExerciseIn: target_sets le=20, target_reps le=200, rest_seconds ge=5/le=900)', () => {
    it('clamps target_sets to 20 for a high-volume session (dropsets) with more than 20 effective sets', () => {
      const manySets = Array.from({ length: 25 }, (_, i) => set({ id: i + 1 }))
      const w = workout([{ id: 20, exercise_id: 5, position: 0, note: null, rest_seconds: null, sets: manySets }])
      expect(buildRoutineExercisesFromWorkout(w)[0].target_sets).toBe(20)
    })

    it('clamps target_reps to 200', () => {
      const w = workout([
        { id: 20, exercise_id: 5, position: 0, note: null, rest_seconds: null, sets: [set({ reps: 500 })] },
      ])
      expect(buildRoutineExercisesFromWorkout(w)[0].target_reps).toBe(200)
    })

    it('clamps rest_seconds into [5, 900]', () => {
      const tooLow = workout([
        { id: 20, exercise_id: 5, position: 0, note: null, rest_seconds: 1, sets: [set()] },
      ])
      expect(buildRoutineExercisesFromWorkout(tooLow)[0].rest_seconds).toBe(5)

      const tooHigh = workout([
        { id: 20, exercise_id: 5, position: 0, note: null, rest_seconds: 3600, sets: [set()] },
      ])
      expect(buildRoutineExercisesFromWorkout(tooHigh)[0].rest_seconds).toBe(900)
    })

    it('clamps target_weight_kg to 1000', () => {
      const w = workout([
        { id: 20, exercise_id: 5, position: 0, note: null, rest_seconds: null, sets: [set({ weight_kg: 5000 })] },
      ])
      expect(buildRoutineExercisesFromWorkout(w)[0].target_weight_kg).toBe(1000)
    })
  })
})

// v0.5.0 superseries: el grouping del entreno viaja a la rutina tal cual
// (mismo orden → misma contigüidad); los lectores normalizan por contigüidad
describe('buildRoutineExercisesFromWorkout: superset_group passthrough (v0.5.0)', () => {
  it('carries superset_group through per exercise, null for loose ones', () => {
    const w = workout([
      { id: 20, exercise_id: 5, position: 0, note: null, rest_seconds: null, superset_group: 0, sets: [set()] },
      { id: 21, exercise_id: 7, position: 1, note: null, rest_seconds: null, superset_group: 0, sets: [set()] },
      { id: 22, exercise_id: 9, position: 2, note: null, rest_seconds: null, superset_group: null, sets: [set()] },
    ])
    expect(buildRoutineExercisesFromWorkout(w).map((i) => i.superset_group)).toEqual([0, 0, null])
  })

  it('defaults to null when the field is absent (older fixtures / pre-migration payloads)', () => {
    const w = workout([
      { id: 20, exercise_id: 5, position: 0, note: null, rest_seconds: null, sets: [set()] },
    ])
    expect(buildRoutineExercisesFromWorkout(w)[0].superset_group).toBeNull()
  })
})

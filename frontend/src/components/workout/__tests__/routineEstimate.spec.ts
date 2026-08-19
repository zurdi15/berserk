// @vitest-environment node

import { describe, expect, it } from 'vitest'

import type { ExerciseOut, RoutineExerciseOut } from '@/api/domain'
import { estimateRoutineMinutes } from '../routineEstimate'

const exercise = (id: number, measurement = 'strength'): ExerciseOut =>
  ({ id, measurement, muscle_groups: [] }) as unknown as ExerciseOut

const row = (
  exercise_id: number,
  target_sets: number,
  rest_seconds: number | null = null,
  superset_group: number | null = null,
): RoutineExerciseOut =>
  ({ id: exercise_id, exercise_id, position: 0, target_sets, target_reps: null, target_weight_kg: null, rest_seconds, superset_group }) as RoutineExerciseOut

describe('estimateRoutineMinutes', () => {
  it('empty routine estimates 0', () => {
    expect(estimateRoutineMinutes({ exercises: [] }, [])).toBe(0)
  })

  it('a single strength exercise: sets × (45s work + rest), rounded UP to 5', () => {
    // 4 × (45 + 120) = 660s = 11min → 15
    const minutes = estimateRoutineMinutes(
      { exercises: [row(1, 4, 120)] },
      [exercise(1)],
    )
    expect(minutes).toBe(15)
  })

  it('missing rest falls back to the DEFAULT_REST_SECONDS of the workout card (60s)', () => {
    // 3 × (45 + 60) = 315s = 5.25min → 10
    expect(estimateRoutineMinutes({ exercises: [row(1, 3)] }, [exercise(1)])).toBe(10)
  })

  it('superset members share ONE rest per round (rest after the last member, as autoRestFires does)', () => {
    // grupo de 2, 3 series cada uno, rest 90 del último miembro:
    // trabajo 2×3×45 = 270; descanso 3 rondas × 90 = 270 → 540s = 9min → 10
    const minutes = estimateRoutineMinutes(
      { exercises: [row(1, 3, 90, 0), row(2, 3, 90, 0)] },
      [exercise(1), exercise(2)],
    )
    expect(minutes).toBe(10)
    // el mismo par SIN agrupar paga el descanso dos veces: claramente más
    const ungrouped = estimateRoutineMinutes(
      { exercises: [row(1, 3, 90), row(2, 3, 90)] },
      [exercise(1), exercise(2)],
    )
    expect(ungrouped).toBeGreaterThan(minutes)
  })

  it('cardio goes at the 20-minute flat rate', () => {
    expect(estimateRoutineMinutes({ exercises: [row(9, 1)] }, [exercise(9, 'cardio')])).toBe(20)
  })

  it('never estimates below 5 minutes for a non-empty routine', () => {
    expect(estimateRoutineMinutes({ exercises: [row(1, 1, 5)] }, [exercise(1)])).toBe(5)
  })
})

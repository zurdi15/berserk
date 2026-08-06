import { describe, expect, it } from 'vitest'

import { resolveNewSetDefaults } from '../setDefaults'

const routines = [
  {
    id: 1,
    name: 'Push',
    description: null,
    rune: null,
    color: null,
    exercises: [
      { id: 10, exercise_id: 5, position: 0, target_sets: 3, target_reps: 8, target_weight_kg: 60, rest_seconds: 90 },
    ],
  },
]

function set(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 1, set_number: 1, reps: 5, weight_kg: 100, duration_seconds: null,
    distance_m: null, is_warmup: false, rpe: null, completed_at: 'x',
    ...overrides,
  } as never
}

function historySet(overrides: Partial<Record<string, unknown>> = {}) {
  return { reps: 5, weight_kg: 80, duration_seconds: null, distance_m: null, is_warmup: false, ...overrides } as never
}

describe('resolveNewSetDefaults (item 2)', () => {
  it('priority 1: last set of this exercise in this workout wins over everything else', () => {
    const result = resolveNewSetDefaults(
      [set({ reps: 3, weight_kg: 120 })],
      [historySet({ reps: 5, weight_kg: 80 })],
      1, routines as never, 5,
    )
    expect(result).toEqual({ reps: 3, weight_kg: 120, duration_seconds: null, distance_m: null })
  })

  it('priority 2: falls back to the last set of the previous session when this workout has none yet', () => {
    const result = resolveNewSetDefaults(
      [],
      [historySet({ reps: 6, weight_kg: 82.5 }), historySet({ reps: 5, weight_kg: 85 })],
      1, routines as never, 5,
    )
    expect(result).toEqual({ reps: 5, weight_kg: 85, duration_seconds: null, distance_m: null })
  })

  it('priority 3: falls back to the routine target when there is no workout or history data', () => {
    const result = resolveNewSetDefaults([], null, 1, routines as never, 5)
    expect(result).toEqual({ reps: 8, weight_kg: 60 })
  })

  it('priority 4: null when nothing matches (free workout, never trained, no routine target)', () => {
    expect(resolveNewSetDefaults([], null, null, [], 5)).toBeNull()
  })

  it('ignores a routine target for a different exercise than the one asked', () => {
    expect(resolveNewSetDefaults([], null, 1, routines as never, 999)).toBeNull()
  })

  it('ignores a routine target with neither target_reps nor target_weight_kg set', () => {
    const bare = [{ ...routines[0], exercises: [{ ...routines[0].exercises[0], target_reps: null, target_weight_kg: null }] }]
    expect(resolveNewSetDefaults([], null, 1, bare as never, 5)).toBeNull()
  })
})

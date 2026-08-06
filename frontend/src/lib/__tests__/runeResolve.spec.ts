import { describe, expect, it } from 'vitest'

import type { ExerciseOut, MuscleGroupOut } from '@/api/domain'
import { primaryMuscleGroup } from '../runeResolve'

const CHEST: MuscleGroupOut = { id: 1, slug: 'chest', name_es: 'Pecho', name_en: 'Chest', owner_id: null }
const TRICEPS: MuscleGroupOut = { id: 2, slug: 'triceps', name_es: 'Tríceps', name_en: 'Triceps', owner_id: null }
const GROUPS = [CHEST, TRICEPS]

function exercise(links: ExerciseOut['muscle_groups']): ExerciseOut {
  return { id: 9, name_es: 'X', name_en: 'X', measurement: 'strength', owner_id: null, muscle_groups: links }
}

describe('primaryMuscleGroup', () => {
  it('item 6: resolves the full muscle group (not just its rune) for the primary link', () => {
    const ex = exercise([
      { muscle_group_id: 2, is_primary: false },
      { muscle_group_id: 1, is_primary: true },
    ])
    expect(primaryMuscleGroup(ex, GROUPS)).toEqual(CHEST)
  })

  it('returns undefined when the exercise has no primary link', () => {
    const ex = exercise([{ muscle_group_id: 1, is_primary: false }])
    expect(primaryMuscleGroup(ex, GROUPS)).toBeUndefined()
  })

  it('returns undefined when the primary link points at a group not in the catalog passed in', () => {
    const ex = exercise([{ muscle_group_id: 999, is_primary: true }])
    expect(primaryMuscleGroup(ex, GROUPS)).toBeUndefined()
  })

  it('returns undefined for an undefined exercise (catalog not loaded yet)', () => {
    expect(primaryMuscleGroup(undefined, GROUPS)).toBeUndefined()
  })
})

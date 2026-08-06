import { describe, expect, it } from 'vitest'

import type { ExerciseOut, MuscleGroupOut } from '@/api/domain'
import { groupRune, primaryMuscleGroup, primaryRune } from '../runeResolve'

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

describe('groupRune (item 14: resolution order)', () => {
  it('prefers the dedicated rune field over the slug-derived one when both are valid', () => {
    const group: MuscleGroupOut = { id: 1, slug: 'legs', name_es: 'Piernas', name_en: 'Legs', owner_id: null, rune: 'core' }
    expect(groupRune(group)).toBe('core')
  })

  it('falls back to the slug when rune is null (legacy/seeded groups)', () => {
    const group: MuscleGroupOut = { id: 1, slug: 'chest', name_es: 'Pecho', name_en: 'Chest', owner_id: null, rune: null }
    expect(groupRune(group)).toBe('chest')
  })

  it('falls back to the slug when rune is absent from the payload (optional field)', () => {
    const group: MuscleGroupOut = { id: 1, slug: 'back', name_es: 'Espalda', name_en: 'Back', owner_id: null }
    expect(groupRune(group)).toBe('back')
  })

  it('returns null when neither the dedicated rune nor the slug map to a known rune', () => {
    const group: MuscleGroupOut = { id: 1, slug: 'glutes', name_es: 'Glúteos', name_en: 'Glutes', owner_id: 7, rune: null }
    expect(groupRune(group)).toBeNull()
  })

  it('returns null for an undefined group', () => {
    expect(groupRune(undefined)).toBeNull()
  })

  it('primaryRune goes through the same centralized resolution (override wins)', () => {
    const overridden: MuscleGroupOut = { id: 3, slug: 'legs', name_es: 'Piernas', name_en: 'Legs', owner_id: null, rune: 'ansuz' }
    const ex = exercise([{ muscle_group_id: 3, is_primary: true }])
    expect(primaryRune(ex, [overridden])).toBe('ansuz')
  })
})

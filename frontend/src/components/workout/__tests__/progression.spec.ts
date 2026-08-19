import { describe, expect, it } from 'vitest'

import { PROGRESSION_INCREMENT_KG, suggestNextLoad } from '../progression'

// v0.24.0 — doble progresión conservadora: solo sugiere cuando la última
// sesión cumplió el objetivo ENTERO (todas las efectivas al mismo peso y
// llegando a las reps objetivo)
const set = (overrides: Record<string, unknown> = {}) => ({
  reps: 8,
  weight_kg: 60,
  duration_seconds: null,
  distance_m: null,
  is_warmup: false,
  load_mode: 'weight',
  ...overrides,
})

const TARGET = { target_sets: 3, target_reps: 8 }

describe('suggestNextLoad', () => {
  it('suggests top weight + increment when every effective set hit the target reps', () => {
    const sets = [set(), set(), set({ reps: 9 })]
    expect(suggestNextLoad(sets as never, TARGET)).toBe(60 + PROGRESSION_INCREMENT_KG)
  })

  it('ignores warmups when judging the session', () => {
    const sets = [set({ is_warmup: true, weight_kg: 20, reps: 12 }), set(), set(), set()]
    expect(suggestNextLoad(sets as never, TARGET)).toBe(62.5)
  })

  it('stays silent on a pyramid session (different working weights)', () => {
    const sets = [set({ weight_kg: 50 }), set(), set()]
    expect(suggestNextLoad(sets as never, TARGET)).toBeNull()
  })

  it('stays silent when a set missed the target reps', () => {
    const sets = [set(), set(), set({ reps: 6 })]
    expect(suggestNextLoad(sets as never, TARGET)).toBeNull()
  })

  it('stays silent when the session was incomplete (fewer sets than target)', () => {
    expect(suggestNextLoad([set(), set()] as never, TARGET)).toBeNull()
  })

  it('stays silent without a routine target or without history', () => {
    expect(suggestNextLoad([set(), set(), set()] as never, undefined)).toBeNull()
    expect(suggestNextLoad([set(), set(), set()] as never, { target_sets: 3, target_reps: null })).toBeNull()
    expect(suggestNextLoad(null, TARGET)).toBeNull()
    expect(suggestNextLoad([], TARGET)).toBeNull()
  })

  it('level-mode sets never feed the suggestion (machine levels are not kg)', () => {
    const sets = [set({ load_mode: 'level', weight_kg: 12 }), set({ load_mode: 'level', weight_kg: 12 }), set({ load_mode: 'level', weight_kg: 12 })]
    expect(suggestNextLoad(sets as never, TARGET)).toBeNull()
  })
})

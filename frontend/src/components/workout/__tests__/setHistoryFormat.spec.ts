import { describe, expect, it } from 'vitest'

import { formatHistoryLine } from '../setHistoryFormat'

function strengthSet(reps: number, weight: number, warmup = false) {
  return { reps, weight_kg: weight, duration_seconds: null, distance_m: null, is_warmup: warmup }
}

describe('formatHistoryLine (item 3)', () => {
  it('groups consecutive identical strength sets into "Nx" (zurdi\'s example: 4×8·80kg, 4×8·82.5kg)', () => {
    const sets = [
      strengthSet(8, 80), strengthSet(8, 80), strengthSet(8, 80), strengthSet(8, 80),
      strengthSet(8, 82.5), strengthSet(8, 82.5), strengthSet(8, 82.5), strengthSet(8, 82.5),
    ]
    expect(formatHistoryLine(sets, 'strength', 'kg')).toBe('4×8·80 kg, 4×8·82.5 kg')
  })

  it('does not merge non-consecutive groups even if the values repeat later', () => {
    const sets = [strengthSet(8, 80), strengthSet(6, 90), strengthSet(8, 80)]
    expect(formatHistoryLine(sets, 'strength', 'kg')).toBe('8·80 kg, 6·90 kg, 8·80 kg')
  })

  it('excludes warmup sets from the summary when at least one effective set exists', () => {
    const sets = [strengthSet(10, 40, true), strengthSet(5, 100), strengthSet(5, 100)]
    expect(formatHistoryLine(sets, 'strength', 'kg')).toBe('2×5·100 kg')
  })

  it('falls back to listing warmups when the whole session was warmup-only', () => {
    const sets = [strengthSet(10, 40, true)]
    expect(formatHistoryLine(sets, 'strength', 'kg')).toBe('10·40 kg')
  })

  it('bodyweight: omits the weight segment when weight_kg is null', () => {
    const sets = [{ reps: 12, weight_kg: null, duration_seconds: null, distance_m: null, is_warmup: false }]
    expect(formatHistoryLine(sets, 'bodyweight', 'kg')).toBe('12')
  })

  it('timed: formats duration as mm:ss', () => {
    const sets = [{ reps: null, weight_kg: null, duration_seconds: 90, distance_m: null, is_warmup: false }]
    expect(formatHistoryLine(sets, 'timed', 'kg')).toBe('1:30')
  })

  it('cardio: appends distance when present, omits it otherwise', () => {
    const withDistance = [{ reps: null, weight_kg: null, duration_seconds: 1800, distance_m: 5000, is_warmup: false }]
    expect(formatHistoryLine(withDistance, 'cardio', 'kg')).toBe('30:00·5000 m')
    const withoutDistance = [{ reps: null, weight_kg: null, duration_seconds: 1800, distance_m: null, is_warmup: false }]
    expect(formatHistoryLine(withoutDistance, 'cardio', 'kg')).toBe('30:00')
  })

  it('converts weight to the given display units', () => {
    const sets = [strengthSet(5, 100)]
    expect(formatHistoryLine(sets, 'strength', 'lb')).toContain('lb')
  })

  it('returns an empty string for an empty set list', () => {
    expect(formatHistoryLine([], 'strength', 'kg')).toBe('')
  })
})

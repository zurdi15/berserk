import { describe, expect, it } from 'vitest'

import { formatHistorySetLines } from '../setHistoryFormat'

function strengthSet(reps: number, weight: number, warmup = false) {
  return { reps, weight_kg: weight, duration_seconds: null, distance_m: null, is_warmup: warmup }
}

// (v0.17.0: formatHistoryLine — la línea densa agrupada "4×8·80 kg" — murió
// junto con su último consumidor: el hint de la card usa ahora el mismo
// bloque multilínea del drawer, ver formatHistorySetLines)

describe('formatHistorySetLines (item 4: multi-line "última vez" block for the drawer)', () => {
  it('returns one "Sn · reps × peso" line per effective set, WITHOUT grouping consecutive equal sets', () => {
    const sets = [
      strengthSet(8, 80), strengthSet(8, 80), strengthSet(8, 82.5),
    ]
    expect(formatHistorySetLines(sets, 'strength', 'kg')).toEqual([
      'S1 · 8 × 80 kg',
      'S2 · 8 × 80 kg',
      'S3 · 8 × 82.5 kg',
    ])
  })

  it('numbers by position among EFFECTIVE sets, excluding warmups from both the list and the numbering', () => {
    const sets = [strengthSet(10, 40, true), strengthSet(5, 100), strengthSet(5, 100)]
    expect(formatHistorySetLines(sets, 'strength', 'kg')).toEqual([
      'S1 · 5 × 100 kg',
      'S2 · 5 × 100 kg',
    ])
  })

  it('falls back to listing warmups (still numbered from S1) when the whole session was warmup-only', () => {
    const sets = [strengthSet(10, 40, true)]
    expect(formatHistorySetLines(sets, 'strength', 'kg')).toEqual(['S1 · 10 × 40 kg'])
  })

  it('bodyweight: omits the weight segment when weight_kg is null', () => {
    const sets = [{ reps: 12, weight_kg: null, duration_seconds: null, distance_m: null, is_warmup: false }]
    expect(formatHistorySetLines(sets, 'bodyweight', 'kg')).toEqual(['S1 · 12'])
  })

  it('timed: formats duration as mm:ss', () => {
    const sets = [{ reps: null, weight_kg: null, duration_seconds: 90, distance_m: null, is_warmup: false }]
    expect(formatHistorySetLines(sets, 'timed', 'kg')).toEqual(['S1 · 1:30'])
  })

  it('cardio: appends distance with a middle-dot separator when present', () => {
    const sets = [{ reps: null, weight_kg: null, duration_seconds: 1800, distance_m: 5000, is_warmup: false }]
    expect(formatHistorySetLines(sets, 'cardio', 'kg')).toEqual(['S1 · 30:00 · 5000 m'])
  })

  it('returns an empty array for an empty set list', () => {
    expect(formatHistorySetLines([], 'strength', 'kg')).toEqual([])
  })

  it('item 4d: never contains an em-dash or en-dash (zurdi: "quita el m-dash")', () => {
    const sets = [strengthSet(8, 82.5), strengthSet(5, 100)]
    const lines = formatHistorySetLines(sets, 'strength', 'kg')
    for (const line of lines) expect(line).not.toMatch(/[—–]/)
  })
})

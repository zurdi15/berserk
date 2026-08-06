import { describe, expect, it } from 'vitest'

import { monthLabelsFor } from '../heatmap'

describe('monthLabelsFor', () => {
  it('maps each month to the week-column of its day 1, aligned to cellsFor (2026)', () => {
    // 2026: 1 ene cae en jueves → offset 3 (mismo anclaje a lunes que cellsFor)
    expect(monthLabelsFor(2026)).toEqual([
      { month: 1, column: 0 },
      { month: 2, column: 4 },
      { month: 3, column: 8 },
      { month: 4, column: 13 },
      { month: 5, column: 17 },
      { month: 6, column: 22 },
      { month: 7, column: 26 },
      { month: 8, column: 30 },
      { month: 9, column: 35 },
      { month: 10, column: 39 },
      { month: 11, column: 43 },
      { month: 12, column: 48 },
    ])
  })

  it('always starts January at column 0, regardless of which weekday 1 Jan falls on', () => {
    for (const year of [2024, 2025, 2026, 2027, 2028, 2029, 2030, 2031]) {
      expect(monthLabelsFor(year)[0]).toEqual({ month: 1, column: 0 })
    }
  })

  it('never keeps two labels closer than the minimum column gap (no visual overlap)', () => {
    for (const year of [2024, 2025, 2026, 2027, 2028, 2029, 2030, 2031]) {
      const labels = monthLabelsFor(year)
      for (let i = 1; i < labels.length; i++) {
        expect(labels[i].column - labels[i - 1].column).toBeGreaterThanOrEqual(2)
      }
    }
  })
})

import { describe, expect, it } from 'vitest'

import { isoDate, monthGrid, monthLabel, weekdayHeaders } from '../dates'

describe('dates', () => {
  it('isoDate has no timezone shift', () => {
    expect(isoDate(new Date(2026, 7, 5))).toBe('2026-08-05')
    expect(isoDate(new Date(2026, 0, 1))).toBe('2026-01-01')
  })

  it('monthGrid starts monday and covers the whole month', () => {
    const grid = monthGrid(2026, 8) // agosto 2026: sábado 1
    expect(grid[0].date).toBe('2026-07-27') // lunes previo
    expect(grid.some((c) => c.date === '2026-08-01' && c.inMonth)).toBe(true)
    expect(grid.some((c) => c.date === '2026-08-31' && c.inMonth)).toBe(true)
    expect(grid.length % 7).toBe(0)
  })

  it('locale-aware labels', () => {
    expect(monthLabel(2026, 8, 'es')).toMatch(/agosto/i)
    expect(weekdayHeaders('es')).toHaveLength(7)
  })
})

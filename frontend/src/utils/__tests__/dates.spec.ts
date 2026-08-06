import { describe, expect, it } from 'vitest'

import {
  addDays,
  addMonths,
  formatDateShort,
  formatDayLabel,
  formatTimeShort,
  isoDate,
  monthGrid,
  monthLabel,
  weekdayHeaders,
} from '../dates'

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

  it('formatDayLabel builds the label from a LOCAL date, never new Date(iso) (day-shift trap)', () => {
    const label = formatDayLabel('2026-08-25', 'es')
    expect(label).toMatch(/25/)
    expect(label).toMatch(/agosto/i)
  })

  it('formatTimeShort strips seconds from an HH:MM:SS string', () => {
    expect(formatTimeShort('19:04:00')).toBe('19:04')
  })

  it('formatTimeShort passes null through unchanged', () => {
    expect(formatTimeShort(null)).toBeNull()
  })

  it('formatDateShort builds a short localized date (day, abbreviated month, year)', () => {
    const short = formatDateShort('2026-08-05', 'es')
    expect(short).toMatch(/5/)
    expect(short).toMatch(/ago/i)
    expect(short).toMatch(/2026/)
  })

  it('M1: formatDateShort guards an empty string, returning "" instead of "Invalid Date"', () => {
    expect(formatDateShort('', 'es')).toBe('')
  })

  it('addDays (BkDateField grid nav): 30 days from 2026-03-01 crosses the EU DST boundary (2026-03-29) without a day-shift', () => {
    // construcción LOCAL (nunca new Date(iso)/toISOString): el cambio de
    // hora de por medio no debe desplazar el resultado ni un día
    expect(addDays('2026-03-01', 30)).toBe('2026-03-31')
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28')
  })

  it('addDays wraps a week (7 days) and a full month cleanly', () => {
    expect(addDays('2026-08-25', 7)).toBe('2026-09-01')
    expect(addDays('2026-01-01', -1)).toBe('2025-12-31')
  })

  it('addMonths keeps the day when the target month has enough days', () => {
    expect(addMonths('2026-01-15', 1)).toBe('2026-02-15')
    expect(addMonths('2026-08-05', -1)).toBe('2026-07-05')
  })

  it('addMonths clamps the day when the target month is shorter (day-31 trap)', () => {
    // 31 de enero + 1 mes: febrero no tiene 31 (2026 no es bisiesto) → 28
    expect(addMonths('2026-01-31', 1)).toBe('2026-02-28')
  })
})

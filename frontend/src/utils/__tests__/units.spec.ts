import { describe, expect, it } from 'vitest'

import { displayToKg, formatWeight, kgToDisplay } from '../units'

describe('units', () => {
  it('kg passthrough', () => {
    expect(kgToDisplay(102.5, 'kg')).toBe(102.5)
    expect(formatWeight(102.5, 'kg')).toBe('102.5 kg')
  })

  it('lb conversion round-trips within tolerance', () => {
    expect(kgToDisplay(100, 'lb')).toBe(220.5)
    expect(displayToKg(220.5, 'lb')).toBeCloseTo(100, 1)
    expect(formatWeight(100, 'lb')).toBe('220.5 lb')
  })
})

import { describe, expect, it } from 'vitest'

import { displayToKg, formatWeight, formatWeightInt, kgToDisplay } from '../units'

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

  // item 6: magnitudes DERIVADAS (est. 1RM, volumen) sin decimales — los
  // pesos REALES registrados siguen pasando por formatWeight, no por aquí
  describe('formatWeightInt (item 6 — derived/aggregate stats only)', () => {
    it('rounds a fractional kg value to the nearest whole number', () => {
      expect(formatWeightInt(102.5, 'kg')).toBe('103 kg')
      expect(formatWeightInt(102.4, 'kg')).toBe('102 kg')
    })

    it('leaves an already-whole kg value untouched', () => {
      expect(formatWeightInt(1200, 'kg')).toBe('1200 kg')
    })

    it('rounds the DISPLAYED lb value (post-conversion) to a whole number too, not just kg', () => {
      // 100 kg → 220.5 lb (kgToDisplay ya redondea a 1 decimal) → 221 lb entero
      expect(formatWeightInt(100, 'lb')).toBe('221 lb')
    })
  })
})

import { describe, expect, it } from 'vitest'

import { defaultPlateConfig, platesPerSide } from '../plates'

describe('platesPerSide (v0.12.0: calculadora de discos)', () => {
  it('resolves an exact load greedily from the heaviest plate', () => {
    // 100 kg con barra de 20 → 40 por lado → 25 + 15
    const result = platesPerSide(100, defaultPlateConfig('kg'))
    expect(result.perSide).toEqual([25, 15])
    expect(result.achieved).toBe(100)
    expect(result.exact).toBe(true)
  })

  it('uses repeated plates up to the available pairs', () => {
    // 120 kg → 50 por lado → 2×25 (hay 2 pares por defecto)
    const result = platesPerSide(120, defaultPlateConfig('kg'))
    expect(result.perSide).toEqual([25, 25])
    expect(result.exact).toBe(true)
  })

  it('reports the achieved weight when the inventory cannot reach the target', () => {
    const config = defaultPlateConfig('kg')
    config.slots = [{ weight: 25, pairs: 1 }]
    // 120 → 50 por lado, pero solo hay un par de 25: se queda en 20+2×25=70
    const result = platesPerSide(120, config)
    expect(result.perSide).toEqual([25])
    expect(result.achieved).toBe(70)
    expect(result.exact).toBe(false)
  })

  it('handles fractional targets that no plate can close', () => {
    // 21 kg → 0.5 por lado: ningún disco cabe → solo barra
    const result = platesPerSide(21, defaultPlateConfig('kg'))
    expect(result.perSide).toEqual([])
    expect(result.achieved).toBe(20)
    expect(result.exact).toBe(false)
  })

  it('bar-only target is exact with no plates', () => {
    const result = platesPerSide(20, defaultPlateConfig('kg'))
    expect(result.perSide).toEqual([])
    expect(result.exact).toBe(true)
  })

  it('survives float dust (62.5 → 21.25 per side needs the 1.25 plate)', () => {
    const result = platesPerSide(62.5, defaultPlateConfig('kg'))
    expect(result.perSide).toEqual([20, 1.25])
    expect(result.exact).toBe(true)
  })
})

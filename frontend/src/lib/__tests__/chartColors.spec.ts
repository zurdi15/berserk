import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { cssVar, resolveSeriesStroke } from '../chartColors'

// v0.4.0 light theme: BkChart pinta en <canvas> (uPlot), así que sus colores
// no pueden quedar resueltos por CSS solo — resolveSeriesStroke lee el custom
// property YA VIGENTE en cada llamada. Se simula el efecto de html.bk-light
// escribiendo el custom property directamente sobre <html> (inline style
// tiene prioridad sobre cualquier regla de hoja de estilos real, así que
// esto es representativo sin depender de que el CSS del proyecto esté
// cargado en el entorno de test).
describe('chartColors', () => {
  afterEach(() => {
    document.documentElement.style.removeProperty('--bk-accent-aurora')
    document.documentElement.style.removeProperty('--bk-accent-ember')
    document.documentElement.style.removeProperty('--bk-ink')
  })

  it('cssVar reads a custom property already set on the document root, trimmed', () => {
    document.documentElement.style.setProperty('--bk-ink', '  #1A2028  ')
    expect(cssVar('--bk-ink')).toBe('#1A2028')
  })

  it('cssVar returns an empty string for an undefined custom property, never throws', () => {
    expect(cssVar('--bk-does-not-exist')).toBe('')
  })

  it('resolveSeriesStroke maps each ChartColor to its semantic token', () => {
    document.documentElement.style.setProperty('--bk-accent-aurora', '#197D6E')
    document.documentElement.style.setProperty('--bk-accent-ember', '#A85B1E')
    document.documentElement.style.setProperty('--bk-ink', '#1A2028')

    expect(resolveSeriesStroke('aurora')).toBe('#197D6E')
    expect(resolveSeriesStroke('ember')).toBe('#A85B1E')
    expect(resolveSeriesStroke('ink')).toBe('#1A2028')
  })

  describe('theme switch (html.bk-light toggling mid-session)', () => {
    beforeEach(() => {
      document.documentElement.style.setProperty('--bk-accent-aurora', '#4FD8C4') // dark
    })

    it('never caches: the same color name re-resolves to whatever the custom property holds NOW', () => {
      expect(resolveSeriesStroke('aurora')).toBe('#4FD8C4')

      // simula el efecto de aplicar html.bk-light (los valores light quedan
      // definidos ahí, ver tokens/index.ts)
      document.documentElement.style.setProperty('--bk-accent-aurora', '#197D6E')

      expect(resolveSeriesStroke('aurora')).toBe('#197D6E')
    })
  })
})

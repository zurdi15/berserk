// @vitest-environment node

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const read = (rel: string) =>
  readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf-8')

describe('animation system', () => {
  const css = read('../animations.css')

  it('has exactly one reduced-motion guard', () => {
    expect(css.match(/prefers-reduced-motion/g)?.length).toBe(1)
  })

  it('animates only transform and opacity (plus the one documented exception)', () => {
    // dentro de keyframes solo se permiten transform/opacity y la única
    // excepción puntual documentada: stroke-dashoffset (bk-carve). clip-path
    // ya no es una excepción sancionada (item 2: el barrido bk-reveal se
    // sustituyó por el revelado progresivo de datos en BkChart.vue)
    const banned = /(width|height|margin|top|left|font-size|clip-path)\s*:/
    for (const block of css.split('@keyframes').slice(1)) {
      expect(block.split('}')[0]).not.toMatch(banned)
    }
  })

  it('defines the signature carve keyframe and entry transitions', () => {
    expect(css).toContain('@keyframes bk-carve')
    expect(css).toContain('.bk-rise-enter-active')
    expect(css).toContain('.bk-fade-enter-active')
  })

  it('item 2: the old chart-reveal wipe (bk-reveal/clip-path) is gone — BkChart now reveals its series progressively via setData, not CSS', () => {
    expect(css).not.toContain('bk-reveal')
    expect(css).not.toContain('clip-path')
  })

  it('item 6: defines the distribution-bar growth keyframe (scaleX, transform-only) with a per-bar duration custom property', () => {
    expect(css).toContain('@keyframes bk-grow-x')
    expect(css).toContain('transform: scaleX(0)')
    expect(css).toContain('transform: scaleX(1)')
    expect(css).toContain('.bk-grow-x')
    expect(css).toContain('--bar-dur')
  })

  it('defines the heatmap cell cascade with its own step/index custom properties', () => {
    expect(css).toContain('.bk-cascade')
    expect(css).toContain('--bk-cascade-i')
    expect(css).toContain('--bk-cascade-step')
  })

  it('uses token variables, never raw easings', () => {
    expect(css).not.toMatch(/cubic-bezier\(/)
    expect(css).toContain('var(--bk-ease-')
  })

  it('reduced-motion guard also neutralizes stagger/entry delays', () => {
    // sin esto, bk-stagger sigue escalonando entradas aunque dure 0.01ms
    const guard = css.slice(css.indexOf('@media (prefers-reduced-motion'))
    expect(guard).toContain('animation-delay: 0s !important')
  })

  it('the reduced-motion guard is universal (*), so it reaches bk-cascade/bk-grow-x too without listing them', () => {
    // el heatmap (item 1) y las barras de distribución (item 6) no necesitan
    // su propia entrada en el guard: al ser `*, *::before, *::after`
    // cualquier animation-delay/duration nuevo queda a 0s/0.01ms igual, sin
    // mantenimiento extra
    const guard = css.slice(css.indexOf('@media (prefers-reduced-motion'))
    expect(guard).toContain('*, *::before, *::after')
  })
})

describe('base styles', () => {
  const css = read('../base.css')

  it('bridges tokens into tailwind theme', () => {
    expect(css).toContain('@theme inline')
    expect(css).toContain('--color-aurora: var(--bk-accent-aurora)')
    expect(css).toContain('--font-display: var(--bk-font-display)')
  })
})

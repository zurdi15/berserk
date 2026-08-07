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

  describe('neon pulse (post-0.3.0, 4 fixes from live phone feedback)', () => {
    it('a: .bk-neon-streak has an opacity:0 base state, so it never paints its non-animated default before the animation engine kicks in', () => {
      const start = css.indexOf('.bk-neon-streak {')
      const rule = css.slice(start, css.indexOf('}', start))
      expect(rule).toMatch(/opacity:\s*0;/)
    })

    it('a/b: all four streak animations use fill-mode "both", not "forwards" alone — a delayed segment (top-a/top-b) must show its 0% keyframe (invisible, off-screen) during the whole delay, not its unanimated final position', () => {
      const riserRule = css.slice(css.indexOf('.bk-neon-edge-left,'), css.indexOf('.bk-neon-edge-left {'))
      const topRule = css.slice(css.indexOf('.bk-neon-edge-top-a,'), css.indexOf('.bk-neon-edge-top-a {'))
      expect(riserRule).toMatch(/animation:\s*bk-neon-rise[^;]*\bboth\b/)
      expect(topRule).toMatch(/animation:\s*bk-neon-close[^;]*\bboth\b/)
      expect(riserRule).not.toMatch(/\bforwards\b/)
      expect(topRule).not.toMatch(/\bforwards\b/)
    })

    it('c: both the riser and the top closer use --bk-ease-linear (constant velocity), so the handoff at the corner has no deceleration-then-jolt mismatch', () => {
      const riserRule = css.slice(css.indexOf('.bk-neon-edge-left,'), css.indexOf('.bk-neon-edge-left {'))
      const topRule = css.slice(css.indexOf('.bk-neon-edge-top-a,'), css.indexOf('.bk-neon-edge-top-a {'))
      expect(riserRule).toContain('var(--bk-ease-linear)')
      expect(topRule).toContain('var(--bk-ease-linear)')
      expect(riserRule).not.toContain('var(--bk-ease-out)')
      expect(topRule).not.toContain('var(--bk-ease-out)')
    })

    it('d: bk-neon-rise fades all the way to opacity 0 by its own 100%, instead of freezing at the old 0.35 afterglow while the top segment keeps running', () => {
      const keyframe = css.slice(css.indexOf('@keyframes bk-neon-rise'), css.indexOf('@keyframes bk-neon-close'))
      expect(keyframe).toMatch(/100%\s*\{\s*opacity:\s*0;/)
      expect(keyframe).not.toContain('opacity: 0.35; transform: translateY(0%); }\n}')
    })
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

  it('item 1 (round 9): the global focus-visible ring is untouched (still solid aurora) for everything except form controls', () => {
    const globalRule = css.slice(css.indexOf(':focus-visible {'), css.indexOf(':focus-visible {') + 120)
    expect(globalRule).toContain('outline: 2px solid var(--bk-accent-aurora)')
  })

  it('item 1 (round 9): .bk-form-control gets its own focus-visible override instead of stacking the global ring on top of its own border', () => {
    const overrideRule = css.slice(css.indexOf('.bk-form-control:focus-visible'))
    expect(overrideRule).toContain('outline: 2px solid transparent')
    // transparente, no "none": el hueco del outline se conserva para el
    // modo de alto contraste forzado (ver why-comment en base.css)
    expect(overrideRule).not.toMatch(/outline:\s*none/)
  })

  it('item 6 (post-0.3.0): html no longer forces a permanent scrollbar/gutter — that was leaking onto the public auth screens, which have no internal scroller', () => {
    const htmlRule = css.slice(css.indexOf('html {'), css.indexOf('html.bk-light'))
    expect(htmlRule).not.toContain('overflow-y: scroll')
    expect(htmlRule).not.toContain('scrollbar-gutter')
    expect(htmlRule).toContain('overflow-y: auto')
  })

  it('item 6 (post-0.3.0): the stable gutter moved to .bk-scroll-stable, applied where scrolling actually happens now (ShellView\'s <main>)', () => {
    expect(css).toContain('.bk-scroll-stable')
    const rule = css.slice(css.indexOf('.bk-scroll-stable'))
    expect(rule).toContain('scrollbar-gutter: stable')
  })

  describe('v0.4.0 light theme', () => {
    it('html.bk-light sets color-scheme to light (html itself declares dark — verified this stays a per-theme override, not a duplicate/conflicting rule)', () => {
      expect(css).toContain('color-scheme: dark')
      const lightRule = css.slice(css.indexOf('html.bk-light {'), css.indexOf('html.bk-light {') + 60)
      expect(lightRule).toContain('color-scheme: light')
    })

    it('bridges the scrim token into Tailwind (bg-scrim), so BkSheet never has to hand-pick a theme-appropriate overlay color itself', () => {
      expect(css).toContain('--color-scrim: var(--bk-scrim)')
    })

    it('.bk-slab reads its box-shadow from the slab-shadow token, not a hardcoded inset — dark and light need genuinely different formulas (inset highlight vs. drop shadow), not just a different color plugged into the same shape', () => {
      const rule = css.slice(css.indexOf('.bk-slab {'), css.indexOf('.bk-slab {') + 300)
      expect(rule).toContain('box-shadow: var(--bk-slab-shadow)')
      expect(rule).not.toMatch(/box-shadow:\s*inset 0 1px 0 var\(--bk-line\)/)
    })

    it('the noise overlay opacity comes from a token, not a hardcoded 0.035 — the same turbulence reads as grime on a light surface at dark-tuned opacity', () => {
      const rule = css.slice(css.indexOf('body::before {'), css.indexOf('body::before {') + 300)
      expect(rule).toContain('opacity: var(--bk-noise-opacity)')
      expect(rule).not.toMatch(/opacity:\s*0\.035/)
    })
  })
})

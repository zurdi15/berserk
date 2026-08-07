// @vitest-environment node

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

import { core, themes } from '../index'

const css = readFileSync(
  fileURLToPath(new URL('../../styles/tokens.css', import.meta.url)),
  'utf-8',
)

// WCAG 2.x relative-luminance contrast ratio — implementación mínima y
// autocontenida (sin dependencia nueva) para poder hacer del 4.5:1 de AA una
// aserción automática, no solo una nota en un comentario que alguien puede
// romper sin darse cuenta al retocar un hex.
function hexToRgb(hex: string): [number, number, number] {
  const clean = hex.replace('#', '')
  return [0, 2, 4].map((i) => parseInt(clean.slice(i, i + 2), 16)) as [number, number, number]
}
function relativeLuminance([r, g, b]: [number, number, number]): number {
  const f = (c: number) => {
    const s = c / 255
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4)
  }
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b)
}
function contrastRatio(hexA: string, hexB: string): number {
  const lA = relativeLuminance(hexToRgb(hexA)) + 0.05
  const lB = relativeLuminance(hexToRgb(hexB)) + 0.05
  return lA > lB ? lA / lB : lB / lA
}

describe('token pipeline', () => {
  it('light theme redefines exactly the dark color keys', () => {
    expect(Object.keys(themes.light).sort()).toEqual(Object.keys(themes.dark).sort())
  })

  describe('WCAG AA contrast regression (light theme text accents on bg-stone)', () => {
    // aurora/ember se usan como TEXTO real (PR badges, warm-up, feeling...),
    // no solo como acento decorativo — ver el grep hecho en el audit de
    // v0.4.0. El scaffold original de fase 3 solo llegaba a 3.10-3.40:1;
    // este test es el guardrail para que nadie lo re-introduzca sin darse
    // cuenta al ajustar la paleta.
    it('accent-aurora on bg-stone clears 4.5:1', () => {
      expect(contrastRatio(themes.light['accent-aurora'], themes.light['bg-stone'])).toBeGreaterThanOrEqual(4.5)
    })
    it('accent-ember on bg-stone clears 4.5:1', () => {
      expect(contrastRatio(themes.light['accent-ember'], themes.light['bg-stone'])).toBeGreaterThanOrEqual(4.5)
    })
    it('accent-aurora-deep on bg-stone clears 4.5:1 and reads as a visibly darker step than accent-aurora', () => {
      expect(contrastRatio(themes.light['accent-aurora-deep'], themes.light['bg-stone'])).toBeGreaterThanOrEqual(4.5)
      expect(contrastRatio(themes.light['accent-aurora-deep'], themes.light['bg-stone']))
        .toBeGreaterThan(contrastRatio(themes.light['accent-aurora'], themes.light['bg-stone']))
    })
    it('accent-ember-deep on bg-stone clears 4.5:1 and reads as a visibly darker step than accent-ember', () => {
      expect(contrastRatio(themes.light['accent-ember-deep'], themes.light['bg-stone'])).toBeGreaterThanOrEqual(4.5)
      expect(contrastRatio(themes.light['accent-ember-deep'], themes.light['bg-stone']))
        .toBeGreaterThan(contrastRatio(themes.light['accent-ember'], themes.light['bg-stone']))
    })
    it('danger on bg-stone clears 4.5:1', () => {
      expect(contrastRatio(themes.light['danger'], themes.light['bg-stone'])).toBeGreaterThanOrEqual(4.5)
    })
    it('ink on bg-void clears 7:1 (body text, AAA-grade headroom)', () => {
      expect(contrastRatio(themes.light['ink'], themes.light['bg-void'])).toBeGreaterThanOrEqual(7)
    })
  })

  it('accent split is respected: aurora is teal, ember is reserved', () => {
    expect(themes.dark['accent-aurora']).toBe('#4FD8C4')
    expect(themes.dark['accent-ember']).toBe('#FF8A3D')
  })

  it('generated css contains every dark token as --bk-* on :root', () => {
    for (const key of Object.keys(themes.dark)) {
      expect(css).toContain(`--bk-${key}:`)
    }
    expect(css).toMatch(/^:root \{/m)
    expect(css).toMatch(/^html\.bk-light \{/m)
  })

  it('generated css contains core tokens (durations, easings)', () => {
    expect(css).toContain('--bk-dur-3: 320ms')
    expect(css).toContain('--bk-ease-spring: cubic-bezier(0.34, 1.4, 0.44, 1)')
  })

  it('the html.bk-light block redefines every single light key, not just a subset (a silently-missing key would leave that surface stuck on the dark value)', () => {
    const lightBlock = css.slice(css.indexOf('html.bk-light {'))
    for (const key of Object.keys(themes.light)) {
      expect(lightBlock).toContain(`--bk-${key}:`)
    }
  })

  it('v0.4.0: scrim/slab-shadow/noise-opacity differ between themes (they exist precisely because a single dark-authored value looks wrong inverted — see tokens/index.ts)', () => {
    expect(themes.light.scrim).not.toBe(themes.dark.scrim)
    expect(themes.light['slab-shadow']).not.toBe(themes.dark['slab-shadow'])
    expect(themes.light['noise-opacity']).not.toBe(themes.dark['noise-opacity'])
  })

  it('spacing is not a token: Tailwind\'s own scale is the spacing system', () => {
    expect(css).not.toContain('--bk-space-')
  })
})

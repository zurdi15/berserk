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

  it('animates only transform and opacity', () => {
    // dentro de keyframes solo se permiten transform/opacity/stroke-dashoffset
    const banned = /(width|height|margin|top|left|font-size)\s*:/
    for (const block of css.split('@keyframes').slice(1)) {
      expect(block.split('}')[0]).not.toMatch(banned)
    }
  })

  it('defines the signature carve keyframe and entry transitions', () => {
    expect(css).toContain('@keyframes bk-carve')
    expect(css).toContain('.bk-rise-enter-active')
    expect(css).toContain('.bk-fade-enter-active')
  })

  it('uses token variables, never raw easings', () => {
    expect(css).not.toMatch(/cubic-bezier\(/)
    expect(css).toContain('var(--bk-ease-')
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

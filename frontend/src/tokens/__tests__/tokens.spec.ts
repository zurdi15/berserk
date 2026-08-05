import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

import { core, themes } from '../index'

const css = readFileSync(
  fileURLToPath(new URL('../../styles/tokens.css', import.meta.url)),
  'utf-8',
)

describe('token pipeline', () => {
  it('light theme redefines exactly the dark color keys', () => {
    expect(Object.keys(themes.light).sort()).toEqual(Object.keys(themes.dark).sort())
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

  it('generated css contains core tokens (spacing, durations, easings)', () => {
    expect(css).toContain('--bk-space-4:')
    expect(css).toContain('--bk-dur-3: 320ms')
    expect(css).toContain('--bk-ease-spring: cubic-bezier(0.34, 1.4, 0.44, 1)')
  })
})

// @vitest-environment node
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const config = readFileSync(
  fileURLToPath(new URL('../../vite.config.ts', import.meta.url)),
  'utf-8',
)

describe('pwa config', () => {
  it('declares standalone manifest with rune icons and void theme', () => {
    expect(config).toContain("display: 'standalone'")
    expect(config).toContain("theme_color: '#0A0C0F'")
    expect(config).toContain('pwa-512.png')
    expect(config).toContain("purpose: 'maskable'")
  })

  it('does not runtime-cache the api (online-only by design)', () => {
    expect(config).not.toContain('runtimeCaching')
    // el proxy de dev legítimamente contiene '/api'; lo prohibido es cachearlo
    expect(config).not.toMatch(/urlPattern.*api/)
  })
})

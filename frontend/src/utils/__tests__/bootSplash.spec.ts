import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// controlar a mano cuándo "termina" el prefetch
let resolvePrefetch: () => void = () => {}
vi.mock('../prefetchSections', () => ({
  prefetchSections: vi.fn(
    () =>
      new Promise<void>((resolve) => {
        resolvePrefetch = resolve
      }),
  ),
}))

import { bootSplashActive, runBootSplash, SPLASH_MAX_MS, SPLASH_MIN_MS } from '../bootSplash'

// v0.21.4 (zurdi: "un splashart mientras se carga todo, así la carga inicial
// es directa"): visible un mínimo (que el tallado no parpadee) y con TOPE
// duro (una red lenta jamás secuestra la app)
describe('bootSplash', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    bootSplashActive.value = false
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('stays up for the minimum even if the prefetch finishes instantly', async () => {
    runBootSplash()
    expect(bootSplashActive.value).toBe(true)

    resolvePrefetch()
    await vi.advanceTimersByTimeAsync(SPLASH_MIN_MS - 100)
    expect(bootSplashActive.value).toBe(true)

    await vi.advanceTimersByTimeAsync(200)
    expect(bootSplashActive.value).toBe(false)
  })

  it('clears right after the prefetch when it outlives the minimum', async () => {
    runBootSplash()
    await vi.advanceTimersByTimeAsync(SPLASH_MIN_MS + 300)
    expect(bootSplashActive.value).toBe(true)

    resolvePrefetch()
    await vi.advanceTimersByTimeAsync(0)
    expect(bootSplashActive.value).toBe(false)
  })

  it('hard cap: a hung prefetch never holds the splash past SPLASH_MAX_MS', async () => {
    runBootSplash()
    await vi.advanceTimersByTimeAsync(SPLASH_MAX_MS + 50)
    expect(bootSplashActive.value).toBe(false)
  })
})

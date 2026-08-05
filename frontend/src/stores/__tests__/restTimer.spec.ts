import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'

import { useRestTimerStore } from '../restTimer'

describe('rest timer store', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.useFakeTimers()
    vi.setSystemTime(1_000_000)
  })
  afterEach(() => vi.useRealTimers())

  it('counts down from absolute timestamps (survives missed ticks)', () => {
    const timer = useRestTimerStore()
    timer.start(90)
    expect(timer.active).toBe(true)
    expect(timer.remaining).toBe(90)
    // el móvil bloqueado no ejecuta intervals: saltamos 60s de golpe
    vi.setSystemTime(1_000_000 + 60_000)
    vi.advanceTimersByTime(500)
    expect(timer.remaining).toBe(30)
    expect(timer.progress).toBeCloseTo(30 / 90, 2)
  })

  it('vibrates once and auto-clears after the grace period', () => {
    const vibrate = vi.fn()
    vi.stubGlobal('navigator', { vibrate })
    const timer = useRestTimerStore()
    timer.start(10)
    vi.setSystemTime(1_000_000 + 10_500)
    vi.advanceTimersByTime(600)
    expect(vibrate).toHaveBeenCalledTimes(1)
    vi.advanceTimersByTime(3_100)
    expect(timer.active).toBe(false)
    vi.unstubAllGlobals()
  })

  it('restarting replaces the previous countdown', () => {
    const timer = useRestTimerStore()
    timer.start(90)
    timer.start(30)
    expect(timer.remaining).toBe(30)
    expect(timer.total).toBe(30)
  })
})

import { mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { createI18nInstance } from '@/i18n'
import CardioCountdown from '../CardioCountdown.vue'

describe('CardioCountdown (item 7)', () => {
  const vibrate = vi.fn()

  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-08-06T10:00:00Z'))
    vibrate.mockClear()
    vi.stubGlobal('navigator', { vibrate })
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  function build(targetSeconds = 90, endsAt?: number) {
    return mount(CardioCountdown, {
      props: endsAt === undefined ? { targetSeconds } : { targetSeconds, endsAt },
      global: { plugins: [createI18nInstance()] },
    })
  }

  it('renders the initial mm:ss label from targetSeconds', () => {
    const wrapper = build(90)
    expect(wrapper.get('[data-testid="cardio-countdown-label"]').text()).toBe('1:30')
  })

  it('counts down as time advances, based on an absolute end timestamp', async () => {
    const wrapper = build(90)
    vi.advanceTimersByTime(30_000)
    await wrapper.vm.$nextTick()
    expect(wrapper.get('[data-testid="cardio-countdown-label"]').text()).toBe('1:00')
  })

  it('survives a big single jump forward (tab-hidden style) landing on the correct remaining time, not a tick count', async () => {
    const wrapper = build(90)
    // una sola advance grande, no 90 ticks de 1s: si el componente contara
    // ticks en vez de leer un timestamp absoluto, este salto lo dejaría mal
    vi.advanceTimersByTime(61_000)
    await wrapper.vm.$nextTick()
    expect(wrapper.get('[data-testid="cardio-countdown-label"]').text()).toBe('0:29')
  })

  it('auto-completes at zero: vibrates and emits done exactly once', async () => {
    const wrapper = build(5)
    vi.advanceTimersByTime(5_000)
    await wrapper.vm.$nextTick()

    expect(wrapper.emitted('done')).toHaveLength(1)
    expect(vibrate).toHaveBeenCalledTimes(1)

    // sigue corriendo el ticker tras el 0 (si no se limpiara el interval):
    // no debe volver a emitir ni vibrar de nuevo
    vi.advanceTimersByTime(5_000)
    await wrapper.vm.$nextTick()
    expect(wrapper.emitted('done')).toHaveLength(1)
    expect(vibrate).toHaveBeenCalledTimes(1)
  })

  it('emits cancel when the cancel button is clicked, without emitting done', async () => {
    const wrapper = build(90)
    await wrapper.get('[data-testid="cardio-countdown-cancel"]').trigger('click')
    expect(wrapper.emitted('cancel')).toHaveLength(1)
    expect(wrapper.emitted('done')).toBeFalsy()
  })

  // v0.3.2 CARDIO-COUNTDOWN PERSISTENCE: `endsAt` deja SEMBRAR el timestamp
  // real de fin en vez de recalcularlo desde targetSeconds — así un
  // countdown RESUMIDO tras volver de una pestaña evictada arranca en el
  // remaining correcto, no en el target completo otra vez (ver
  // WorkoutExerciseCard.vue / uiPrefs.ts::PersistedCardioCountdown)
  describe('resuming with an explicit endsAt', () => {
    it('renders the REMAINING time (not targetSeconds) when endsAt is partway through', () => {
      // targetSeconds sigue siendo 1800 (el original de 30 min), pero solo
      // quedan 600s reales según endsAt — como si la pestaña hubiera vuelto
      // a los 20 minutos de que Android la evictara
      const endsAt = Date.now() + 600_000
      const wrapper = build(1800, endsAt)
      expect(wrapper.get('[data-testid="cardio-countdown-label"]').text()).toBe('10:00')
    })

    it('keeps ticking down from that seeded endsAt as time advances', async () => {
      const endsAt = Date.now() + 600_000
      const wrapper = build(1800, endsAt)
      vi.advanceTimersByTime(60_000)
      await wrapper.vm.$nextTick()
      expect(wrapper.get('[data-testid="cardio-countdown-label"]').text()).toBe('9:00')
    })

    it('without endsAt, falls back to the existing behavior of targetSeconds from now (backward compatible)', () => {
      const wrapper = build(90)
      expect(wrapper.get('[data-testid="cardio-countdown-label"]').text()).toBe('1:30')
    })

    it('an endsAt already in the past auto-completes immediately: vibrates and emits done on the very first tick', () => {
      const vibrate = vi.fn()
      vi.stubGlobal('navigator', { vibrate })
      const endsAt = Date.now() - 5_000
      const wrapper = build(1800, endsAt)
      expect(wrapper.get('[data-testid="cardio-countdown-label"]').text()).toBe('0:00')
      expect(wrapper.emitted('done')).toHaveLength(1)
      expect(vibrate).toHaveBeenCalledTimes(1)
    })
  })
})

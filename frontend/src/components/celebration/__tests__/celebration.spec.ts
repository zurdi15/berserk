import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { createI18nInstance } from '@/i18n'
import BkCelebration from '../BkCelebration.vue'

const records = [
  { id: 1, exercise_id: 5, kind: 'max_weight', value: 100, achieved_at: '2026-08-06T10:00:00Z' },
  { id: 2, exercise_id: 5, kind: 'est_1rm', value: 120, achieved_at: '2026-08-06T10:00:00Z' },
]

let wrapper: VueWrapper | null = null

// el contenido va teletransportado a document.body, fuera del árbol DOM del
// wrapper: cada test debe desmontar el suyo o el siguiente heredaría su overlay
function mountCelebration() {
  wrapper = mount(BkCelebration, {
    props: { records: records as never, runeName: 'chest' },
    global: { plugins: [createI18nInstance()] },
  })
  return wrapper
}

describe('BkCelebration', () => {
  afterEach(() => {
    wrapper?.unmount()
    wrapper = null
    vi.restoreAllMocks()
    vi.useRealTimers()
  })

  describe('with reduced motion', () => {
    beforeEach(() => {
      vi.spyOn(window, 'matchMedia').mockReturnValue({ matches: true } as MediaQueryList)
    })

    it('renders each record final value immediately, with no count-up', async () => {
      mountCelebration()
      await flushPromises()

      const record1 = document.querySelector('[data-testid="celebration-record-1"]') as HTMLElement
      const record2 = document.querySelector('[data-testid="celebration-record-2"]') as HTMLElement
      expect(record1.textContent).toContain('100')
      expect(record2.textContent).toContain('120')
    })

    it('shows the newRecord heading and the carved ember rune for the given rune name', async () => {
      const w = mountCelebration()
      await flushPromises()

      const overlay = document.querySelector('[data-testid="celebration-overlay"]') as HTMLElement
      expect(overlay.textContent).toContain(w.vm.$t('workout.newRecord'))

      const rune = w.findComponent({ name: 'BkRune' })
      expect(rune.props('name')).toBe('chest')
      expect(rune.props('tone')).toBe('ember')
      expect(rune.props('carve')).toBe(true)
      expect(rune.props('size')).toBe(96)
    })

    it('emits done when tapping anywhere on the overlay', async () => {
      const w = mountCelebration()
      await flushPromises()

      const overlay = document.querySelector('[data-testid="celebration-overlay"]') as HTMLElement
      overlay.click()
      await flushPromises()

      expect(w.emitted('done')).toHaveLength(1)
    })

    it('auto-dismisses and emits done ~3s after mounting, without a tap', async () => {
      vi.useFakeTimers()
      const w = mountCelebration()
      await vi.advanceTimersByTimeAsync(3000)

      expect(w.emitted('done')).toHaveLength(1)
    })
  })

  describe('without reduced motion', () => {
    beforeEach(() => {
      vi.spyOn(window, 'matchMedia').mockReturnValue({ matches: false } as MediaQueryList)
    })

    it('starts each value at 0 right after mounting, before any count-up frame runs', () => {
      mountCelebration()

      const record1 = document.querySelector('[data-testid="celebration-record-1"]') as HTMLElement
      expect(record1.textContent).toContain('0')
      expect(record1.textContent).not.toContain('100')
    })
  })
})

import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/api/domain', () => ({
  updateWorkout: vi.fn(async () => ({})),
  createRoutine: vi.fn(),
  deleteRoutine: vi.fn(),
  replaceRoutineExercises: vi.fn(),
}))

import * as domain from '@/api/domain'
import { createI18nInstance } from '@/i18n'
import FinishSummary from '../FinishSummary.vue'

const workout = {
  id: 9,
  date: '2026-08-05',
  started_at: '2026-08-05T09:00:00Z',
  ended_at: '2026-08-05T10:05:00Z',
  routine_id: null,
  note: null,
  feeling: null,
  stretched: false,
  exercises: [
    {
      id: 20,
      exercise_id: 5,
      position: 0,
      note: null,
      rest_seconds: null,
      sets: [
        { id: 1, set_number: 1, reps: 5, weight_kg: 100, duration_seconds: null, distance_m: null, is_warmup: false, rpe: null, completed_at: 'x' },
        { id: 2, set_number: 2, reps: 5, weight_kg: 40, duration_seconds: null, distance_m: null, is_warmup: true, rpe: null, completed_at: 'x' },
      ],
    },
  ],
  muscle_tag_ids: [],
}

function build(records: unknown[] = []) {
  setActivePinia(createPinia())
  return mount(FinishSummary, {
    props: { workout: workout as never, records: records as never },
    global: { plugins: [createI18nInstance()] },
  })
}

describe('FinishSummary', () => {
  beforeEach(() => {
    vi.mocked(domain.updateWorkout).mockClear()
    // reduced-motion forzado: el test de totales lee el valor final de forma
    // síncrona (sin await) — useAnimatedNumber (item 1) salta directo al
    // objetivo en este modo, igual que en producción
    vi.spyOn(window, 'matchMedia').mockReturnValue({ matches: true } as MediaQueryList)
  })
  afterEach(() => vi.restoreAllMocks())

  it('renders duration, non-warmup set count and effective volume', () => {
    const wrapper = build()
    expect(wrapper.find('[data-testid="summary-duration"]').text()).toBe('1h 5min')
    expect(wrapper.find('[data-testid="summary-sets"]').text()).toBe('1')
    expect(wrapper.find('[data-testid="summary-volume"]').text()).toBe('500 kg')
  })

  it('renders new records earned this session in ember', () => {
    const wrapper = build([{ id: 1, exercise_id: 5, kind: 'max_weight', value: 100, achieved_at: 'x' }])
    expect(wrapper.text()).toContain('100 kg')
    expect(wrapper.find('.text-ember').exists()).toBe(true)
  })

  it('renders a max_volume record through formatWeight too, not as a bare number', () => {
    const wrapper = build([{ id: 2, exercise_id: 5, kind: 'max_volume', value: 1200, achieved_at: 'x' }])
    expect(wrapper.text()).toContain('1200 kg')
  })

  it('item 6: max_weight record (real) keeps its decimal; est_1rm/max_volume records (derived) round to whole kg', () => {
    const wrapper = build([
      { id: 3, exercise_id: 5, kind: 'max_weight', value: 47.5, achieved_at: 'x' },
      { id: 4, exercise_id: 5, kind: 'est_1rm', value: 61.75, achieved_at: 'x' },
    ])
    const text = wrapper.text()
    expect(text).toContain('47.5 kg')
    expect(text).toContain('62 kg')
    expect(text).not.toContain('61.75')
  })

  it('item 6: totalVolume (derived, sum of reps×kg) rounds to whole kg even when the sum is fractional', () => {
    const fractionalWorkout = {
      ...workout,
      exercises: [
        {
          id: 20,
          exercise_id: 5,
          position: 0,
          note: null,
          sets: [
            { id: 1, set_number: 1, reps: 5, weight_kg: 47.5, duration_seconds: null, distance_m: null, is_warmup: false, rpe: null, completed_at: 'x' },
          ],
        },
      ],
    }
    setActivePinia(createPinia())
    const wrapper = mount(FinishSummary, {
      props: { workout: fractionalWorkout as never, records: [] },
      global: { plugins: [createI18nInstance()] },
    })
    // 47.5 kg × 5 reps = 237.5 → redondeado a 238 (era "237.5 kg" antes de item 6)
    expect(wrapper.find('[data-testid="summary-volume"]').text()).toBe('238 kg')
  })

  it('picking a feeling rune calls updateWorkout with the feeling value', async () => {
    const wrapper = build()
    await wrapper.find('[data-testid="feeling-4"]').trigger('click')
    await flushPromises()
    expect(domain.updateWorkout).toHaveBeenCalledWith(9, { feeling: 4 })
  })

  it('saves the note (debounced) via updateWorkout', async () => {
    const wrapper = build()
    const input = wrapper.find('input')
    await input.setValue('Buena sesión')
    await new Promise((resolve) => setTimeout(resolve, 700))
    await flushPromises()
    expect(domain.updateWorkout).toHaveBeenCalledWith(9, { note: 'Buena sesión' })
  })

  it('emits close when the close button is clicked', async () => {
    const wrapper = build()
    await wrapper.find('button.bg-aurora-deep').trigger('click')
    expect(wrapper.emitted('close')).toBeTruthy()
  })

  describe('item 8: stretched toggle', () => {
    it('toggles on click, calling updateWorkout with the new value', async () => {
      const wrapper = build()
      const toggle = wrapper.get('[data-testid="stretched-toggle"]')
      expect(toggle.attributes('aria-pressed')).toBe('false')

      await toggle.trigger('click')
      await flushPromises()

      expect(toggle.attributes('aria-pressed')).toBe('true')
      expect(domain.updateWorkout).toHaveBeenCalledWith(9, { stretched: true })
    })

    it('reverts the optimistic flip when the API call fails', async () => {
      vi.mocked(domain.updateWorkout).mockRejectedValueOnce(new Error('boom'))
      const wrapper = build()
      const toggle = wrapper.get('[data-testid="stretched-toggle"]')

      await toggle.trigger('click')
      await flushPromises()

      expect(toggle.attributes('aria-pressed')).toBe('false')
    })
  })

  describe('item 5: save as routine', () => {
    it('clicking the trigger opens the SaveAsRoutineSheet with this workout', async () => {
      const wrapper = mount(FinishSummary, {
        props: { workout: workout as never, records: [] },
        global: { plugins: [createI18nInstance()] },
        attachTo: document.body,
      })

      await wrapper.find('[data-testid="save-as-routine-btn"]').trigger('click')
      await flushPromises()

      expect(document.body.querySelector('[data-testid="save-as-routine-sheet"]')).not.toBeNull()
      wrapper.unmount()
    })
  })
})

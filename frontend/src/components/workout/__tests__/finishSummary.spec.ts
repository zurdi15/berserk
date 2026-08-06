import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/api/domain', () => ({
  updateWorkout: vi.fn(async () => ({})),
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
  exercises: [
    {
      id: 20,
      exercise_id: 5,
      position: 0,
      note: null,
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
  })

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
})

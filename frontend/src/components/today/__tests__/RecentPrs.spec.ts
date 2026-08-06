import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { createI18nInstance } from '@/i18n'
import RecentPrs from '../RecentPrs.vue'

const exercises = [
  { id: 1, name_es: 'Press banca', name_en: 'Bench press', measurement: 'strength', owner_id: null, muscle_groups: [] },
]

function withI18n() {
  return { global: { plugins: [createI18nInstance()] } }
}

describe('RecentPrs', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    // reduced-motion forzado: se lee el valor final nada más montar, sin
    // avanzar rAF — useAnimatedNumber salta directo al objetivo en este modo
    vi.spyOn(window, 'matchMedia').mockReturnValue({ matches: true } as MediaQueryList)
  })
  afterEach(() => vi.restoreAllMocks())

  it('renders nothing when there are no records', () => {
    const wrapper = mount(RecentPrs, { props: { records: [], exercises }, ...withI18n() })
    expect(wrapper.text()).toBe('')
  })

  it('renders exercise name and kind label alongside the value', () => {
    const wrapper = mount(RecentPrs, {
      props: {
        records: [{ id: 1, exercise_id: 1, kind: 'max_weight', value: 100, achieved_at: '2026-08-01T00:00:00Z' }] as never,
        exercises: exercises as never,
      },
      ...withI18n(),
    })
    expect(wrapper.text()).toContain('Press banca')
    expect(wrapper.text()).toContain('Peso Máx')
    expect(wrapper.text()).toContain('100 kg')
  })

  it('item 6: max_weight (real, logged) keeps its decimal; est_1rm/max_volume (derived) round to whole kg', () => {
    const fractionalRecords = [
      { id: 20, exercise_id: 1, kind: 'max_weight', value: 47.5, achieved_at: '2026-08-01T00:00:00Z' },
      { id: 21, exercise_id: 1, kind: 'est_1rm', value: 61.75, achieved_at: '2026-08-01T00:00:00Z' },
      { id: 22, exercise_id: 1, kind: 'max_volume', value: 1567.5, achieved_at: '2026-08-01T00:00:00Z' },
    ]
    const wrapper = mount(RecentPrs, {
      props: { records: fractionalRecords as never, exercises: exercises as never },
      ...withI18n(),
    })
    const text = wrapper.text()
    expect(text).toContain('47.5 kg') // real: conserva el decimal
    expect(text).toContain('62 kg') // derivado: 61.75 → 62
    expect(text).not.toContain('61.75')
    expect(text).toContain('1568 kg') // derivado: 1567.5 → 1568
    expect(text).not.toContain('1567.5')
  })
})

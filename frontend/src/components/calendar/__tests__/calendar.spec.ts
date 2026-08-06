import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/api/domain', () => ({
  getMonth: vi.fn(async () => ({
    scheduled: [
      { id: 1, date: '2026-08-01', time: '18:00', routine_id: 1, status: 'planned', workout_id: null, note: null },
      { id: 2, date: '2026-08-02', time: '10:00', routine_id: 2, status: 'done', workout_id: 5, note: null },
      { id: 3, date: '2026-08-03', time: null, routine_id: 3, status: 'skipped', workout_id: null, note: 'Too busy' },
      { id: 4, date: '2026-08-01', time: '19:00', routine_id: 1, status: 'planned', workout_id: null, note: null },
      { id: 5, date: '2026-08-02', time: '15:00', routine_id: 2, status: 'done', workout_id: 5, note: null },
    ],
    workouts: [
      { id: 1, date: '2026-08-01', feeling: 4, muscle_group_ids: [1, 2] },
      { id: 2, date: '2026-08-02', feeling: 5, muscle_group_ids: [3] },
    ],
  })),
  getHeatmap: vi.fn(async () => [
    { date: '2026-08-01', count: 2 },
    { date: '2026-08-02', count: 1 },
  ]),
  listRoutines: vi.fn(async () => [
    { id: 1, name: 'Push', description: null, rune: null, color: null, exercises: [] },
    { id: 2, name: 'Pull', description: null, rune: null, color: null, exercises: [] },
  ]),
  listMuscleGroups: vi.fn(async () => [
    { id: 1, slug: 'chest', name_es: 'Pecho', name_en: 'Chest', owner_id: null },
    { id: 2, slug: 'back', name_es: 'Espalda', name_en: 'Back', owner_id: null },
    { id: 3, slug: 'legs', name_es: 'Piernas', name_en: 'Legs', owner_id: null },
    { id: 4, slug: 'shoulders', name_es: 'Hombros', name_en: 'Shoulders', owner_id: null },
    { id: 5, slug: 'biceps', name_es: 'Bíceps', name_en: 'Biceps', owner_id: null },
    { id: 6, slug: 'triceps', name_es: 'Tríceps', name_en: 'Triceps', owner_id: null },
    { id: 7, slug: 'core', name_es: 'Core', name_en: 'Core', owner_id: null },
  ]),
  updateSchedule: vi.fn(async () => ({ id: 3, date: '2026-08-03', time: null, routine_id: 3, status: 'skipped', workout_id: null, note: 'Too busy' })),
  deleteSchedule: vi.fn(async () => {}),
  schedule: vi.fn(async () => ({ id: 6, date: '2026-08-04', time: '20:00', routine_id: 1, status: 'planned', workout_id: null, note: null })),
}))
vi.mock('vue-router', () => ({ useRouter: () => ({ push: vi.fn() }) }))
vi.mock('@/utils/apiErrors', () => ({
  toastApiError: vi.fn(),
}))

import { groupRune } from '@/components/calendar/groupRune'
import MonthGrid from '@/components/calendar/MonthGrid.vue'
import ScheduleSheet from '@/components/calendar/ScheduleSheet.vue'
import * as domain from '@/api/domain'
import { createI18nInstance } from '@/i18n'
import { useAthleteStore } from '@/stores/athlete'

describe('groupRune', () => {
  it('maps chest slug to chest rune', () => {
    expect(groupRune('chest')).toBe('💪')
  })

  it('maps back slug to back rune', () => {
    expect(groupRune('back')).toBe('🏋️')
  })

  it('maps legs slug to legs rune', () => {
    expect(groupRune('legs')).toBe('🦵')
  })

  it('maps shoulders slug to shoulders rune', () => {
    expect(groupRune('shoulders')).toBe('🔶')
  })

  it('maps biceps slug to biceps rune', () => {
    expect(groupRune('biceps')).toBe('💥')
  })

  it('maps triceps slug to triceps rune', () => {
    expect(groupRune('triceps')).toBe('🌟')
  })

  it('maps core slug to core rune', () => {
    expect(groupRune('core')).toBe('🎯')
  })

  it('returns core rune for unknown slugs', () => {
    expect(groupRune('unknown')).toBe('🎯')
  })
})

describe('MonthGrid', () => {
  beforeEach(() => setActivePinia(createPinia()))

  it('renders planned session dot with aurora border', async () => {
    const wrapper = mount(MonthGrid, {
      props: {
        month: {
          scheduled: [
            { id: 1, date: '2026-08-01', time: '18:00', routine_id: 1, status: 'planned', workout_id: null, note: null },
          ],
          workouts: [],
        },
        year: 2026,
        monthNum: 8,
      },
      global: { plugins: [createI18nInstance()] },
    })
    await flushPromises()
    expect(wrapper.find('[data-status="planned"]').exists()).toBe(true)
    expect(wrapper.find('[data-status="planned"]').classes()).toContain('border-2')
    expect(wrapper.find('[data-status="planned"]').classes()).toContain('border-aurora')
  })

  it('renders done session dot with solid aurora', async () => {
    const wrapper = mount(MonthGrid, {
      props: {
        month: {
          scheduled: [
            { id: 2, date: '2026-08-02', time: '10:00', routine_id: 2, status: 'done', workout_id: 5, note: null },
          ],
          workouts: [],
        },
        year: 2026,
        monthNum: 8,
      },
      global: { plugins: [createI18nInstance()] },
    })
    await flushPromises()
    expect(wrapper.find('[data-status="done"]').exists()).toBe(true)
    expect(wrapper.find('[data-status="done"]').classes()).toContain('bg-aurora')
  })

  it('renders skipped session dot with ink-faint', async () => {
    const wrapper = mount(MonthGrid, {
      props: {
        month: {
          scheduled: [
            { id: 3, date: '2026-08-03', time: null, routine_id: 3, status: 'skipped', workout_id: null, note: 'Too busy' },
          ],
          workouts: [],
        },
        year: 2026,
        monthNum: 8,
      },
      global: { plugins: [createI18nInstance()] },
    })
    await flushPromises()
    expect(wrapper.find('[data-status="skipped"]').exists()).toBe(true)
    expect(wrapper.find('[data-status="skipped"]').classes()).toContain('bg-ink-faint')
  })

  it('renders multiple session dots per day', async () => {
    const wrapper = mount(MonthGrid, {
      props: {
        month: {
          scheduled: [
            { id: 1, date: '2026-08-01', time: '18:00', routine_id: 1, status: 'planned', workout_id: null, note: null },
            { id: 4, date: '2026-08-01', time: '19:00', routine_id: 1, status: 'planned', workout_id: null, note: null },
          ],
          workouts: [],
        },
        year: 2026,
        monthNum: 8,
      },
      global: { plugins: [createI18nInstance()] },
    })
    await flushPromises()
    const plannedDots = wrapper.findAll('[data-status="planned"]')
    expect(plannedDots.length).toBe(2)
  })

  it('emits select event when day is clicked', async () => {
    const wrapper = mount(MonthGrid, {
      props: {
        month: {
          scheduled: [],
          workouts: [],
        },
        year: 2026,
        monthNum: 8,
      },
      global: { plugins: [createI18nInstance()] },
    })
    await flushPromises()
    const dayCell = wrapper.find('[data-testid^="day-cell-"]')
    await dayCell.trigger('click')
    expect(wrapper.emitted('select')).toBeTruthy()
  })
})

describe('ScheduleSheet', () => {
  beforeEach(() => setActivePinia(createPinia()))

  it('calls updateSchedule with skipped status when skip action is clicked', async () => {
    const wrapper = mount(ScheduleSheet, {
      props: {
        date: '2026-08-03',
        scheduled: [
          { id: 3, date: '2026-08-03', time: null, routine_id: 3, status: 'planned', workout_id: null, note: 'Too busy' },
        ],
      },
      global: { plugins: [createI18nInstance()] },
    })
    await flushPromises()
    const skipButton = wrapper.find('[data-testid="skip-session-3"]')
    if (skipButton.exists()) {
      await skipButton.trigger('click')
      // After confirmation in modal
      const confirmButton = wrapper.find('[data-testid="confirm-skip"]')
      if (confirmButton.exists()) {
        await confirmButton.trigger('click')
        await flushPromises()
      }
    }
    expect(vi.mocked(domain.updateSchedule)).toHaveBeenCalledWith(
      3,
      { status: 'skipped' },
    )
  })
})

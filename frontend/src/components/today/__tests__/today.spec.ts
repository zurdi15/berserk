import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/api/domain', () => ({
  getStreak: vi.fn(async () => ({ weeks: 3 })),
  getMonth: vi.fn(async () => ({ scheduled: [
    { id: 1, date: '2026-08-06', time: '18:00', routine_id: 1, status: 'planned', workout_id: null, note: null },
    { id: 2, date: '2026-08-06', time: '10:00', routine_id: 2, status: 'done', workout_id: 5, note: null },
    { id: 3, date: '2026-08-06', time: null, routine_id: 3, status: 'skipped', workout_id: null, note: 'Too busy' },
  ], workouts: [] })),
  listWorkouts: vi.fn(async () => []),
  getRecords: vi.fn(async () => []),
  listExercises: vi.fn(async () => []),
  listMuscleGroups: vi.fn(async () => []),
}))
vi.mock('vue-router', () => ({ useRouter: () => ({ push: vi.fn() }) }))

import * as domain from '@/api/domain'
import { createI18nInstance } from '@/i18n'
import { useAthleteStore } from '@/stores/athlete'
import TodayView from '@/views/TodayView.vue'
import TodaySessionCard from '@/components/today/TodaySessionCard.vue'

describe('TodayView', () => {
  beforeEach(() => setActivePinia(createPinia()))

  it('threads athlete user_id through every read', async () => {
    useAthleteStore().view({ id: 7, username: 'freyja', is_admin: false, locale: 'es', units: 'kg', timezone: 'UTC' })
    mount(TodayView, { global: { plugins: [createI18nInstance()] } })
    await flushPromises()
    expect(vi.mocked(domain.getStreak)).toHaveBeenCalledWith(7)
    expect(vi.mocked(domain.getRecords)).toHaveBeenCalledWith({ userId: 7 })
  })

  it('renders the streak in ember when alive', async () => {
    const wrapper = mount(TodayView, { global: { plugins: [createI18nInstance()] } })
    await flushPromises()
    expect(wrapper.find('[data-testid="streak-card"]').classes().join(' ')).toContain('text-ember')
    expect(wrapper.text()).toContain('3')
  })
})

describe('TodaySessionCard status dots', () => {
  beforeEach(() => setActivePinia(createPinia()))

  it('renders planned session with aurora border dot', async () => {
    const schedules = [
      { id: 1, date: '2026-08-06', time: '18:00', routine_id: 1, status: 'planned', workout_id: null, note: null },
    ]
    const wrapper = mount(TodaySessionCard, {
      props: { schedules },
      global: { plugins: [createI18nInstance()] },
    })
    const plannedDot = wrapper.find('[data-testid="session-planned"]').find('span')
    expect(plannedDot.classes()).toContain('border-2')
    expect(plannedDot.classes()).toContain('border-aurora')
  })

  it('renders done session with solid aurora dot', async () => {
    const schedules = [
      { id: 2, date: '2026-08-06', time: '10:00', routine_id: 2, status: 'done', workout_id: 5, note: null },
    ]
    const wrapper = mount(TodaySessionCard, {
      props: { schedules },
      global: { plugins: [createI18nInstance()] },
    })
    const doneDot = wrapper.find('[data-testid="session-done"]').find('span')
    expect(doneDot.classes()).toContain('bg-aurora')
    expect(doneDot.classes()).not.toContain('border-2')
  })

  it('renders skipped session with faint dot', async () => {
    const schedules = [
      { id: 3, date: '2026-08-06', time: null, routine_id: 3, status: 'skipped', workout_id: null, note: 'Too busy' },
    ]
    const wrapper = mount(TodaySessionCard, {
      props: { schedules },
      global: { plugins: [createI18nInstance()] },
    })
    const skippedDot = wrapper.find('[data-testid="session-skipped"]').find('span')
    expect(skippedDot.classes()).toContain('bg-ink-faint')
    expect(skippedDot.classes()).not.toContain('bg-aurora')
  })
})

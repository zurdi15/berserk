import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/api/domain', () => ({
  getStreak: vi.fn(async () => ({ weeks: 3 })),
  getMonth: vi.fn(async () => ({ scheduled: [], workouts: [] })),
  getDistribution: vi.fn(async () => []),
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

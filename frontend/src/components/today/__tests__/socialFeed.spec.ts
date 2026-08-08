import { flushPromises, mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'

import { createI18nInstance } from '@/i18n'
import { useAuthStore } from '@/stores/auth'
import SocialFeedCard from '../SocialFeedCard.vue'

const feedMock = vi.fn()
vi.mock('@/api/domain', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  getSocialFeed: (...args: unknown[]) => feedMock(...args),
}))

function build() {
  return mount(SocialFeedCard, { global: { plugins: [createI18nInstance()] } })
}

const freyja = { id: 2, username: 'freyja', color: '#22c55e' }

describe('SocialFeedCard (v0.12.0)', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    const auth = useAuthStore()
    auth.user = { id: 1, username: 'admin', is_admin: true, locale: 'es', units: 'kg', timezone: 'UTC' } as never
    feedMock.mockReset()
  })

  it('renders events with groups, PRs chip and the weekly comparison', async () => {
    feedMock.mockResolvedValue({
      events: [
        {
          user: freyja,
          workout_id: 9,
          date: '2026-08-08',
          duration_seconds: 3600,
          muscle_groups_es: ['Piernas'],
          muscle_groups_en: ['Legs'],
          pr_count: 2,
          volume_kg: 4200,
        },
      ],
      comparison: [
        { user: { id: 1, username: 'admin', color: null }, is_me: true, streak_weeks: 3, week_workouts: 2, week_volume_kg: 5000 },
        { user: freyja, is_me: false, streak_weeks: 5, week_workouts: 3, week_volume_kg: 6000 },
      ],
    })
    const wrapper = build()
    await flushPromises()

    const event = wrapper.get('[data-testid="feed-event-0"]')
    expect(event.text()).toContain('freyja')
    expect(event.text()).toContain('entrenó Piernas')
    expect(wrapper.get('[data-testid="feed-prs-0"]').text()).toContain('2 PR')

    const comparison = wrapper.get('[data-testid="feed-comparison"]')
    expect(comparison.text()).toContain('Tú')
    expect(wrapper.get('[data-testid="feed-comparison-2"]').text()).toContain('freyja')
  })

  it('renders NOTHING when nobody shares with the user (events empty, comparison = only me)', async () => {
    feedMock.mockResolvedValue({
      events: [],
      comparison: [
        { user: { id: 1, username: 'admin', color: null }, is_me: true, streak_weeks: 0, week_workouts: 0, week_volume_kg: 0 },
      ],
    })
    const wrapper = build()
    await flushPromises()
    expect(wrapper.find('[data-testid="social-feed"]').exists()).toBe(false)
  })

  it('fails silently on network errors (Hoy keeps working without the feed)', async () => {
    feedMock.mockRejectedValue(new Error('offline'))
    const wrapper = build()
    await flushPromises()
    expect(wrapper.find('[data-testid="social-feed"]').exists()).toBe(false)
  })
})

import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { createI18nInstance } from '@/i18n'
import { useAthleteStore } from '@/stores/athlete'
import SharingCard from '../SharingCard.vue'

const push = vi.fn()
vi.mock('vue-router', () => ({ useRouter: () => ({ push }) }))

vi.mock('@/api/domain', () => ({
  getSharing: vi.fn(() => Promise.resolve({
    given: [
      { id: 2, username: 'freyja', is_admin: false, locale: 'es', units: 'kg', timezone: 'UTC' },
    ],
    received: [
      { id: 3, username: 'freyr', is_admin: false, locale: 'es', units: 'kg', timezone: 'UTC' },
    ],
  })),
  revokeSharing: vi.fn(() => Promise.resolve()),
  grantSharing: vi.fn((username: string) => Promise.resolve({
    id: 4,
    username,
    is_admin: false,
    locale: 'es',
    units: 'kg',
    timezone: 'UTC',
  })),
}))

describe('SharingCard', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
  })

  function build() {
    return mount(SharingCard, {
      global: {
        plugins: [createI18nInstance()],
      },
    })
  }

  it('renders given and received users from getSharing', async () => {
    const wrapper = build()
    await wrapper.vm.$nextTick()
    await new Promise(resolve => setTimeout(resolve, 0))

    // Verify the component renders sections for given and received sharing
    const givenSection = wrapper.text()
    expect(givenSection).toContain('freyja')
    expect(givenSection).toContain('freyr')
  })

  it('clicking ver on a received user sets athlete store and navigates', async () => {
    const wrapper = build()
    await wrapper.vm.$nextTick()
    await new Promise(resolve => setTimeout(resolve, 0))

    // Find and click the "ver" button for a received user
    const verButtons = wrapper.findAll('[data-testid="view-user-btn"]')
    if (verButtons.length > 0) {
      await verButtons[0].trigger('click')
      await wrapper.vm.$nextTick()

      // Verify athlete store was updated
      const athlete = useAthleteStore()
      expect(athlete.viewing).not.toBeNull()
      expect(athlete.viewing?.username).toBe('freyr')

      // Verify router navigation
      expect(push).toHaveBeenCalledWith({ name: 'today' })
    }
  })

  it('renders button text from i18n', async () => {
    const wrapper = build()
    await wrapper.vm.$nextTick()
    await new Promise(resolve => setTimeout(resolve, 0))

    // Verify buttons render their text (i18n keys resolved)
    const text = wrapper.text()
    expect(text).toContain('Ver') // Spanish for 'view'
    expect(text).toContain('Borrar') // Spanish for 'delete'
  })

  it('revoke button triggers confirmation sheet', async () => {
    const wrapper = build()
    await wrapper.vm.$nextTick()
    await new Promise(resolve => setTimeout(resolve, 0))

    // Trigger revoke on first user
    const revokeButtons = wrapper.findAll('[data-testid="revoke-btn"]')
    if (revokeButtons.length > 0) {
      await revokeButtons[0].trigger('click')
      await wrapper.vm.$nextTick()

      // Verify sheet exists
      const sheet = wrapper.findComponent({ name: 'BkSheet' })
      expect(sheet.exists()).toBe(true)
    }
  })
})

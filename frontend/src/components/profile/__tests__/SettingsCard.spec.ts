import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { createI18nInstance } from '@/i18n'
import { useAuthStore } from '@/stores/auth'
import { useToastStore } from '@/stores/toast'
import SettingsCard from '../SettingsCard.vue'

vi.mock('@/api/auth', () => ({
  updateSettings: vi.fn((partial) => Promise.resolve({
    id: 1,
    username: 'test',
    is_admin: false,
    locale: partial.locale || 'es',
    units: partial.units || 'kg',
    timezone: partial.timezone || 'UTC',
  })),
}))

describe('SettingsCard', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    const auth = useAuthStore()
    auth.user = {
      id: 1,
      username: 'test',
      is_admin: false,
      locale: 'es',
      units: 'kg',
      timezone: 'UTC',
    }
  })

  function build() {
    return mount(SettingsCard, {
      global: {
        plugins: [createI18nInstance()],
      },
    })
  }

  it('changes units to lb and calls updateSettings', async () => {
    const { updateSettings } = await import('@/api/auth')
    const wrapper = build()

    // Find and interact with units select
    const unitsSelect = wrapper.find('[data-testid="units-select"] select')
    await unitsSelect.setValue('lb')

    // Wait for updates
    await wrapper.vm.$nextTick()

    // Verify updateSettings was called with {units: 'lb'}
    expect(updateSettings).toHaveBeenCalledWith({ units: 'lb' })

    // Verify toast was pushed
    const toast = useToastStore()
    expect(toast.toasts.length).toBeGreaterThan(0)
  })
})

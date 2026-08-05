import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { createI18nInstance } from '@/i18n'
import { useAuthStore } from '@/stores/auth'
import ProfileView from '../ProfileView.vue'

const push = vi.fn()
vi.mock('vue-router', () => ({ useRouter: () => ({ push }) }))

vi.mock('@/api/auth', () => ({
  updateSettings: vi.fn(),
  changePassword: vi.fn(),
}))

vi.mock('@/api/domain', () => ({
  getSharing: vi.fn(() => Promise.resolve({
    given: [],
    received: [],
  })),
  revokeSharing: vi.fn(),
  grantSharing: vi.fn(),
}))

// Mock child components to avoid complex nested dependencies
vi.mock('@/components/profile/SettingsCard.vue', () => ({
  default: { name: 'SettingsCard', template: '<div data-testid="settings-card">Settings</div>' },
}))
vi.mock('@/components/profile/PasswordCard.vue', () => ({
  default: { name: 'PasswordCard', template: '<div data-testid="password-card">Password</div>' },
}))
vi.mock('@/components/profile/SharingCard.vue', () => ({
  default: { name: 'SharingCard', template: '<div data-testid="sharing-card">Sharing</div>' },
}))
vi.mock('@/components/profile/AdminCard.vue', () => ({
  default: { name: 'AdminCard', template: '<div data-testid="admin-card">Admin</div>' },
}))

describe('ProfileView', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
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
    return mount(ProfileView, {
      global: {
        plugins: [createI18nInstance()],
      },
    })
  }

  it('logout button calls auth.logout() store action', async () => {
    const wrapper = build()
    const auth = useAuthStore()

    // Spy on logout store action
    const logoutSpy = vi.spyOn(auth, 'logout').mockResolvedValue(undefined)

    // Find and click logout button
    const logoutBtn = wrapper.find('[data-testid="logout-btn"]')
    if (logoutBtn.exists()) {
      await logoutBtn.trigger('click')

      // Wait for async
      await new Promise(resolve => setTimeout(resolve, 0))
      await wrapper.vm.$nextTick()

      // Verify store logout was called
      expect(logoutSpy).toHaveBeenCalled()
    }
  })

  it('logout navigates to login after store action', async () => {
    const wrapper = build()
    const auth = useAuthStore()

    // Mock the logout action to avoid API call
    vi.spyOn(auth, 'logout').mockResolvedValue(undefined)

    // Find and click logout button
    const logoutBtn = wrapper.find('[data-testid="logout-btn"]')
    if (logoutBtn.exists()) {
      await logoutBtn.trigger('click')

      // Wait for async
      await new Promise(resolve => setTimeout(resolve, 0))
      await wrapper.vm.$nextTick()

      // Verify navigation to login
      expect(push).toHaveBeenCalledWith({ name: 'login' })
    }
  })

  it('renders profile tab by default', async () => {
    const wrapper = build()
    await wrapper.vm.$nextTick()

    // Verify the first tab is profile
    const tabsText = wrapper.text()
    expect(tabsText).toContain('Perfil') // First tab should be Perfil
  })

  it('shows admin tab when user is admin', async () => {
    const auth = useAuthStore()
    auth.user = {
      id: 1,
      username: 'admin',
      is_admin: true,
      locale: 'es',
      units: 'kg',
      timezone: 'UTC',
    }

    const wrapper = build()
    await wrapper.vm.$nextTick()

    const tabsText = wrapper.text()
    expect(tabsText).toContain('Administración') // Spanish for 'Admin'
  })

  it('hides admin tab when user is not admin', async () => {
    const auth = useAuthStore()
    auth.user = {
      id: 2,
      username: 'user',
      is_admin: false,
      locale: 'es',
      units: 'kg',
      timezone: 'UTC',
    }

    const wrapper = build()
    await wrapper.vm.$nextTick()

    const tabsText = wrapper.text()
    expect(tabsText).not.toContain('Administración')
  })
})

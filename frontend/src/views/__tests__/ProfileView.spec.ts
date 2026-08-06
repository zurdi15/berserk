import { flushPromises, mount } from '@vue/test-utils'
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
  listRoutines: vi.fn(() => Promise.resolve([])),
  adminListUsers: vi.fn(() => Promise.resolve([
    { id: 1, username: 'root-admin', is_admin: true, locale: 'es', units: 'kg', timezone: 'UTC' },
  ])),
  adminListInvites: vi.fn(() => Promise.resolve([])),
  adminCreateUser: vi.fn(),
  adminUpdateUser: vi.fn(),
  adminDeleteUser: vi.fn(),
  adminCreateInvite: vi.fn(),
  adminDeleteInvite: vi.fn(),
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

  // por defecto las tarjetas hijas van con el auto-stub de VTU (contenido
  // irrelevante para estos tests); las pruebas de integración de C1 las
  // desactivan una a una (stubs: false) para comprobar el control real
  function build(stubs: Record<string, boolean> = {}) {
    return mount(ProfileView, {
      global: {
        plugins: [createI18nInstance()],
        stubs: {
          SettingsCard: true,
          PasswordCard: true,
          SharingCard: true,
          AdminCard: true,
          ...stubs,
        },
      },
    })
  }

  it('logout button calls auth.logout() store action', async () => {
    const wrapper = build()
    const auth = useAuthStore()
    const logoutSpy = vi.spyOn(auth, 'logout').mockResolvedValue(undefined)

    const logoutBtn = wrapper.find('[data-testid="logout-btn"]')
    await logoutBtn.trigger('click')
    await flushPromises()

    expect(logoutSpy).toHaveBeenCalled()
  })

  it('logout navigates to login after store action', async () => {
    const wrapper = build()
    const auth = useAuthStore()
    vi.spyOn(auth, 'logout').mockResolvedValue(undefined)

    const logoutBtn = wrapper.find('[data-testid="logout-btn"]')
    await logoutBtn.trigger('click')
    await flushPromises()

    expect(push).toHaveBeenCalledWith({ name: 'login' })
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

  // C1: BkTabs no tiene slot — este contenido nunca llegó a renderizar antes
  // del fix. Estas 3 pruebas son la red de seguridad: cada pestaña debe montar
  // un control hijo real (no un stub, no solo el texto de la pestaña).
  describe('C1: cada pestaña monta un control hijo real', () => {
    it('profile tab renders the real settings select (locale/units), not a swallowed slot', async () => {
      const wrapper = build({ SettingsCard: false })
      await flushPromises()

      const localeSelect = wrapper.find('[data-testid="locale-select"] select')
      expect(localeSelect.exists()).toBe(true)
      expect(localeSelect.text()).toContain('Español')
      expect(localeSelect.text()).toContain('English')
    })

    it('routines tab renders the real RoutineList with its create-routine control', async () => {
      const wrapper = build()
      await flushPromises()

      const routinesTab = wrapper.findAll('[role="tab"]').find((t) => t.text() === 'Rutinas')
      expect(routinesTab).not.toBeUndefined()
      await routinesTab!.trigger('click')
      await flushPromises()

      const newRoutineBtn = wrapper.findAll('button').find((b) => b.text() === 'Nueva rutina')
      expect(newRoutineBtn).not.toBeUndefined()
    })

    it('admin tab renders the real admin table with the mocked admin user row', async () => {
      const auth = useAuthStore()
      auth.user = {
        id: 1,
        username: 'root-admin',
        is_admin: true,
        locale: 'es',
        units: 'kg',
        timezone: 'UTC',
      }

      const wrapper = build({ AdminCard: false })
      await flushPromises()

      const adminTab = wrapper.findAll('[role="tab"]').find((t) => t.text() === 'Administración')
      expect(adminTab).not.toBeUndefined()
      await adminTab!.trigger('click')
      await flushPromises()

      const table = wrapper.find('table')
      expect(table.exists()).toBe(true)
      const userRow = wrapper.find('[data-testid="user-row-1"]')
      expect(userRow.exists()).toBe(true)
      expect(userRow.text()).toContain('root-admin')
    })
  })
})

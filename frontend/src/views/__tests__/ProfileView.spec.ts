import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { reactive } from 'vue'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { createI18nInstance } from '@/i18n'
import { useAuthStore } from '@/stores/auth'
import ProfileView from '../ProfileView.vue'

const push = vi.fn()
const replace = vi.fn()
// item 1 (v0.3.2): reactivo de verdad (no un objeto plano) — useTabHash
// observa route.hash, así que los tests de "cambio de hash tras montar"
// (atrás/adelante del navegador) necesitan que mutarlo dispare el watcher
const mockRoute = reactive({ hash: '' })
vi.mock('vue-router', () => ({
  useRouter: () => ({ push, replace }),
  useRoute: () => mockRoute,
}))

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
  listExercises: vi.fn(() => Promise.resolve([])),
  listMuscleGroups: vi.fn(() => Promise.resolve([])),
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
  // M9: al menos un test de este archivo abre un panel flotante real
  // (BkSelect, vía la pestaña de perfil) que se registra en la pila de
  // capas COMPARTIDA (layerStack.ts) — sin desmontar, ese registro nunca se
  // limpia (solo onBeforeUnmount lo hace) y queda filtrado para el resto de
  // tests del proceso. Un afterEach que desmonta cubre este archivo entero.
  let wrapper: VueWrapper | null = null

  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    mockRoute.hash = ''
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

  afterEach(() => {
    wrapper?.unmount()
    wrapper = null
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
    wrapper = build()
    const auth = useAuthStore()
    const logoutSpy = vi.spyOn(auth, 'logout').mockResolvedValue(undefined)

    const logoutBtn = wrapper.find('[data-testid="logout-btn"]')
    await logoutBtn.trigger('click')
    await flushPromises()

    expect(logoutSpy).toHaveBeenCalled()
  })

  it('logout navigates to login after store action', async () => {
    wrapper = build()
    const auth = useAuthStore()
    vi.spyOn(auth, 'logout').mockResolvedValue(undefined)

    const logoutBtn = wrapper.find('[data-testid="logout-btn"]')
    await logoutBtn.trigger('click')
    await flushPromises()

    expect(push).toHaveBeenCalledWith({ name: 'login' })
  })

  it('item 12: the logout button is full-width and danger-styled', async () => {
    wrapper = build()
    await wrapper.vm.$nextTick()

    const logoutBtn = wrapper.get('[data-testid="logout-btn"]')
    expect(logoutBtn.classes()).toContain('w-full')
    expect(logoutBtn.classes()).toContain('border-danger')
  })

  it('item 10: the library tab has no "Biblioteca" heading (the tab already says it — ExerciseManager\'s own "Catálogo predefinido" h2 is unrelated and stays)', async () => {
    wrapper = build()
    await flushPromises()

    const libraryTab = wrapper.findAll('[role="tab"]').find((tab) => tab.text() === 'Biblioteca')
    await libraryTab!.trigger('click')
    await flushPromises()

    const headings = wrapper.findAll('h2').map((h) => h.text())
    expect(headings).not.toContain('Biblioteca')
  })

  it('renders profile tab by default', async () => {
    wrapper = build()
    await wrapper.vm.$nextTick()

    // Verify the first tab is profile
    const tabsText = wrapper.text()
    expect(tabsText).toContain('Perfil') // First tab should be Perfil
  })

  // item 4/7: cada panel de pestaña anima su entrada — bk-stagger en los que
  // tienen varios hijos, bk-rise (vía Transition) en los de un único hijo
  it('item 4: the profile tab panel has bk-stagger on its container', async () => {
    wrapper = build()
    await wrapper.vm.$nextTick()

    expect(wrapper.find('.bk-stagger').exists()).toBe(true)
  })

  it('item 4: the library tab panel gets bk-stagger when switched to', async () => {
    wrapper = build()
    await flushPromises()

    const libraryTab = wrapper.findAll('[role="tab"]').find((tab) => tab.text() === 'Biblioteca')
    await libraryTab!.trigger('click')
    await flushPromises()

    expect(wrapper.find('.bk-stagger').exists()).toBe(true)
  })

  it('item 4: the routines tab panel (single child, no stagger) still replays entry via bk-rise on switch', async () => {
    wrapper = build()
    await flushPromises()

    const routinesTab = wrapper.findAll('[role="tab"]').find((tab) => tab.text() === 'Rutinas')
    await routinesTab!.trigger('click')
    await flushPromises()

    // el panel de rutinas ya no tiene bk-stagger (un único hijo): el
    // contenedor bk-stagger de "profile" ya no está en el DOM tras el switch
    expect(wrapper.find('.bk-stagger').exists()).toBe(false)
    expect(wrapper.findComponent({ name: 'RoutineList' }).exists()).toBe(true)
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

    wrapper = build()
    await wrapper.vm.$nextTick()

    // item 2 (v0.3.2): 'Administración' se acortó a 'Admin' (fit de 4
    // pestañas en 360px, ver BkTabs.vue) — el inglés ya usaba esta forma
    const tabsText = wrapper.text()
    expect(tabsText).toContain('Admin')
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

    wrapper = build()
    await wrapper.vm.$nextTick()

    const tabsText = wrapper.text()
    expect(tabsText).not.toContain('Administración')
  })

  // C1: BkTabs no tiene slot — este contenido nunca llegó a renderizar antes
  // del fix. Estas 3 pruebas son la red de seguridad: cada pestaña debe montar
  // un control hijo real (no un stub, no solo el texto de la pestaña).
  describe('C1: cada pestaña monta un control hijo real', () => {
    it('profile tab renders the real settings select (locale/units), not a swallowed slot', async () => {
      wrapper = build({ SettingsCard: false })
      await flushPromises()

      // BkSelect v2 (round 7): ya no es un <select> nativo, sino un botón
      // role=combobox que abre un listbox propio — mismo test-id en la raíz
      const localeTrigger = wrapper.find('[data-testid="locale-select"] [role="combobox"]')
      expect(localeTrigger.exists()).toBe(true)
      await localeTrigger.trigger('click')
      const options = document.querySelectorAll('[role="option"]')
      expect(Array.from(options).some((o) => o.textContent?.includes('Español'))).toBe(true)
      expect(Array.from(options).some((o) => o.textContent?.includes('English'))).toBe(true)
    })

    it('routines tab renders the real RoutineList with its create-routine control', async () => {
      wrapper = build()
      await flushPromises()

      const routinesTab = wrapper.findAll('[role="tab"]').find((t) => t.text() === 'Rutinas')
      expect(routinesTab).not.toBeUndefined()
      await routinesTab!.trigger('click')
      await flushPromises()

      const newRoutineBtn = wrapper.findAll('button').find((b) => b.text() === 'Nueva rutina')
      expect(newRoutineBtn).not.toBeUndefined()
    })

    it('library tab renders the real ExerciseManager control, not a swallowed slot', async () => {
      wrapper = build()
      await flushPromises()

      const libraryTab = wrapper.findAll('[role="tab"]').find((tab) => tab.text() === 'Biblioteca')
      expect(libraryTab).not.toBeUndefined()
      await libraryTab!.trigger('click')
      await flushPromises()

      const newExerciseBtn = wrapper.find('[data-testid="new-exercise-btn"]')
      expect(newExerciseBtn.exists()).toBe(true)
      expect(newExerciseBtn.text()).toBe('Nuevo ejercicio')
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

      wrapper = build({ AdminCard: false })
      await flushPromises()

      // item 2 (v0.3.2): 'Administración' se acorta a 'Admin' — el inglés ya
      // usaba esa forma corta; hacía falta para que las 4 pestañas quepan en
      // 360px (ver la aritmética en BkTabs.vue)
      const adminTab = wrapper.findAll('[role="tab"]').find((t) => t.text() === 'Admin')
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

  describe('item 1 (v0.3.2): tab anchored to the URL hash', () => {
    it('mounting with #routines in the hash activates the routines tab (real RoutineList renders, not just the tab label)', async () => {
      mockRoute.hash = '#routines'
      wrapper = build()
      await flushPromises()

      const newRoutineBtn = wrapper.findAll('button').find((b) => b.text() === 'Nueva rutina')
      expect(newRoutineBtn).not.toBeUndefined()
      expect(wrapper.findAll('[role="tab"]').find((t) => t.text() === 'Rutinas')?.attributes('aria-selected')).toBe('true')
    })

    it('clicking a tab calls router.replace with the tab hash (not push — no history spam per tap)', async () => {
      wrapper = build()
      await flushPromises()
      replace.mockClear()

      const libraryTab = wrapper.findAll('[role="tab"]').find((t) => t.text() === 'Biblioteca')!
      await libraryTab.trigger('click')
      await flushPromises()

      expect(replace).toHaveBeenCalledWith({ hash: '#library' })
      expect(push).not.toHaveBeenCalled()
    })

    it('an invalid/junk hash falls back to the default (profile) tab', async () => {
      mockRoute.hash = '#not-a-real-tab'
      wrapper = build()
      await flushPromises()

      expect(wrapper.findAll('[role="tab"]').find((t) => t.text() === 'Perfil')?.attributes('aria-selected')).toBe('true')
    })

    it('a non-admin loading #admin falls back to the default (profile) tab', async () => {
      mockRoute.hash = '#admin'
      // auth.user ya es no-admin por el beforeEach
      wrapper = build()
      await flushPromises()

      expect(wrapper.findAll('[role="tab"]').find((t) => t.text() === 'Perfil')?.attributes('aria-selected')).toBe('true')
      expect(wrapper.find('table').exists()).toBe(false)
    })

    it('a hash change after mount (browser back/forward) switches the active tab', async () => {
      wrapper = build()
      await flushPromises()
      expect(wrapper.findAll('[role="tab"]').find((t) => t.text() === 'Perfil')?.attributes('aria-selected')).toBe('true')

      mockRoute.hash = '#library'
      await flushPromises()

      expect(wrapper.findAll('[role="tab"]').find((t) => t.text() === 'Biblioteca')?.attributes('aria-selected')).toBe('true')
    })
  })
})

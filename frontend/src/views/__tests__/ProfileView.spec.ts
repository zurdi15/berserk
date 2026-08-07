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
  // desactivan una a una (stubs: false) para comprobar el control real.
  // attachTo: document.body (item 5, v0.4.2) — igual que library.spec.ts:
  // wrapper.isVisible() encadena getComputedStyle por el árbol de
  // ancestros, y happy-dom solo lo calcula bien para nodos conectados al
  // documento real (un nodo detached devuelve display '' en vez de 'none',
  // falso positivo de "visible"). afterEach ya desmonta con unmount(), que
  // limpia el nodo adjuntado.
  function build(stubs: Record<string, boolean> = {}) {
    return mount(ProfileView, {
      attachTo: document.body,
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

  // v0.5.0 (modelo de scroll único, ver ShellView.vue): la raíz FLUYE contra
  // <main>, las tiras (principal + sección de biblioteca) viven en UN bloque
  // sticky con fondo sólido, y los cambios de pestaña/sección resetean el
  // scroll de <main> explícitamente (el hash no cambia el path, así que el
  // reset de ShellView no aplica)
  describe('v0.5.0: single-scroll model (sticky strips, flowing panels)', () => {
    it('root flows (no bounded chain) and both strips live in ONE sticky block with a solid background', async () => {
      wrapper = build()
      await flushPromises()

      expect(wrapper.classes()).not.toContain('h-full')

      const stickyBlock = wrapper.get('[data-testid="profile-tabs-sticky"]')
      expect(stickyBlock.classes()).toEqual(expect.arrayContaining(['sticky', 'top-0', 'bk-chrome-bg']))

      // la tira de sección de biblioteca SOLO existe dentro del bloque sticky
      // cuando la pestaña activa es Biblioteca
      expect(stickyBlock.find('[data-testid="library-section-tabs"]').exists()).toBe(false)
      const libraryTab = wrapper.findAll('[role="tab"]').find((t) => t.text() === 'Biblioteca')!
      await libraryTab.trigger('click')
      await flushPromises()
      expect(stickyBlock.find('[data-testid="library-section-tabs"]').exists()).toBe(true)
    })

    it('panels flow: no internal scroll containers left in profile, routines, library or admin', async () => {
      const auth = useAuthStore()
      auth.user = { id: 1, username: 'root-admin', is_admin: true, locale: 'es', units: 'kg', timezone: 'UTC' }
      wrapper = build()
      const w = wrapper
      await flushPromises()

      const panel = w.get('[data-testid="logout-btn"]').element.closest('.bk-stagger')!
      expect(panel.classList.contains('overflow-y-auto')).toBe(false)

      const clickTab = async (name: string) => {
        const tab = w.findAll('[role="tab"]').find((t) => t.text() === name)!
        await tab.trigger('click')
        await flushPromises()
      }

      await clickTab('Rutinas')
      expect(w.findComponent({ name: 'RoutineList' }).classes()).not.toContain('overflow-y-auto')

      await clickTab('Biblioteca')
      const exerciseManager = w.findComponent({ name: 'ExerciseManager' })
      expect(exerciseManager.element.closest('.overflow-y-auto')).toBeNull()

      await clickTab('Admin')
      expect(w.findComponent({ name: 'AdminCard' }).classes()).not.toContain('overflow-y-auto')
    })

    // v0.5.0: el scroll vive en <main> — cambiar de pestaña o de sección de
    // biblioteca lo resetea vía resetMainScroll (los paneles ya no remontan
    // un scroller propio que nazca en 0)
    it('switching the profile tab or the library sub-selector resets <main> scrollTop', async () => {
      const mainEl = document.createElement('main')
      document.body.appendChild(mainEl)

      wrapper = build()
      await flushPromises()

      mainEl.scrollTop = 400
      const libraryTab = wrapper.findAll('[role="tab"]').find((t) => t.text() === 'Biblioteca')!
      await libraryTab.trigger('click')
      await flushPromises()
      expect(mainEl.scrollTop).toBe(0)

      mainEl.scrollTop = 250
      const sectionTabs = wrapper.get('[data-testid="library-section-tabs"]').findAll('[role="tab"]')
      await sectionTabs[1].trigger('click')
      await flushPromises()
      expect(mainEl.scrollTop).toBe(0)

      mainEl.remove()
    })
  })

  describe('item 5 (v0.4.2): library gets the records-tab layout', () => {
    async function openLibraryTab(w: VueWrapper) {
      const libraryTab = w.findAll('[role="tab"]').find((tab) => tab.text() === 'Biblioteca')
      await libraryTab!.trigger('click')
      await flushPromises()
    }

    it('renders a segmented Ejercicios/Grupos musculares selector, with Ejercicios active by default', async () => {
      wrapper = build()
      await flushPromises()
      await openLibraryTab(wrapper)

      const sectionTabs = wrapper.get('[data-testid="library-section-tabs"]').findAll('[role="tab"]')
      expect(sectionTabs.map((tab) => tab.text())).toEqual(['Ejercicios', 'Grupos musculares'])
      expect(sectionTabs[0].attributes('aria-selected')).toBe('true')
      expect(sectionTabs[1].attributes('aria-selected')).toBe('false')
    })

    it('flipping the selector shows one manager at a time — real controls, not stubs, only one visible', async () => {
      wrapper = build()
      await flushPromises()
      await openLibraryTab(wrapper)

      const newExerciseBtn = wrapper.get('[data-testid="new-exercise-btn"]')
      const newGroupBtn = wrapper.get('[data-testid="open-create-group-btn"]')
      expect(newExerciseBtn.isVisible()).toBe(true)
      expect(newGroupBtn.isVisible()).toBe(false)

      const sectionTabs = wrapper.get('[data-testid="library-section-tabs"]').findAll('[role="tab"]')
      await sectionTabs[1].trigger('click')
      await flushPromises()

      expect(newExerciseBtn.isVisible()).toBe(false)
      expect(newGroupBtn.isVisible()).toBe(true)
      expect(sectionTabs[1].attributes('aria-selected')).toBe('true')
    })

    it('flipping back and forth does not remount either manager (same DOM node, no re-animation/re-fetch)', async () => {
      const { listExercises, listMuscleGroups } = await import('@/api/domain')

      wrapper = build()
      await flushPromises()
      await openLibraryTab(wrapper)

      const exerciseManagerBefore = wrapper.findComponent({ name: 'ExerciseManager' }).element
      const groupManagerBefore = wrapper.findComponent({ name: 'MuscleGroupManager' }).element
      const exerciseCallsAfterMount = vi.mocked(listExercises).mock.calls.length
      const groupCallsAfterMount = vi.mocked(listMuscleGroups).mock.calls.length

      const sectionTabs = wrapper.get('[data-testid="library-section-tabs"]').findAll('[role="tab"]')
      await sectionTabs[1].trigger('click')
      await flushPromises()
      await sectionTabs[0].trigger('click')
      await flushPromises()

      expect(wrapper.findComponent({ name: 'ExerciseManager' }).element).toBe(exerciseManagerBefore)
      expect(wrapper.findComponent({ name: 'MuscleGroupManager' }).element).toBe(groupManagerBefore)
      expect(vi.mocked(listExercises).mock.calls.length).toBe(exerciseCallsAfterMount)
      expect(vi.mocked(listMuscleGroups).mock.calls.length).toBe(groupCallsAfterMount)
    })

    it('mounting with #library in the hash lands on the panel with Ejercicios selected by default', async () => {
      mockRoute.hash = '#library'
      wrapper = build()
      await flushPromises()

      expect(wrapper.findAll('[role="tab"]').find((t) => t.text() === 'Biblioteca')?.attributes('aria-selected')).toBe('true')
      const sectionTabs = wrapper.get('[data-testid="library-section-tabs"]').findAll('[role="tab"]')
      expect(sectionTabs[0].attributes('aria-selected')).toBe('true')
      expect(wrapper.get('[data-testid="new-exercise-btn"]').isVisible()).toBe(true)
    })
  })
})

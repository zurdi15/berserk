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
  // v0.27.0: el avatar del hub es AvatarPicker, que importa estas tres
  avatarUrl: vi.fn(() => '/api/v1/users/1/avatar'),
  uploadAvatar: vi.fn(),
  deleteAvatar: vi.fn(),
  getSharing: vi.fn(() => Promise.resolve({
    given: [],
    received: [],
  })),
  revokeSharing: vi.fn(),
  grantSharing: vi.fn(),
  listRoutines: vi.fn(() => Promise.resolve([])),
  listExercises: vi.fn(() => Promise.resolve([])),
  listMuscleGroups: vi.fn(() => Promise.resolve([])),
  listWorkouts: vi.fn(() => Promise.resolve([])),
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

// facelift: Perfil es un HUB de listas (identidad + actividad + filas de
// sección) — las secciones se abren por su fila (profile-link-{tab}) y
// vuelven con profile-back; el hash sigue siendo la fuente de verdad
describe('ProfileView', () => {
  // M9: al menos un test de este archivo abre un panel flotante real
  // (BkSelect, vía la sección de ajustes) que se registra en la pila de
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
  // documento real. afterEach ya desmonta con unmount().
  function build(stubs: Record<string, boolean> = {}) {
    return mount(ProfileView, {
      attachTo: document.body,
      global: {
        plugins: [createI18nInstance()],
        stubs: {
          SettingsCard: true,
          AccountCard: true,
          PasswordCard: true,
          SharingCard: true,
          AdminCard: true,
          ...stubs,
        },
      },
    })
  }

  async function openSection(w: VueWrapper, tab: string) {
    await w.get(`[data-testid="profile-link-${tab}"]`).trigger('click')
    await flushPromises()
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

  it('item 10: the library section has no "Biblioteca" heading beyond the back-row title', async () => {
    wrapper = build()
    await flushPromises()

    await openSection(wrapper, 'library')

    const headings = wrapper.findAll('h2').map((h) => h.text())
    expect(headings).not.toContain('Biblioteca')
  })

  it('facelift: renders the hub by default — identity header, activity dots and one row per section', async () => {
    wrapper = build()
    await flushPromises()

    expect(wrapper.find('[data-testid="profile-identity"]').exists()).toBe(true)
    expect(wrapper.text()).toContain('test')
    expect(wrapper.find('[data-testid="profile-activity"]').exists()).toBe(true)
    for (const tab of ['settings', 'account', 'routines', 'library', 'sharing']) {
      expect(wrapper.find(`[data-testid="profile-link-${tab}"]`).exists()).toBe(true)
    }
  })

  // v0.27.0 (zurdi: "el tema del perfil y los ajustes está descolocado"):
  // Ajustes = la web app; Cuenta = tú. Y bajo el avatar no cuelga nada.
  describe('v0.27.0: Ajustes (web app) vs Cuenta (identidad)', () => {
    it('the identity header has no "Editar"/"Quitar foto" buttons — the avatar itself is the control', async () => {
      const auth = useAuthStore()
      auth.user = { ...auth.user!, has_avatar: true, avatar_version: 'abc' }
      wrapper = build()
      await flushPromises()

      expect(wrapper.find('[data-testid="profile-avatar-btn"]').exists()).toBe(true)
      expect(wrapper.find('[data-testid="profile-edit-link"]').exists()).toBe(false)
      expect(wrapper.find('[data-testid="profile-avatar-remove"]').exists()).toBe(false)
    })

    it('the account row is right below settings and opens AccountCard + PasswordCard', async () => {
      wrapper = build()
      await flushPromises()

      const rows = wrapper.findAll('[data-testid^="profile-link-"]')
      expect(rows.map((r) => r.attributes('data-testid')).slice(0, 2)).toEqual([
        'profile-link-settings',
        'profile-link-account',
      ])
      expect(rows[1].text()).toContain('Cuenta')

      await openSection(wrapper, 'account')
      expect(wrapper.findComponent({ name: 'AccountCard' }).exists()).toBe(true)
      expect(wrapper.findComponent({ name: 'PasswordCard' }).exists()).toBe(true)
    })

    it('the settings section no longer carries the password card (that lives in Cuenta now)', async () => {
      wrapper = build()
      await flushPromises()

      await openSection(wrapper, 'settings')
      expect(wrapper.findComponent({ name: 'SettingsCard' }).exists()).toBe(true)
      expect(wrapper.findComponent({ name: 'PasswordCard' }).exists()).toBe(false)
      expect(wrapper.findComponent({ name: 'AccountCard' }).exists()).toBe(false)
    })

    it('#account in the hash lands straight on the account section', async () => {
      mockRoute.hash = '#account'
      wrapper = build()
      await flushPromises()

      expect(wrapper.findComponent({ name: 'AccountCard' }).exists()).toBe(true)
      expect(wrapper.find('[data-testid="profile-identity"]').exists()).toBe(false)
    })
  })

  it('facelift: a section opens from its row and the back row returns to the hub', async () => {
    wrapper = build()
    await flushPromises()

    await openSection(wrapper, 'routines')
    expect(wrapper.findComponent({ name: 'RoutineList' }).exists()).toBe(true)
    expect(wrapper.find('[data-testid="profile-identity"]').exists()).toBe(false)

    await wrapper.get('[data-testid="profile-back"]').trigger('click')
    await flushPromises()
    expect(wrapper.find('[data-testid="profile-identity"]').exists()).toBe(true)
  })

  // item 4/7: cada panel anima su entrada — bk-stagger en los de varios
  // hijos, bk-rise (vía Transition) en los de un único hijo
  it('item 4: the hub panel has bk-stagger on its container', async () => {
    wrapper = build()
    await wrapper.vm.$nextTick()

    expect(wrapper.find('.bk-stagger').exists()).toBe(true)
  })

  it('item 4: the library section gets bk-stagger when opened', async () => {
    wrapper = build()
    await flushPromises()

    await openSection(wrapper, 'library')

    expect(wrapper.find('.bk-stagger').exists()).toBe(true)
  })

  it('item 4: the routines section (single child, no stagger) still replays entry via bk-rise', async () => {
    wrapper = build()
    await flushPromises()

    await openSection(wrapper, 'routines')

    // el panel de rutinas no tiene bk-stagger (un único hijo): el contenedor
    // bk-stagger del hub ya no está en el DOM tras abrir la sección
    expect(wrapper.find('.bk-stagger').exists()).toBe(false)
    expect(wrapper.findComponent({ name: 'RoutineList' }).exists()).toBe(true)
  })

  it('shows the admin row when user is admin', async () => {
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

    expect(wrapper.find('[data-testid="profile-link-admin"]').exists()).toBe(true)
    expect(wrapper.text()).toContain('Admin')
  })

  it('hides the admin row when user is not admin', async () => {
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

    expect(wrapper.find('[data-testid="profile-link-admin"]').exists()).toBe(false)
  })

  // C1: cada sección debe montar un control hijo real (no un stub, no solo
  // el título de la sección)
  describe('C1: cada sección monta un control hijo real', () => {
    it('settings section renders the real settings select (locale/units), not a swallowed slot', async () => {
      wrapper = build({ SettingsCard: false })
      await flushPromises()
      await openSection(wrapper, 'settings')

      // BkSelect v2 (round 7): ya no es un <select> nativo, sino un botón
      // role=combobox que abre un listbox propio — mismo test-id en la raíz
      const localeTrigger = wrapper.find('[data-testid="locale-select"] [role="combobox"]')
      expect(localeTrigger.exists()).toBe(true)
      await localeTrigger.trigger('click')
      const options = document.querySelectorAll('[role="option"]')
      expect(Array.from(options).some((o) => o.textContent?.includes('Español'))).toBe(true)
      expect(Array.from(options).some((o) => o.textContent?.includes('English'))).toBe(true)
    })

    it('routines section renders the real RoutineList with its create-routine control', async () => {
      wrapper = build()
      await flushPromises()

      await openSection(wrapper, 'routines')

      const newRoutineBtn = wrapper.findAll('button').find((b) => b.text() === 'Nueva rutina')
      expect(newRoutineBtn).not.toBeUndefined()
    })

    it('library section renders the real ExerciseManager control, not a swallowed slot', async () => {
      wrapper = build()
      await flushPromises()

      await openSection(wrapper, 'library')

      const newExerciseBtn = wrapper.find('[data-testid="new-exercise-btn"]')
      expect(newExerciseBtn.exists()).toBe(true)
      expect(newExerciseBtn.text()).toBe('Nuevo ejercicio')
    })

    it('admin section renders the real admin table with the mocked admin user row', async () => {
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

      await openSection(wrapper, 'admin')

      const table = wrapper.find('table')
      expect(table.exists()).toBe(true)
      const userRow = wrapper.find('[data-testid="user-row-1"]')
      expect(userRow.exists()).toBe(true)
      expect(userRow.text()).toContain('root-admin')
    })
  })

  describe('item 1 (v0.3.2): tab anchored to the URL hash', () => {
    it('mounting with #routines in the hash lands on the routines section (real RoutineList renders)', async () => {
      mockRoute.hash = '#routines'
      wrapper = build()
      await flushPromises()

      const newRoutineBtn = wrapper.findAll('button').find((b) => b.text() === 'Nueva rutina')
      expect(newRoutineBtn).not.toBeUndefined()
      expect(wrapper.find('[data-testid="profile-back"]').exists()).toBe(true)
    })

    it('opening a section calls router.replace with the tab hash (not push — no history spam per tap)', async () => {
      wrapper = build()
      await flushPromises()
      replace.mockClear()

      await openSection(wrapper, 'library')

      expect(replace).toHaveBeenCalledWith({ hash: '#library' })
      expect(push).not.toHaveBeenCalled()
    })

    it('an invalid/junk hash falls back to the default hub', async () => {
      mockRoute.hash = '#not-a-real-tab'
      wrapper = build()
      await flushPromises()

      expect(wrapper.find('[data-testid="profile-identity"]').exists()).toBe(true)
    })

    it('a non-admin loading #admin falls back to the default hub', async () => {
      mockRoute.hash = '#admin'
      // auth.user ya es no-admin por el beforeEach
      wrapper = build()
      await flushPromises()

      expect(wrapper.find('[data-testid="profile-identity"]').exists()).toBe(true)
      expect(wrapper.find('table').exists()).toBe(false)
    })

    it('a hash change after mount (browser back/forward) switches the active section', async () => {
      wrapper = build()
      await flushPromises()
      expect(wrapper.find('[data-testid="profile-identity"]').exists()).toBe(true)

      mockRoute.hash = '#library'
      await flushPromises()

      expect(wrapper.find('[data-testid="open-muscle-groups-btn"]').exists()).toBe(true)
      expect(wrapper.find('[data-testid="profile-identity"]').exists()).toBe(false)
    })
  })

  // v0.5.0 (modelo de scroll único, ver ShellView.vue): la raíz FLUYE contra
  // <main>. facelift: la tira sticky de pestañas murió con el hub — no queda
  // chrome sticky en esta vista; los cambios de sección resetean el scroll
  // de <main> explícitamente (el hash no cambia el path)
  describe('v0.5.0: single-scroll model (flowing panels)', () => {
    it('root flows (no bounded chain) and the old sticky tab strip is gone', async () => {
      wrapper = build()
      await flushPromises()

      expect(wrapper.classes()).not.toContain('h-full')
      expect(wrapper.find('[data-testid="profile-tabs-sticky"]').exists()).toBe(false)
      expect(wrapper.find('[role="tablist"]').exists()).toBe(false)
    })

    it('panels flow: no internal scroll containers left in hub, routines, library or admin', async () => {
      const auth = useAuthStore()
      auth.user = { id: 1, username: 'root-admin', is_admin: true, locale: 'es', units: 'kg', timezone: 'UTC' }
      wrapper = build()
      const w = wrapper
      await flushPromises()

      const panel = w.get('[data-testid="logout-btn"]').element.closest('.bk-stagger')!
      expect(panel.classList.contains('overflow-y-auto')).toBe(false)

      await openSection(w, 'routines')
      expect(w.findComponent({ name: 'RoutineList' }).classes()).not.toContain('overflow-y-auto')
      await w.get('[data-testid="profile-back"]').trigger('click')
      await flushPromises()

      await openSection(w, 'library')
      const exerciseManager = w.findComponent({ name: 'ExerciseManager' })
      expect(exerciseManager.element.closest('.overflow-y-auto')).toBeNull()
      await w.get('[data-testid="profile-back"]').trigger('click')
      await flushPromises()

      await openSection(w, 'admin')
      expect(w.findComponent({ name: 'AdminCard' }).classes()).not.toContain('overflow-y-auto')
    })

    // v0.5.0: el scroll vive en <main> — cambiar de sección lo resetea vía
    // resetMainScroll (los paneles ya no remontan un scroller propio)
    it('opening a section resets <main> scrollTop', async () => {
      const mainEl = document.createElement('main')
      document.body.appendChild(mainEl)

      wrapper = build()
      await flushPromises()

      mainEl.scrollTop = 400
      await openSection(wrapper, 'library')
      expect(mainEl.scrollTop).toBe(0)

      mainEl.remove()
    })
  })

  // v0.9.0 (zurdi: "no me convence el layout de doble tab en biblioteca"):
  // la biblioteca ES el catálogo de ejercicios; los grupos musculares viven
  // en un sheet abierto por un botón — jerarquía primario/secundario
  describe('v0.9.0: library = exercises + muscle-groups sheet', () => {
    afterEach(() => {
      // BkSheet teletransporta a body: limpiar para no heredar sheets huérfanos
      document.body.innerHTML = ''
    })

    it('shows ExerciseManager directly (no sub-selector) with the muscle-groups button; the groups manager is NOT mounted', async () => {
      wrapper = build()
      await flushPromises()
      await openSection(wrapper, 'library')

      expect(wrapper.find('[data-testid="library-section-tabs"]').exists()).toBe(false)
      expect(wrapper.get('[data-testid="new-exercise-btn"]').isVisible()).toBe(true)
      expect(wrapper.findComponent({ name: 'ExerciseManager' }).exists()).toBe(true)
      expect(wrapper.findComponent({ name: 'MuscleGroupManager' }).exists()).toBe(false)
      expect(wrapper.get('[data-testid="open-muscle-groups-btn"]').text()).toBe('Ver grupos musculares')
    })

    it('the muscle-groups button opens a sheet mounting MuscleGroupManager fresh', async () => {
      wrapper = build()
      await flushPromises()
      await openSection(wrapper, 'library')

      await wrapper.get('[data-testid="open-muscle-groups-btn"]').trigger('click')
      await flushPromises()

      expect(wrapper.findComponent({ name: 'MuscleGroupManager' }).exists()).toBe(true)
      // el control de crear grupo vive dentro del sheet, visible
      expect(document.querySelector('[data-testid="open-create-group-btn"]')).not.toBeNull()
    })

    it('mounting with #library in the hash lands on the exercises catalog', async () => {
      mockRoute.hash = '#library'
      wrapper = build()
      await flushPromises()

      expect(wrapper.get('[data-testid="new-exercise-btn"]').isVisible()).toBe(true)
      expect(wrapper.findComponent({ name: 'MuscleGroupManager' }).exists()).toBe(false)
    })
  })
})

import { DOMWrapper, flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { createI18nInstance } from '@/i18n'
import { useAuthStore } from '@/stores/auth'
import RoutineList from '../RoutineList.vue'

vi.mock('@/api/domain', () => ({
  listRoutines: vi.fn(() => Promise.resolve([
    {
      id: 1,
      owner_id: 1,
      name: 'Push Day',
      description: 'Upper body push',
      rune: 'chest',
      color: null,
      is_public: false,
      owner_username: null,
      exercises: [
        { id: 1, exercise_id: 1, position: 0, target_sets: 4, target_reps: 8, target_weight_kg: 80, rest_seconds: 120 },
        { id: 2, exercise_id: 2, position: 1, target_sets: 3, target_reps: 10, target_weight_kg: 60, rest_seconds: 90 },
      ],
    },
    {
      id: 2,
      owner_id: 1,
      name: 'Pull Day',
      description: 'Upper body pull',
      rune: 'back',
      color: null,
      is_public: false,
      owner_username: null,
      exercises: [
        { id: 3, exercise_id: 3, position: 0, target_sets: 4, target_reps: 6, target_weight_kg: 100, rest_seconds: 120 },
      ],
    },
  ])),
  deleteRoutine: vi.fn((id: number) => Promise.resolve(void 0)),
  // W2 feature 2: nuevos endpoints — resueltos en vacío/no-op por defecto,
  // los tests que los ejercitan los sobreescriben con mockResolvedValueOnce
  listRoutineTemplates: vi.fn(() => Promise.resolve([])),
  updateRoutine: vi.fn((id: number, body: unknown) => Promise.resolve({ id, ...(body as object) })),
  copyRoutine: vi.fn((id: number) => Promise.resolve({ id: 99 })),
  globalizeRoutine: vi.fn((id: number) => Promise.resolve({ id, owner_id: null })),
  listExercises: vi.fn(() => Promise.resolve([
    { id: 1, name_es: 'Press de banca', name_en: 'Bench Press', measurement: 'strength', owner_id: null, muscle_groups: [] },
    { id: 2, name_es: 'Aperturas', name_en: 'Flyes', measurement: 'strength', owner_id: null, muscle_groups: [] },
    { id: 3, name_es: 'Dominadas', name_en: 'Pull-ups', measurement: 'strength', owner_id: null, muscle_groups: [] },
  ])),
}))

describe('RoutineList', () => {
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
    return mount(RoutineList, {
      global: {
        plugins: [createI18nInstance()],
        stubs: {
          BkRune: true,
          RoutineEditorSheet: true,
        },
      },
    })
  }

  // W2 feature 2: el sheet de confirmación de "globalizar" usa BkSheet de
  // verdad (no stubeado, a diferencia de RoutineEditorSheet) — su contenido
  // viaja a <Teleport to="body">, así que hace falta montar sobre
  // document.body y consultar ahí (mismo patrón que library.spec.ts)
  let mountedWrappers: VueWrapper[] = []

  function buildAttached() {
    const wrapper = mount(RoutineList, {
      global: {
        plugins: [createI18nInstance()],
        stubs: {
          BkRune: true,
          RoutineEditorSheet: true,
        },
      },
      attachTo: document.body,
    })
    mountedWrappers.push(wrapper)
    return wrapper
  }

  function byTestId(id: string): DOMWrapper<Element> {
    return new DOMWrapper(document.body.querySelector(`[data-testid="${id}"]`) as Element | null)
  }

  afterEach(() => {
    mountedWrappers.forEach((wrapper) => wrapper.unmount())
    mountedWrappers = []
  })

  it('item 7: has no "Rutinas" heading, and the new-routine button sits alone at the left edge of its row, opening the editor in create mode', async () => {
    const wrapper = build()
    await wrapper.vm.$nextTick()
    await new Promise(resolve => setTimeout(resolve, 50))
    await wrapper.vm.$nextTick()

    // W2 feature 2: la sección "Plantillas" SÍ tiene su propio <h2> (BkCard
    // title) — lo que sigue sin llevar heading es la lista de rutinas
    // propias en sí, así que se comprueba que ningún h2 diga "Rutinas"
    expect(wrapper.findAll('h2').some((h) => h.text() === 'Rutinas')).toBe(false)
    expect(wrapper.text()).not.toContain('Rutinas')

    const button = wrapper.get('[data-testid="new-routine-btn"]')
    // única hija de su fila: nada a la izquierda que la empuje
    expect(button.element.parentElement?.children).toHaveLength(1)

    const editor = wrapper.findComponent({ name: 'RoutineEditorSheet' })
    expect(editor.props('open')).toBe(false)
    await button.trigger('click')
    await wrapper.vm.$nextTick()

    expect(editor.props('open')).toBe(true)
    expect(editor.props('routine')).toBeUndefined()
  })

  it('displays routines after loading', async () => {
    const wrapper = build()
    await wrapper.vm.$nextTick()

    // Wait for routines to load
    await new Promise(resolve => setTimeout(resolve, 50))
    await wrapper.vm.$nextTick()

    const cards = wrapper.findAll('.p-4.border')
    expect(cards.length).toBeGreaterThan(0)
  })

  it('shows routine name and exercise count', async () => {
    const wrapper = build()
    await wrapper.vm.$nextTick()

    await new Promise(resolve => setTimeout(resolve, 50))
    await wrapper.vm.$nextTick()

    const firstCard = wrapper.find('.p-4.border')
    expect(firstCard.text()).toContain('Push Day')
    expect(firstCard.text()).toContain('2')
  })

  it('opens editor when edit button clicked', async () => {
    // item 3 (round 9): BkActionBtn icon-only, localizado por data-testid
    // en vez de por el texto "Editar" que ya no existe en el botón
    const wrapper = build()
    await wrapper.vm.$nextTick()

    await new Promise(resolve => setTimeout(resolve, 50))
    await wrapper.vm.$nextTick()

    const editor = wrapper.findComponent({ name: 'RoutineEditorSheet' })
    expect(editor.props('open')).toBe(false)

    const editBtn = wrapper.find('[data-testid="edit-routine-1"]')
    expect(editBtn.exists()).toBe(true)
    await editBtn.trigger('click')
    await wrapper.vm.$nextTick()

    expect(editor.props('open')).toBe(true)
  })

  it('deletes routine when confirm clicked after delete prompt', async () => {
    const { deleteRoutine } = await import('@/api/domain')
    vi.mocked(deleteRoutine).mockClear()

    const wrapper = build()
    await wrapper.vm.$nextTick()

    await new Promise(resolve => setTimeout(resolve, 50))
    await wrapper.vm.$nextTick()

    // Click delete (icon-only BkActionBtn) on first routine
    const deleteBtn = wrapper.find('[data-testid="delete-routine-1"]')
    expect(deleteBtn.exists()).toBe(true)
    await deleteBtn.trigger('click')
    await wrapper.vm.$nextTick()

    // Confirm delete is now showing
    const confirmBtn = wrapper.findAll('button').find(el => {
      const text = (el.element as HTMLButtonElement).textContent || ''
      return text === 'Confirmar'
    })
    expect(confirmBtn).toBeTruthy()

    // Click confirm
    await confirmBtn!.trigger('click')
    await wrapper.vm.$nextTick()

    // Assert deleteRoutine was called with correct id
    expect(deleteRoutine).toHaveBeenCalledWith(1)
  })

  it('cancels delete and does not call deleteRoutine', async () => {
    const { deleteRoutine } = await import('@/api/domain')
    vi.mocked(deleteRoutine).mockClear()

    const wrapper = build()
    await wrapper.vm.$nextTick()

    await new Promise(resolve => setTimeout(resolve, 50))
    await wrapper.vm.$nextTick()

    // Click delete (icon-only BkActionBtn)
    const deleteBtn = wrapper.find('[data-testid="delete-routine-1"]')
    await deleteBtn.trigger('click')
    await wrapper.vm.$nextTick()

    // Click cancel
    const cancelBtn = wrapper.findAll('button').find(el => {
      const text = (el.element as HTMLButtonElement).textContent || ''
      return text === 'Cancelar'
    })
    await cancelBtn!.trigger('click')
    await wrapper.vm.$nextTick()

    // Assert deleteRoutine was not called
    expect(deleteRoutine).not.toHaveBeenCalled()

    // Verify delete button is shown again (not confirming state)
    const deleteBtnAfter = wrapper.find('[data-testid="delete-routine-1"]')
    expect(deleteBtnAfter.exists()).toBe(true)
  })

  it('item 3: edit/delete render as icon-only BkActionBtn with the correct icon and accessible label', async () => {
    const wrapper = build()
    await wrapper.vm.$nextTick()
    await new Promise(resolve => setTimeout(resolve, 50))
    await wrapper.vm.$nextTick()

    const editBtn = wrapper.get('[data-testid="edit-routine-1"]')
    expect(editBtn.attributes('aria-label')).toBe('Editar')
    expect(editBtn.find('svg').exists()).toBe(true)

    const deleteBtn = wrapper.get('[data-testid="delete-routine-1"]')
    expect(deleteBtn.attributes('aria-label')).toBe('Borrar')
    expect(deleteBtn.classes()).toContain('text-danger')
  })

  it('renders the rune icon only for a valid RuneName slug, guarding against invalid/legacy seed values', async () => {
    const { listRoutines } = await import('@/api/domain')
    vi.mocked(listRoutines).mockResolvedValueOnce([
      { id: 1, name: 'Valid Rune Routine', description: null, rune: 'chest', color: null, exercises: [] },
      { id: 2, name: 'Legacy Rune Routine', description: null, rune: 'ᚦ', color: null, exercises: [] },
    ] as never)

    const wrapper = build()
    await wrapper.vm.$nextTick()

    await new Promise(resolve => setTimeout(resolve, 50))
    await wrapper.vm.$nextTick()

    // W2 feature 2: scoped a la lista de rutinas PROPIAS — la sección
    // Plantillas (vacía en este test) también renderiza un BkRune por
    // defecto dentro de su BkEmpty, que no es lo que este test comprueba
    const ownList = wrapper.get('.grid.gap-3')
    const runes = ownList.findAllComponents({ name: 'BkRune' })
    expect(runes.length).toBe(1)
    expect(runes[0].props('name')).toBe('chest')
  })

  it('shows empty state when no routines', async () => {
    const { listRoutines } = await import('@/api/domain')
    vi.mocked(listRoutines).mockResolvedValueOnce([])

    const wrapper = build()
    await wrapper.vm.$nextTick()

    await new Promise(resolve => setTimeout(resolve, 50))
    await wrapper.vm.$nextTick()

    // Should show empty message
    const text = wrapper.text()
    expect(text).toContain('Sin rutinas aún')
  })

  it('item 10: the create-routine button moves into the empty state (only one instance, opens the editor)', async () => {
    const { listRoutines } = await import('@/api/domain')
    vi.mocked(listRoutines).mockResolvedValueOnce([])

    const wrapper = build()
    await wrapper.vm.$nextTick()
    await new Promise(resolve => setTimeout(resolve, 50))
    await wrapper.vm.$nextTick()

    // un único botón "Nueva rutina" en todo el árbol (no duplicado arriba)
    const buttons = wrapper.findAll('[data-testid="new-routine-btn"]')
    expect(buttons).toHaveLength(1)

    const editor = wrapper.findComponent({ name: 'RoutineEditorSheet' })
    expect(editor.props('open')).toBe(false)
    await buttons[0].trigger('click')
    await wrapper.vm.$nextTick()
    expect(editor.props('open')).toBe(true)
  })

  it('item 9: omits the reps entirely (no en-dash filler) when a routine exercise has no target reps', async () => {
    const { listRoutines } = await import('@/api/domain')
    vi.mocked(listRoutines).mockResolvedValueOnce([
      {
        id: 1, name: 'Plancha día', description: null, rune: null, color: null,
        exercises: [
          { id: 1, exercise_id: 1, position: 0, target_sets: 3, target_reps: null, target_weight_kg: null, rest_seconds: null },
        ],
      },
    ] as never)

    const wrapper = build()
    await wrapper.vm.$nextTick()
    await new Promise(resolve => setTimeout(resolve, 50))
    await wrapper.vm.$nextTick()

    await wrapper.get('[data-testid="toggle-routine-1"]').trigger('click')
    await wrapper.vm.$nextTick()

    const list = wrapper.get('[data-testid="exercise-list-1"]')
    expect(list.text()).not.toContain('–')
    expect(list.text()).not.toContain('—')
    expect(list.text()).toContain('3')
    expect(list.text()).not.toContain('×')
  })

  it('item 7: the confirm/cancel row is wrapped in the bk-pop-soft transition', async () => {
    const wrapper = build()
    await wrapper.vm.$nextTick()
    await new Promise(resolve => setTimeout(resolve, 50))
    await wrapper.vm.$nextTick()

    await wrapper.get('[data-testid="delete-routine-1"]').trigger('click')
    await wrapper.vm.$nextTick()

    // VTU auto-stubbea <Transition> como <transition-stub name="...">
    // (ver memoria del repo): basta para una aserción estructural, sin
    // necesidad de desactivar el stub para probar timing de animación
    const transitionStub = wrapper.find('transition-stub[name="bk-pop-soft"]')
    expect(transitionStub.exists()).toBe(true)
    expect(transitionStub.text()).toContain('Confirmar')
  })

  describe('expandable exercise list (side-quest 1 follow-up)', () => {
    async function buildReady() {
      const wrapper = build()
      await wrapper.vm.$nextTick()
      await new Promise(resolve => setTimeout(resolve, 50))
      await wrapper.vm.$nextTick()
      return wrapper
    }

    it('is collapsed by default: aria-expanded is false and no exercise list renders', async () => {
      const wrapper = await buildReady()

      const toggle = wrapper.get('[data-testid="toggle-routine-1"]')
      expect(toggle.attributes('aria-expanded')).toBe('false')
      expect(wrapper.find('[data-testid="exercise-list-1"]').exists()).toBe(false)
    })

    it('clicking the card body reveals the exercise list with resolved names, sets×reps, weight and rest', async () => {
      const wrapper = await buildReady()

      await wrapper.get('[data-testid="toggle-routine-1"]').trigger('click')
      await wrapper.vm.$nextTick()

      const toggle = wrapper.get('[data-testid="toggle-routine-1"]')
      expect(toggle.attributes('aria-expanded')).toBe('true')

      const list = wrapper.get('[data-testid="exercise-list-1"]')
      expect(list.text()).toContain('Press de banca')
      expect(list.text()).toContain('4×8')
      expect(list.text()).toContain('120s')
    })

    it('clicking the card body a second time collapses the exercise list again', async () => {
      const wrapper = await buildReady()

      const toggle = wrapper.get('[data-testid="toggle-routine-1"]')
      await toggle.trigger('click')
      await wrapper.vm.$nextTick()
      expect(wrapper.find('[data-testid="exercise-list-1"]').exists()).toBe(true)

      await toggle.trigger('click')
      await wrapper.vm.$nextTick()

      expect(wrapper.find('[data-testid="exercise-list-1"]').exists()).toBe(false)
      expect(wrapper.get('[data-testid="toggle-routine-1"]').attributes('aria-expanded')).toBe('false')
    })

    it('clicking the edit button does NOT toggle the exercise list expansion', async () => {
      const wrapper = await buildReady()

      await wrapper.get('[data-testid="edit-routine-1"]').trigger('click')
      await wrapper.vm.$nextTick()

      expect(wrapper.get('[data-testid="toggle-routine-1"]').attributes('aria-expanded')).toBe('false')
      expect(wrapper.find('[data-testid="exercise-list-1"]').exists()).toBe(false)
    })
  })

  it('gates the list on readiness: neither the list nor the empty state show while listRoutines is pending, both possibilities appear once it resolves', async () => {
    const { listRoutines } = await import('@/api/domain')
    let resolveList: (value: never) => void = () => {}
    vi.mocked(listRoutines).mockImplementationOnce(() => new Promise((resolve) => { resolveList = resolve }))

    const wrapper = build()
    await wrapper.vm.$nextTick()

    // pendiente: ni la lista (grid) ni el mensaje vacío deben estar en el DOM
    expect(wrapper.find('.grid.gap-3').exists()).toBe(false)
    expect(wrapper.text()).not.toContain('Sin rutinas aún')

    resolveList([] as never)
    await new Promise(resolve => setTimeout(resolve, 0))
    await wrapper.vm.$nextTick()

    // resuelto (vacío en este caso): ahora sí aparece el mensaje
    expect(wrapper.text()).toContain('Sin rutinas aún')
  })

  describe('W2 feature 2: templates section', () => {
    async function buildReady() {
      const wrapper = build()
      await wrapper.vm.$nextTick()
      await new Promise(resolve => setTimeout(resolve, 50))
      await wrapper.vm.$nextTick()
      return wrapper
    }

    it('shows the empty-templates message when there are none', async () => {
      const wrapper = await buildReady()

      const section = wrapper.get('[data-testid="templates-section"]')
      expect(section.text()).toContain('Sin plantillas disponibles')
    })

    it('renders a GLOBAL template (owner_username null) with the "Global" attribution badge, and a public template from another user with a username hint', async () => {
      const { listRoutineTemplates } = await import('@/api/domain')
      vi.mocked(listRoutineTemplates).mockResolvedValueOnce([
        {
          id: 10, owner_id: null, name: 'Plantilla admin', description: null, rune: null, color: null,
          is_public: false, owner_username: null, exercises: [],
        },
        {
          id: 11, owner_id: 9, name: 'Rutina de Freyja', description: null, rune: null, color: null,
          is_public: true, owner_username: 'freyja', exercises: [],
        },
      ] as never)

      const wrapper = await buildReady()

      const section = wrapper.get('[data-testid="templates-section"]')
      expect(section.text()).toContain('Plantilla admin')
      expect(section.get('[data-testid="template-attribution-10"]').text()).toBe('Global')
      expect(section.text()).toContain('Rutina de Freyja')
      expect(section.get('[data-testid="template-attribution-11"]').text()).toContain('freyja')
    })

    it('clicking the copy button copies the template and reloads the lists', async () => {
      const { listRoutineTemplates, copyRoutine, listRoutines } = await import('@/api/domain')
      vi.mocked(listRoutineTemplates).mockResolvedValue([
        {
          id: 10, owner_id: null, name: 'Plantilla admin', description: null, rune: null, color: null,
          is_public: false, owner_username: null, exercises: [],
        },
      ] as never)
      vi.mocked(copyRoutine).mockClear()
      vi.mocked(listRoutines).mockClear()

      const wrapper = await buildReady()
      const callsBeforeCopy = vi.mocked(listRoutines).mock.calls.length

      await wrapper.get('[data-testid="copy-template-10"]').trigger('click')
      await flushPromises()

      expect(copyRoutine).toHaveBeenCalledWith(10)
      // recarga tras copiar: mis rutinas se vuelven a pedir para reflejar la copia
      expect(vi.mocked(listRoutines).mock.calls.length).toBeGreaterThan(callsBeforeCopy)
    })

    it('the copy action renders an icon-only BkActionBtn with icon="copy"', async () => {
      const { listRoutineTemplates } = await import('@/api/domain')
      vi.mocked(listRoutineTemplates).mockResolvedValueOnce([
        {
          id: 10, owner_id: null, name: 'Plantilla admin', description: null, rune: null, color: null,
          is_public: false, owner_username: null, exercises: [],
        },
      ] as never)

      const wrapper = await buildReady()

      const copyBtn = wrapper.get('[data-testid="copy-template-10"]')
      expect(copyBtn.attributes('aria-label')).toBe('Copiar')
      expect(copyBtn.find('svg').findAll('rect')).toHaveLength(2)
    })

    it('a template card expands to reveal its exercises, same as an own routine card', async () => {
      const { listRoutineTemplates } = await import('@/api/domain')
      vi.mocked(listRoutineTemplates).mockResolvedValueOnce([
        {
          id: 10, owner_id: null, name: 'Plantilla admin', description: null, rune: null, color: null,
          is_public: false, owner_username: null,
          exercises: [
            { id: 1, exercise_id: 1, position: 0, target_sets: 4, target_reps: 8, target_weight_kg: 80, rest_seconds: 120 },
          ],
        },
      ] as never)

      const wrapper = await buildReady()

      expect(wrapper.find('[data-testid="exercise-list-template-10"]').exists()).toBe(false)
      await wrapper.get('[data-testid="toggle-template-10"]').trigger('click')
      await wrapper.vm.$nextTick()

      const list = wrapper.get('[data-testid="exercise-list-template-10"]')
      expect(list.text()).toContain('Press de banca')
      expect(list.text()).toContain('4×8')
    })
  })

  describe('W2 feature 2: "Visible para todos" toggle on own routine card', () => {
    async function buildReady() {
      const wrapper = build()
      await wrapper.vm.$nextTick()
      await new Promise(resolve => setTimeout(resolve, 50))
      await wrapper.vm.$nextTick()
      return wrapper
    }

    it('reflects the routine\'s is_public via aria-pressed, off by default (fixture is_public: false)', async () => {
      const wrapper = await buildReady()

      const toggle = wrapper.get('[data-testid="toggle-public-routine-1"]')
      expect(toggle.attributes('aria-pressed')).toBe('false')
      expect(toggle.attributes('aria-label')).toBe('Visible para todos')
    })

    it('clicking it PATCHes is_public to true and reloads', async () => {
      const { updateRoutine, listRoutines } = await import('@/api/domain')
      vi.mocked(updateRoutine).mockClear()
      vi.mocked(listRoutines).mockClear()

      const wrapper = await buildReady()
      const callsBefore = vi.mocked(listRoutines).mock.calls.length

      await wrapper.get('[data-testid="toggle-public-routine-1"]').trigger('click')
      await flushPromises()

      expect(updateRoutine).toHaveBeenCalledWith(1, { is_public: true })
      expect(vi.mocked(listRoutines).mock.calls.length).toBeGreaterThan(callsBefore)
    })
  })

  describe('W2 feature 2: admin-only "globalize" control', () => {
    async function buildReadyAsAdmin() {
      const auth = useAuthStore()
      auth.user = { id: 1, username: 'admin', is_admin: true, locale: 'es', units: 'kg', timezone: 'UTC' }
      const wrapper = buildAttached()
      await wrapper.vm.$nextTick()
      await new Promise(resolve => setTimeout(resolve, 50))
      await wrapper.vm.$nextTick()
      return wrapper
    }

    it('is hidden for a non-admin user', async () => {
      const wrapper = build()
      await wrapper.vm.$nextTick()
      await new Promise(resolve => setTimeout(resolve, 50))
      await wrapper.vm.$nextTick()

      expect(wrapper.find('[data-testid="globalize-routine-1"]').exists()).toBe(false)
    })

    it('opens a confirm sheet for an admin, and confirming calls globalizeRoutine then reloads', async () => {
      const { globalizeRoutine, listRoutines } = await import('@/api/domain')
      vi.mocked(globalizeRoutine).mockClear()
      vi.mocked(listRoutines).mockClear()

      const wrapper = await buildReadyAsAdmin()
      const callsBefore = vi.mocked(listRoutines).mock.calls.length

      const control = wrapper.get('[data-testid="globalize-routine-1"]')
      expect(control.attributes('aria-label')).toBe('Convertir en global')
      await control.trigger('click')
      await wrapper.vm.$nextTick()

      expect(byTestId('globalize-confirm-sheet').exists()).toBe(true)

      await byTestId('globalize-confirm-btn').trigger('click')
      await flushPromises()

      expect(globalizeRoutine).toHaveBeenCalledWith(1)
      expect(vi.mocked(listRoutines).mock.calls.length).toBeGreaterThan(callsBefore)
    })

    it('cancelling the confirm sheet does not call globalizeRoutine', async () => {
      const { globalizeRoutine } = await import('@/api/domain')
      vi.mocked(globalizeRoutine).mockClear()

      const wrapper = await buildReadyAsAdmin()

      await wrapper.get('[data-testid="globalize-routine-1"]').trigger('click')
      await wrapper.vm.$nextTick()
      await byTestId('globalize-cancel-btn').trigger('click')
      await wrapper.vm.$nextTick()

      expect(byTestId('globalize-confirm-sheet').exists()).toBe(false)
      expect(globalizeRoutine).not.toHaveBeenCalled()
    })
  })
})

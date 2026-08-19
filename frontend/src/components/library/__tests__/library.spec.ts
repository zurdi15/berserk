import { DOMWrapper, flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { createI18nInstance } from '@/i18n'
import { useAuthStore } from '@/stores/auth'
import ExerciseManager from '../ExerciseManager.vue'
import MuscleGroupManager from '../MuscleGroupManager.vue'

vi.mock('@/api/domain', () => ({
  listExercises: vi.fn(),
  createExercise: vi.fn(),
  updateExercise: vi.fn(),
  deleteExercise: vi.fn(),
  listMuscleGroups: vi.fn(),
  createMuscleGroup: vi.fn(),
  updateMuscleGroup: vi.fn(),
  deleteMuscleGroup: vi.fn(),
}))

function setUser(overrides: Partial<{ id: number; is_admin: boolean }> = {}) {
  const auth = useAuthStore()
  auth.user = {
    id: overrides.id ?? 7,
    username: 'thor',
    is_admin: overrides.is_admin ?? false,
    locale: 'es',
    units: 'kg',
    timezone: 'UTC',
  }
}

// BkSheet usa <Teleport to="body">: su contenido vive fuera del árbol del
// wrapper, así que hay que montar sobre document.body, buscar ahí dentro
// (wrapper.find no ve nodos teletransportados) y desmontar tras cada
// prueba para que el body no arrastre contenido de la prueba anterior.
let mountedWrappers: VueWrapper[] = []

function byTestId(id: string): DOMWrapper<Element> {
  return new DOMWrapper(document.body.querySelector(`[data-testid="${id}"]`) as Element | null)
}

function buildExerciseManager() {
  const wrapper = mount(ExerciseManager, {
    global: { plugins: [createI18nInstance()] },
    attachTo: document.body,
  })
  mountedWrappers.push(wrapper)
  return wrapper
}

function buildMuscleGroupManager() {
  const wrapper = mount(MuscleGroupManager, {
    global: { plugins: [createI18nInstance()] },
    attachTo: document.body,
  })
  mountedWrappers.push(wrapper)
  return wrapper
}

afterEach(() => {
  mountedWrappers.forEach((wrapper) => wrapper.unmount())
  mountedWrappers = []
})

describe('ExerciseManager', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    setUser()
  })

  it('UNIFIED-LISTINGS: renders own exercises AND catalog rows in the SAME list (no separate/collapsed catalog section)', async () => {
    const { listExercises, listMuscleGroups } = await import('@/api/domain')
    vi.mocked(listExercises).mockResolvedValue([
      { id: 1, name_es: 'Press banca', name_en: 'Bench press', measurement: 'strength', owner_id: null, muscle_groups: [] },
      { id: 12, name_es: 'Press Arnold', name_en: 'Arnold press', measurement: 'strength', owner_id: 7, muscle_groups: [{ muscle_group_id: 1, is_primary: true }] },
    ] as never)
    vi.mocked(listMuscleGroups).mockResolvedValue([] as never)

    const wrapper = buildExerciseManager()
    await flushPromises()

    expect(wrapper.text()).toContain('Press Arnold')
    // antes de la unificación esto vivía oculto tras un toggle "Catálogo" —
    // ahora aparece directamente, sin ninguna interacción previa
    expect(wrapper.text()).toContain('Press banca')
    expect(wrapper.find('[data-testid="exercise-row-12"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="catalog-exercise-row-1"]').exists()).toBe(true)
  })

  it('UNIFIED-LISTINGS: sorts the list mine first, then the predefined catalog, then others\' public exercises', async () => {
    const { listExercises, listMuscleGroups } = await import('@/api/domain')
    vi.mocked(listExercises).mockResolvedValue([
      { id: 40, name_es: 'Zancadas de Loki', name_en: 'Loki lunges', measurement: 'strength', owner_id: 9, is_public: true, owner_username: 'loki', muscle_groups: [] },
      { id: 1, name_es: 'Press banca', name_en: 'Bench press', measurement: 'strength', owner_id: null, muscle_groups: [] },
      { id: 12, name_es: 'Press Arnold', name_en: 'Arnold press', measurement: 'strength', owner_id: 7, muscle_groups: [] },
    ] as never)
    vi.mocked(listMuscleGroups).mockResolvedValue([] as never)

    const wrapper = buildExerciseManager()
    await flushPromises()

    const testids = wrapper.findAll('[data-testid^="exercise-row-"], [data-testid^="catalog-exercise-row-"]')
      .map((row) => row.attributes('data-testid'))
    expect(testids).toEqual(['exercise-row-12', 'catalog-exercise-row-1', 'catalog-exercise-row-40'])
  })

  it('item 6: shows a rune+name tag for the primary muscle group on own AND catalog rows', async () => {
    const { listExercises, listMuscleGroups } = await import('@/api/domain')
    vi.mocked(listExercises).mockResolvedValue([
      { id: 1, name_es: 'Press banca', name_en: 'Bench press', measurement: 'strength', owner_id: null, muscle_groups: [{ muscle_group_id: 1, is_primary: true }] },
      { id: 12, name_es: 'Press Arnold', name_en: 'Arnold press', measurement: 'strength', owner_id: 7, muscle_groups: [{ muscle_group_id: 2, is_primary: true }] },
    ] as never)
    vi.mocked(listMuscleGroups).mockResolvedValue([
      { id: 1, slug: 'chest', name_es: 'Pecho', name_en: 'Chest', owner_id: null },
      { id: 2, slug: 'shoulders', name_es: 'Hombros', name_en: 'Shoulders', owner_id: null },
    ] as never)

    const wrapper = buildExerciseManager()
    await flushPromises()

    const ownTag = wrapper.get('[data-testid="exercise-group-tag-12"]')
    expect(ownTag.text()).toContain('Hombros')
    expect(ownTag.findComponent({ name: 'BkRune' }).props('name')).toBe('shoulders')

    // catálogo visible sin interacción previa (unificado, no colapsado)
    const catalogTag = wrapper.get('[data-testid="exercise-group-tag-1"]')
    expect(catalogTag.text()).toContain('Pecho')
    expect(catalogTag.findComponent({ name: 'BkRune' }).props('name')).toBe('chest')
  })

  it('item 6: renders no tag (and no crash) for an exercise without a primary muscle group', async () => {
    const { listExercises, listMuscleGroups } = await import('@/api/domain')
    vi.mocked(listExercises).mockResolvedValue([
      { id: 12, name_es: 'Press Arnold', name_en: 'Arnold press', measurement: 'strength', owner_id: 7, muscle_groups: [] },
    ] as never)
    vi.mocked(listMuscleGroups).mockResolvedValue([] as never)

    const wrapper = buildExerciseManager()
    await flushPromises()

    expect(wrapper.find('[data-testid="exercise-group-tag-12"]').exists()).toBe(false)
  })

  // item 2/3 (v0.4.3, zurdi): el gate-a-blanco se reemplaza por un esqueleto
  // shimmer mientras carga (mismo hueco que las filas reales) — ya no
  // "nada", y al resolver se intercambia limpiamente por la lista real.
  it('gates the list on readiness: the skeleton shows while pending (no rows, no empty state), the loaded rows appear once resolved', async () => {
    const { listExercises, listMuscleGroups } = await import('@/api/domain')
    let resolveExercises: (value: never) => void = () => {}
    vi.mocked(listExercises).mockImplementationOnce(() => new Promise((resolve) => { resolveExercises = resolve }))
    vi.mocked(listMuscleGroups).mockResolvedValue([] as never)

    const wrapper = buildExerciseManager()
    await flushPromises()

    // pendiente: esqueleto presente, ni una fila de ejercicio propio ni el mensaje vacío
    expect(wrapper.find('[data-testid="exercise-list-skeleton"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid^="exercise-row-"]').exists()).toBe(false)
    expect(wrapper.text()).not.toContain('Sin ejercicios aún')

    resolveExercises([
      { id: 12, name_es: 'Press Arnold', name_en: 'Arnold press', measurement: 'strength', owner_id: 7, muscle_groups: [] },
    ] as never)
    await flushPromises()

    expect(wrapper.find('[data-testid="exercise-list-skeleton"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="exercise-row-12"]').exists()).toBe(true)
  })

  it('creates an exercise from the form with the checked muscle group marked primary', async () => {
    const { listExercises, listMuscleGroups, createExercise } = await import('@/api/domain')
    vi.mocked(listExercises).mockResolvedValue([] as never)
    vi.mocked(listMuscleGroups).mockResolvedValue([
      { id: 1, slug: 'pecho', name_es: 'Pecho', name_en: 'Chest', owner_id: null },
      { id: 2, slug: 'espalda', name_es: 'Espalda', name_en: 'Back', owner_id: null },
    ] as never)
    vi.mocked(createExercise).mockResolvedValue({
      id: 20, name_es: 'Press Arnold', name_en: 'Arnold press', measurement: 'strength', owner_id: 7,
      muscle_groups: [{ muscle_group_id: 1, is_primary: true }],
    } as never)

    const wrapper = buildExerciseManager()
    await flushPromises()

    await wrapper.find('[data-testid="new-exercise-btn"]').trigger('click')
    await flushPromises()

    await byTestId('exercise-name-es-field').find('input').setValue('Press Arnold')
    await byTestId('exercise-name-en-field').find('input').setValue('Arnold press')

    // BkSelect v2 (round 7): listbox propio, no <select> nativo
    await byTestId('exercise-measurement-select').find('[role="combobox"]').trigger('click')
    const strengthOption = Array.from(document.querySelectorAll('[role="option"]'))
      .find((o) => o.textContent?.trim() === 'Fuerza') as HTMLElement
    expect(strengthOption).not.toBeUndefined()
    strengthOption.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await flushPromises()

    // facelift v4: controles propios (BkCheck/BkRadio) — se accionan con click
    await byTestId('muscle-group-checkbox-1').trigger('click')
    await flushPromises()
    await byTestId('muscle-group-primary-1').trigger('click')

    await byTestId('save-exercise-btn').trigger('click')
    await flushPromises()

    // v0.20.x: sin flags de visibilidad — todos los ejercicios son globales
    expect(createExercise).toHaveBeenCalledWith({
      name_es: 'Press Arnold',
      name_en: 'Arnold press',
      measurement: 'strength',
      muscle_groups: [{ muscle_group_id: 1, is_primary: true }],
    })
  })

  it('v0.20.x: the visibility select is GONE — every exercise is global catalog now', async () => {
    const { listExercises, listMuscleGroups } = await import('@/api/domain')
    vi.mocked(listExercises).mockResolvedValue([] as never)
    vi.mocked(listMuscleGroups).mockResolvedValue([] as never)
    setUser({ is_admin: true })

    const wrapper = buildExerciseManager()
    await flushPromises()
    await wrapper.find('[data-testid="new-exercise-btn"]').trigger('click')
    await flushPromises()

    expect(byTestId('exercise-visibility-select').exists()).toBe(false)
  })

  it('UNIFIED-LISTINGS: a PUBLIC exercise from another user renders inline with a BkUser attribution, unusable for edit/delete even by an admin', async () => {
    const { listExercises, listMuscleGroups } = await import('@/api/domain')
    vi.mocked(listExercises).mockResolvedValue([
      {
        id: 40, name_es: 'Zancadas de Loki', name_en: 'Loki lunges', measurement: 'strength', owner_id: 9,
        is_public: true, owner_username: 'loki', muscle_groups: [],
      },
    ] as never)
    vi.mocked(listMuscleGroups).mockResolvedValue([] as never)
    setUser({ id: 7, is_admin: true })

    const wrapper = buildExerciseManager()
    await flushPromises()

    // no aparece en "mis ejercicios" (owner_id 9 !== 7)
    expect(wrapper.find('[data-testid="exercise-row-40"]').exists()).toBe(false)

    // visible sin ninguna interacción previa (unificado, no colapsado)
    const row = wrapper.get('[data-testid="catalog-exercise-row-40"]')
    expect(row.text()).toContain('Zancadas de Loki')
    const attribution = row.get('[data-testid="exercise-attribution-40"]')
    expect(attribution.text()).toContain('loki')
    expect(attribution.findComponent({ name: 'BkUser' }).exists()).toBe(true)
    // ni siquiera un admin puede editar/borrar lo público de OTRO usuario
    expect(row.find('[data-testid="edit-exercise-40"]').exists()).toBe(false)
    expect(row.find('[data-testid="delete-exercise-40"]').exists()).toBe(false)
  })

  it('UNIFIED-LISTINGS: the predefined catalog (owner_id null) rows carry a "Catálogo predefinido" attribution chip, not a BkUser', async () => {
    const { listExercises, listMuscleGroups } = await import('@/api/domain')
    vi.mocked(listExercises).mockResolvedValue([
      {
        id: 1, name_es: 'Press banca', name_en: 'Bench press', measurement: 'strength', owner_id: null,
        is_public: false, owner_username: null, muscle_groups: [],
      },
    ] as never)
    vi.mocked(listMuscleGroups).mockResolvedValue([] as never)

    const wrapper = buildExerciseManager()
    await flushPromises()

    const attribution = wrapper.get('[data-testid="exercise-attribution-1"]')
    expect(attribution.text()).toBe('Catálogo predefinido')
    expect(attribution.findComponent({ name: 'BkUser' }).exists()).toBe(false)
  })

  it('UNIFIED-LISTINGS: own exercises never carry an attribution element', async () => {
    const { listExercises, listMuscleGroups } = await import('@/api/domain')
    vi.mocked(listExercises).mockResolvedValue([
      { id: 12, name_es: 'Press Arnold', name_en: 'Arnold press', measurement: 'strength', owner_id: 7, muscle_groups: [] },
    ] as never)
    vi.mocked(listMuscleGroups).mockResolvedValue([] as never)

    const wrapper = buildExerciseManager()
    await flushPromises()

    expect(wrapper.find('[data-testid="exercise-attribution-12"]').exists()).toBe(false)
  })

  it('delete click-through opens the confirm sheet and confirming calls deleteExercise', async () => {
    const { listExercises, listMuscleGroups, deleteExercise } = await import('@/api/domain')
    vi.mocked(listExercises).mockResolvedValue([
      { id: 12, name_es: 'Press Arnold', name_en: 'Arnold press', measurement: 'strength', owner_id: 7, muscle_groups: [] },
    ] as never)
    vi.mocked(listMuscleGroups).mockResolvedValue([] as never)
    vi.mocked(deleteExercise).mockResolvedValue(undefined as never)

    const wrapper = buildExerciseManager()
    await flushPromises()

    await wrapper.find('[data-testid="delete-exercise-12"]').trigger('click')
    await flushPromises()

    expect(byTestId('delete-exercise-confirm-sheet').exists()).toBe(true)

    await byTestId('delete-exercise-confirm-btn').trigger('click')
    await flushPromises()

    expect(deleteExercise).toHaveBeenCalledWith(12)
  })

  it('item 1: edit/delete render as icon-only BkActionBtn with the correct icon and accessible label', async () => {
    const { listExercises, listMuscleGroups } = await import('@/api/domain')
    vi.mocked(listExercises).mockResolvedValue([
      { id: 12, name_es: 'Press Arnold', name_en: 'Arnold press', measurement: 'strength', owner_id: 7, muscle_groups: [] },
    ] as never)
    vi.mocked(listMuscleGroups).mockResolvedValue([] as never)

    const wrapper = buildExerciseManager()
    await flushPromises()

    const editBtn = wrapper.get('[data-testid="edit-exercise-12"]')
    expect(editBtn.attributes('aria-label')).toBe('Editar')
    expect(editBtn.find('svg').exists()).toBe(true)

    const deleteBtn = wrapper.get('[data-testid="delete-exercise-12"]')
    expect(deleteBtn.attributes('aria-label')).toBe('Borrar')
    expect(deleteBtn.classes()).toContain('text-danger')
  })

  it('UNIFIED-LISTINGS: predefined (owner_id null) rows render inline, no collapsible catalog section left', async () => {
    const { listExercises, listMuscleGroups } = await import('@/api/domain')
    vi.mocked(listExercises).mockResolvedValue([
      { id: 1, name_es: 'Press banca', name_en: 'Bench press', measurement: 'strength', owner_id: null, muscle_groups: [] },
      { id: 12, name_es: 'Press Arnold', name_en: 'Arnold press', measurement: 'strength', owner_id: 7, muscle_groups: [] },
    ] as never)
    vi.mocked(listMuscleGroups).mockResolvedValue([] as never)

    const wrapper = buildExerciseManager()
    await flushPromises()

    // el toggle colapsable desaparece con la consolidación
    expect(wrapper.find('[data-testid="toggle-catalog"]').exists()).toBe(false)
    expect(wrapper.get('[data-testid="catalog-exercise-row-1"]').text()).toContain('Press banca')
  })

  it('item 4: catalog (owner_id null) rows are read-only for a non-admin user', async () => {
    const { listExercises, listMuscleGroups } = await import('@/api/domain')
    vi.mocked(listExercises).mockResolvedValue([
      { id: 1, name_es: 'Press banca', name_en: 'Bench press', measurement: 'strength', owner_id: null, muscle_groups: [] },
      { id: 12, name_es: 'Press Arnold', name_en: 'Arnold press', measurement: 'strength', owner_id: 7, muscle_groups: [] },
    ] as never)
    vi.mocked(listMuscleGroups).mockResolvedValue([] as never)
    setUser({ is_admin: false })

    const wrapper = buildExerciseManager()
    await flushPromises()

    const row = wrapper.get('[data-testid="catalog-exercise-row-1"]')
    // solo lectura: sin controles de editar/borrar para un usuario normal
    expect(row.find('[data-testid="edit-exercise-1"]').exists()).toBe(false)
    expect(row.find('[data-testid="delete-exercise-1"]').exists()).toBe(false)
    // el propio (owner_id 7) no aparece duplicado en el catálogo
    expect(wrapper.find('[data-testid="catalog-exercise-row-12"]').exists()).toBe(false)
  })

  it('item 5: an admin sees edit/delete controls on catalog (predefined) rows too, and can edit one through the same sheet', async () => {
    const { listExercises, listMuscleGroups, updateExercise } = await import('@/api/domain')
    vi.mocked(listExercises).mockResolvedValue([
      { id: 1, name_es: 'Press banca', name_en: 'Bench press', measurement: 'strength', owner_id: null, muscle_groups: [] },
    ] as never)
    vi.mocked(listMuscleGroups).mockResolvedValue([] as never)
    vi.mocked(updateExercise).mockResolvedValue({
      id: 1, name_es: 'Press banca v2', name_en: 'Bench press v2', measurement: 'strength', owner_id: null, muscle_groups: [],
    } as never)
    setUser({ is_admin: true })

    const wrapper = buildExerciseManager()
    await flushPromises()

    const row = wrapper.get('[data-testid="catalog-exercise-row-1"]')
    await row.get('[data-testid="edit-exercise-1"]').trigger('click')
    await flushPromises()

    await byTestId('exercise-name-en-field').find('input').setValue('Bench press v2')
    await byTestId('save-exercise-btn').trigger('click')
    await flushPromises()

    expect(updateExercise).toHaveBeenCalledWith(1, expect.objectContaining({ name_en: 'Bench press v2' }))
  })

  it('item 10: the unified empty state shows the rune, message and a single "Nuevo ejercicio" action that opens the create form', async () => {
    const { listExercises, listMuscleGroups } = await import('@/api/domain')
    vi.mocked(listExercises).mockResolvedValue([] as never)
    vi.mocked(listMuscleGroups).mockResolvedValue([] as never)

    const wrapper = buildExerciseManager()
    await flushPromises()

    expect(wrapper.text()).toContain('Sin ejercicios aún')
    expect(wrapper.findAllComponents({ name: 'BkRune' }).length).toBeGreaterThan(0)

    const buttons = wrapper.findAll('[data-testid="new-exercise-btn"]')
    expect(buttons).toHaveLength(1)

    expect(byTestId('exercise-name-es-field').exists()).toBe(false)
    await buttons[0].trigger('click')
    await flushPromises()
    expect(byTestId('exercise-name-es-field').exists()).toBe(true)
  })

  it('item 14(c): the primary-group tag renders the group\'s dedicated rune, not its slug, when they differ', async () => {
    const { listExercises, listMuscleGroups } = await import('@/api/domain')
    vi.mocked(listExercises).mockResolvedValue([
      { id: 12, name_es: 'Press Arnold', name_en: 'Arnold press', measurement: 'strength', owner_id: 7, muscle_groups: [{ muscle_group_id: 2, is_primary: true }] },
    ] as never)
    vi.mocked(listMuscleGroups).mockResolvedValue([
      { id: 2, slug: 'shoulders', name_es: 'Hombros', name_en: 'Shoulders', owner_id: null, rune: 'ansuz' },
    ] as never)

    const wrapper = buildExerciseManager()
    await flushPromises()

    const ownTag = wrapper.get('[data-testid="exercise-group-tag-12"]')
    expect(ownTag.findComponent({ name: 'BkRune' }).props('name')).toBe('ansuz')
  })

  it('item 6 (v0.4.2): the group chip rune renders at the compact ~12 size', async () => {
    const { listExercises, listMuscleGroups } = await import('@/api/domain')
    vi.mocked(listExercises).mockResolvedValue([
      { id: 12, name_es: 'Press Arnold', name_en: 'Arnold press', measurement: 'strength', owner_id: 7, muscle_groups: [{ muscle_group_id: 2, is_primary: true }] },
    ] as never)
    vi.mocked(listMuscleGroups).mockResolvedValue([
      { id: 2, slug: 'shoulders', name_es: 'Hombros', name_en: 'Shoulders', owner_id: null },
    ] as never)

    const wrapper = buildExerciseManager()
    await flushPromises()

    const ownTag = wrapper.get('[data-testid="exercise-group-tag-12"]')
    expect(ownTag.findComponent({ name: 'BkRune' }).props('size')).toBe(12)
  })

  it('item 2 (v0.4.2): the attribution chip renders on its own row below the name, sized down (text-2xs)', async () => {
    const { listExercises, listMuscleGroups } = await import('@/api/domain')
    vi.mocked(listExercises).mockResolvedValue([
      {
        id: 1, name_es: 'Press banca', name_en: 'Bench press', measurement: 'strength', owner_id: null,
        is_public: false, owner_username: null, muscle_groups: [],
      },
    ] as never)
    vi.mocked(listMuscleGroups).mockResolvedValue([] as never)

    const wrapper = buildExerciseManager()
    await flushPromises()

    const row = wrapper.get('[data-testid="catalog-exercise-row-1"]')
    const nameEl = row.get('p')
    expect(nameEl.text()).toBe('Press banca')

    const chip = row.get('[data-testid="exercise-attribution-1"] span')
    expect(chip.text()).toBe('Catálogo predefinido')
    expect(chip.classes()).toContain('text-2xs')
    // fila DEDICADA: el chip no vive dentro del párrafo del nombre
    expect(nameEl.element.contains(chip.element)).toBe(false)
  })

  it('item 2+6 (v0.4.2): when both exist, the group chip and the attribution chip share the SAME chip row', async () => {
    const { listExercises, listMuscleGroups } = await import('@/api/domain')
    vi.mocked(listExercises).mockResolvedValue([
      { id: 1, name_es: 'Press banca', name_en: 'Bench press', measurement: 'strength', owner_id: null, muscle_groups: [{ muscle_group_id: 1, is_primary: true }] },
    ] as never)
    vi.mocked(listMuscleGroups).mockResolvedValue([
      { id: 1, slug: 'chest', name_es: 'Pecho', name_en: 'Chest', owner_id: null },
    ] as never)

    const wrapper = buildExerciseManager()
    await flushPromises()

    const groupTag = wrapper.get('[data-testid="exercise-group-tag-1"]')
    const attribution = wrapper.get('[data-testid="exercise-attribution-1"]')
    expect(groupTag.element.parentElement).toBe(attribution.element.parentElement)
  })

  // v0.9.4 (zurdi): búsqueda + filtro por grupo + chip de tipo — el origen
  // fue "los ejercicios de cardio no salen": salían, pero en una lista de 59
  // filas ordenada por name_en y sin nada en la fila que delatara el tipo
  describe('v0.9.4: search, group filter and measurement chip', () => {
    async function mountFiltered() {
      const { listExercises, listMuscleGroups } = await import('@/api/domain')
      vi.mocked(listExercises).mockResolvedValue([
        { id: 1, name_es: 'Press banca', name_en: 'Bench press', measurement: 'strength', owner_id: null, muscle_groups: [{ muscle_group_id: 1, is_primary: true }] },
        { id: 2, name_es: 'Cinta de correr', name_en: 'Treadmill', measurement: 'cardio', owner_id: null, muscle_groups: [{ muscle_group_id: 2, is_primary: true }] },
        { id: 3, name_es: 'Plancha', name_en: 'Plank', measurement: 'timed', owner_id: null, muscle_groups: [] },
      ] as never)
      vi.mocked(listMuscleGroups).mockResolvedValue([
        { id: 1, slug: 'chest', name_es: 'Pecho', name_en: 'Chest', owner_id: null },
        { id: 2, slug: 'legs', name_es: 'Piernas', name_en: 'Legs', owner_id: null },
      ] as never)

      const wrapper = buildExerciseManager()
      await flushPromises()
      return wrapper
    }

    it('typing a name in the search field narrows the list (both locales match)', async () => {
      const wrapper = await mountFiltered()
      await wrapper.get('[data-testid="exercise-search-field"]').find('input').setValue('treadmill')
      expect(wrapper.find('[data-testid="catalog-exercise-row-2"]').exists()).toBe(true)
      expect(wrapper.find('[data-testid="catalog-exercise-row-1"]').exists()).toBe(false)
    })

    it('typing "cardio" finds cardio exercises by their measurement, not just their name (the original zurdi report)', async () => {
      const wrapper = await mountFiltered()
      await wrapper.get('[data-testid="exercise-search-field"]').find('input').setValue('cardio')
      expect(wrapper.find('[data-testid="catalog-exercise-row-2"]').exists()).toBe(true)
      expect(wrapper.find('[data-testid="catalog-exercise-row-1"]').exists()).toBe(false)
      expect(wrapper.find('[data-testid="catalog-exercise-row-3"]').exists()).toBe(false)
    })

    it('the group filter narrows to exercises linked to that muscle group', async () => {
      const wrapper = await mountFiltered()
      await wrapper.get('[data-testid="exercise-group-filter"]').find('[role="combobox"]').trigger('click')
      const legsOption = Array.from(document.querySelectorAll('[role="option"]'))
        .find((o) => o.textContent?.trim() === 'Piernas') as HTMLElement
      expect(legsOption).not.toBeUndefined()
      legsOption.dispatchEvent(new MouseEvent('click', { bubbles: true }))
      await flushPromises()

      expect(wrapper.find('[data-testid="catalog-exercise-row-2"]').exists()).toBe(true)
      expect(wrapper.find('[data-testid="catalog-exercise-row-1"]').exists()).toBe(false)
    })

    it('a filter with no matches shows the plain no-results line, never the global empty state', async () => {
      const wrapper = await mountFiltered()
      await wrapper.get('[data-testid="exercise-search-field"]').find('input').setValue('yunque de skadi')
      expect(wrapper.find('[data-testid="exercise-filter-empty"]').exists()).toBe(true)
      // el BkEmpty global (con su CTA de crear) es para "no hay NADA", no
      // para un filtro sin resultados
      expect(wrapper.text()).not.toContain('Sin ejercicios aún')
    })

    it('non-strength rows carry a measurement chip (Cardio/Tiempo), strength rows do not', async () => {
      const wrapper = await mountFiltered()
      expect(wrapper.get('[data-testid="exercise-measurement-tag-2"]').text()).toBe('Cardio')
      expect(wrapper.get('[data-testid="exercise-measurement-tag-3"]').text()).toBe('Tiempo')
      expect(wrapper.find('[data-testid="exercise-measurement-tag-1"]').exists()).toBe(false)
    })

    it('sorts each bucket by the DISPLAYED (locale) name, not by name_en', async () => {
      const { listExercises, listMuscleGroups } = await import('@/api/domain')
      // por name_en el orden sería Stationary bike < Treadmill; por el nombre
      // ES mostrado debe ser Bicicleta estática < Cinta de correr
      vi.mocked(listExercises).mockResolvedValue([
        { id: 1, name_es: 'Cinta de correr', name_en: 'Treadmill', measurement: 'cardio', owner_id: null, muscle_groups: [] },
        { id: 2, name_es: 'Bicicleta estática', name_en: 'Stationary bike', measurement: 'cardio', owner_id: null, muscle_groups: [] },
      ] as never)
      vi.mocked(listMuscleGroups).mockResolvedValue([] as never)

      const wrapper = buildExerciseManager()
      await flushPromises()

      const testids = wrapper.findAll('[data-testid^="catalog-exercise-row-"]').map((row) => row.attributes('data-testid'))
      expect(testids).toEqual(['catalog-exercise-row-2', 'catalog-exercise-row-1'])
    })
  })
})

describe('MuscleGroupManager', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    setUser()
  })

  it('renders global groups without a delete control and own groups with one', async () => {
    const { listMuscleGroups } = await import('@/api/domain')
    vi.mocked(listMuscleGroups).mockResolvedValue([
      { id: 1, slug: 'pecho', name_es: 'Pecho', name_en: 'Chest', owner_id: null },
      { id: 2, slug: 'gemelo', name_es: 'Gemelo', name_en: 'Calf', owner_id: 7 },
    ] as never)

    const wrapper = buildMuscleGroupManager()
    await flushPromises()

    const globalRow = wrapper.find('[data-testid="muscle-group-row-1"]')
    expect(globalRow.find('[data-testid="delete-muscle-group-btn"]').exists()).toBe(false)
    expect(globalRow.find('[data-testid="global-group-badge"]').exists()).toBe(true)

    const ownRow = wrapper.find('[data-testid="muscle-group-row-2"]')
    expect(ownRow.find('[data-testid="delete-muscle-group-btn"]').exists()).toBe(true)
    expect(ownRow.find('[data-testid="global-group-badge"]').exists()).toBe(false)
  })

  it('UNIFIED-LISTINGS: sorts the list mine first (alphabetically), then global groups (alphabetically) — backend returns them mixed by id', async () => {
    const { listMuscleGroups } = await import('@/api/domain')
    vi.mocked(listMuscleGroups).mockResolvedValue([
      { id: 1, slug: 'pecho', name_es: 'Pecho', name_en: 'Chest', owner_id: null },
      { id: 2, slug: 'espalda', name_es: 'Espalda', name_en: 'Back', owner_id: null },
      { id: 3, slug: 'gemelo', name_es: 'Gemelo', name_en: 'Calf', owner_id: 7 },
      { id: 4, slug: 'antebrazo', name_es: 'Antebrazo', name_en: 'Forearm', owner_id: 7 },
    ] as never)
    setUser({ id: 7 })

    const wrapper = buildMuscleGroupManager()
    await flushPromises()

    const testids = wrapper.findAll('[data-testid^="muscle-group-row-"]').map((row) => row.attributes('data-testid'))
    // mías (Antebrazo, Gemelo) primero y alfabéticas, luego globales (Espalda, Pecho)
    expect(testids).toEqual([
      'muscle-group-row-4',
      'muscle-group-row-3',
      'muscle-group-row-2',
      'muscle-group-row-1',
    ])
  })

  it('item 5: an admin sees edit AND delete on a global row too (a regular user still sees neither)', async () => {
    const { listMuscleGroups } = await import('@/api/domain')
    vi.mocked(listMuscleGroups).mockResolvedValue([
      { id: 1, slug: 'chest', name_es: 'Pecho', name_en: 'Chest', owner_id: null },
    ] as never)
    setUser({ is_admin: true })

    const wrapper = buildMuscleGroupManager()
    await flushPromises()

    const globalRow = wrapper.get('[data-testid="muscle-group-row-1"]')
    expect(globalRow.find('[data-testid="edit-muscle-group-btn"]').exists()).toBe(true)
    expect(globalRow.find('[data-testid="delete-muscle-group-btn"]').exists()).toBe(true)
  })

  it('item 5: a non-admin sees neither edit nor delete on a global row', async () => {
    const { listMuscleGroups } = await import('@/api/domain')
    vi.mocked(listMuscleGroups).mockResolvedValue([
      { id: 1, slug: 'chest', name_es: 'Pecho', name_en: 'Chest', owner_id: null },
    ] as never)
    setUser({ is_admin: false })

    const wrapper = buildMuscleGroupManager()
    await flushPromises()

    const globalRow = wrapper.get('[data-testid="muscle-group-row-1"]')
    expect(globalRow.find('[data-testid="edit-muscle-group-btn"]').exists()).toBe(false)
    expect(globalRow.find('[data-testid="delete-muscle-group-btn"]').exists()).toBe(false)
  })

  it('item 14: admin edits a global group\'s name and DEDICATED rune through the edit sheet, pre-filled from the row (slug read-only, highlighting the effective rune)', async () => {
    const { listMuscleGroups, updateMuscleGroup } = await import('@/api/domain')
    vi.mocked(listMuscleGroups).mockResolvedValue([
      { id: 1, slug: 'chest', name_es: 'Pecho', name_en: 'Chest', owner_id: null },
    ] as never)
    vi.mocked(updateMuscleGroup).mockResolvedValue({
      id: 1, slug: 'chest', name_es: 'Pecho y hombro', name_en: 'Chest and shoulder', owner_id: null, rune: 'shoulders',
    } as never)
    setUser({ is_admin: true })

    const wrapper = buildMuscleGroupManager()
    await flushPromises()

    await wrapper.get('[data-testid="edit-muscle-group-btn"]').trigger('click')
    await flushPromises()

    // pre-rellenado desde la fila; slug de solo lectura (item 14: ya no es
    // editable, identidad estable); runa EFECTIVA (rune ?? slug) resaltada
    expect(byTestId('edit-group-name-es-field').find('input').element).toHaveProperty('value', 'Pecho')
    expect(byTestId('edit-group-slug-readonly').exists()).toBe(true)
    expect(byTestId('edit-group-slug-readonly').text()).toBe('chest')
    expect(byTestId('edit-group-slug-readonly').find('input').exists()).toBe(false)
    expect(byTestId('group-rune-chest').attributes('aria-pressed')).toBe('true')
    expect(byTestId('group-rune-shoulders').attributes('aria-pressed')).toBe('false')

    await byTestId('edit-group-name-es-field').find('input').setValue('Pecho y hombro')
    await byTestId('edit-group-name-en-field').find('input').setValue('Chest and shoulder')
    await byTestId('group-rune-shoulders').trigger('click')
    await flushPromises()

    expect(byTestId('group-rune-shoulders').attributes('aria-pressed')).toBe('true')
    expect(byTestId('group-rune-chest').attributes('aria-pressed')).toBe('false')

    await byTestId('save-group-btn').trigger('click')
    await flushPromises()

    // slug NUNCA en el payload — el sheet dejó de editarlo
    expect(updateMuscleGroup).toHaveBeenCalledWith(1, {
      name_es: 'Pecho y hombro',
      name_en: 'Chest and shoulder',
      rune: 'shoulders',
    })
  })

  it('item 14: owner edits their own custom group\'s rune (bug fix: edit used to only show for global rows)', async () => {
    const { listMuscleGroups, updateMuscleGroup } = await import('@/api/domain')
    vi.mocked(listMuscleGroups).mockResolvedValue([
      { id: 2, slug: 'glutes', name_es: 'Glúteos', name_en: 'Glutes', owner_id: 7, rune: null },
    ] as never)
    vi.mocked(updateMuscleGroup).mockResolvedValue({
      id: 2, slug: 'glutes', name_es: 'Glúteos', name_en: 'Glutes', owner_id: 7, rune: 'legs',
    } as never)
    setUser({ id: 7, is_admin: false })

    const wrapper = buildMuscleGroupManager()
    await flushPromises()

    // el bug: antes esto no existía para una fila propia no-global
    const ownRow = wrapper.get('[data-testid="muscle-group-row-2"]')
    expect(ownRow.find('[data-testid="edit-muscle-group-btn"]').exists()).toBe(true)

    await ownRow.get('[data-testid="edit-muscle-group-btn"]').trigger('click')
    await flushPromises()

    await byTestId('group-rune-legs').trigger('click')
    await byTestId('save-group-btn').trigger('click')
    await flushPromises()

    expect(updateMuscleGroup).toHaveBeenCalledWith(2, {
      name_es: 'Glúteos',
      name_en: 'Glutes',
      rune: 'legs',
    })
  })

  it('item 14: create-with-rune round trip — the create drawer has the same rune picker, sent on submit', async () => {
    const { listMuscleGroups, createMuscleGroup } = await import('@/api/domain')
    vi.mocked(listMuscleGroups).mockResolvedValue([] as never)
    vi.mocked(createMuscleGroup).mockResolvedValue({
      id: 3, slug: 'glutes', name_es: 'Glúteos', name_en: 'Glutes', owner_id: 7, rune: 'legs',
    } as never)

    const wrapper = buildMuscleGroupManager()
    await flushPromises()

    await wrapper.find('[data-testid="open-create-group-btn"]').trigger('click')
    await flushPromises()

    await byTestId('group-slug-field').find('input').setValue('glutes')
    await byTestId('group-name-es-field').find('input').setValue('Glúteos')
    await byTestId('group-name-en-field').find('input').setValue('Glutes')
    await byTestId('group-rune-legs').trigger('click')
    await flushPromises()
    expect(byTestId('group-rune-legs').attributes('aria-pressed')).toBe('true')

    await byTestId('create-group-btn').trigger('click')
    await flushPromises()

    expect(createMuscleGroup).toHaveBeenCalledWith({
      slug: 'glutes',
      name_es: 'Glúteos',
      name_en: 'Glutes',
      is_global: false,
      rune: 'legs',
    })
  })

  it('item 14(c): a row\'s icon renders the dedicated rune, overriding the slug-derived one, and falls back to the slug when there is none', async () => {
    const { listMuscleGroups } = await import('@/api/domain')
    vi.mocked(listMuscleGroups).mockResolvedValue([
      { id: 1, slug: 'legs', name_es: 'Piernas', name_en: 'Legs', owner_id: null, rune: 'core' },
      { id: 2, slug: 'chest', name_es: 'Pecho', name_en: 'Chest', owner_id: null, rune: null },
    ] as never)

    const wrapper = buildMuscleGroupManager()
    await flushPromises()

    const overriddenRow = wrapper.get('[data-testid="muscle-group-row-1"]')
    expect(overriddenRow.findComponent({ name: 'BkRune' }).props('name')).toBe('core')

    const fallbackRow = wrapper.get('[data-testid="muscle-group-row-2"]')
    expect(fallbackRow.findComponent({ name: 'BkRune' }).props('name')).toBe('chest')
  })

  it('item 10: empty state shows the rune, message and a single "Nuevo grupo" action that opens the create drawer', async () => {
    const { listMuscleGroups } = await import('@/api/domain')
    vi.mocked(listMuscleGroups).mockResolvedValue([] as never)

    const wrapper = buildMuscleGroupManager()
    await flushPromises()

    expect(wrapper.text()).toContain('Sin grupos musculares aún')
    const buttons = wrapper.findAll('[data-testid="open-create-group-btn"]')
    expect(buttons).toHaveLength(1)

    expect(byTestId('group-slug-field').exists()).toBe(false)
    await buttons[0].trigger('click')
    await flushPromises()
    expect(byTestId('group-slug-field').exists()).toBe(true)
  })

  // item 2/3 (v0.4.3, zurdi): esqueleto shimmer mientras carga, en vez de nada
  it('gates the list on readiness: the skeleton shows while pending (no rows, no empty state), rows appear once resolved', async () => {
    const { listMuscleGroups } = await import('@/api/domain')
    let resolveGroups: (value: never) => void = () => {}
    vi.mocked(listMuscleGroups).mockImplementationOnce(() => new Promise((resolve) => { resolveGroups = resolve }))

    const wrapper = buildMuscleGroupManager()
    await flushPromises()

    expect(wrapper.find('[data-testid="muscle-group-list-skeleton"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid^="muscle-group-row-"]').exists()).toBe(false)
    expect(wrapper.text()).not.toContain('Sin grupos musculares aún')

    resolveGroups([
      { id: 2, slug: 'gemelo', name_es: 'Gemelo', name_en: 'Calf', owner_id: 7 },
    ] as never)
    await flushPromises()

    expect(wrapper.find('[data-testid="muscle-group-list-skeleton"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="muscle-group-row-2"]').exists()).toBe(true)
  })

  it('item 2: create opens a drawer (BkSheet) from a primary button, and submits through it', async () => {
    const { listMuscleGroups, createMuscleGroup } = await import('@/api/domain')
    vi.mocked(listMuscleGroups).mockResolvedValue([] as never)
    vi.mocked(createMuscleGroup).mockResolvedValue({
      id: 3, slug: 'antebrazo', name_es: 'Antebrazo', name_en: 'Forearm', owner_id: 7,
    } as never)

    const wrapper = buildMuscleGroupManager()
    await flushPromises()

    // el formulario no está en el DOM hasta que se abre el drawer
    expect(byTestId('group-slug-field').exists()).toBe(false)

    await wrapper.find('[data-testid="open-create-group-btn"]').trigger('click')
    await flushPromises()

    await byTestId('group-slug-field').find('input').setValue('antebrazo')
    await byTestId('group-name-es-field').find('input').setValue('Antebrazo')
    await byTestId('group-name-en-field').find('input').setValue('Forearm')

    await byTestId('create-group-btn').trigger('click')
    await flushPromises()

    expect(createMuscleGroup).toHaveBeenCalledWith({
      slug: 'antebrazo',
      name_es: 'Antebrazo',
      name_en: 'Forearm',
      is_global: false,
      rune: null,
    })
  })

  it('deletes an own muscle group through the confirm sheet', async () => {
    const { listMuscleGroups, deleteMuscleGroup } = await import('@/api/domain')
    vi.mocked(listMuscleGroups).mockResolvedValue([
      { id: 2, slug: 'gemelo', name_es: 'Gemelo', name_en: 'Calf', owner_id: 7 },
    ] as never)
    vi.mocked(deleteMuscleGroup).mockResolvedValue(undefined as never)

    const wrapper = buildMuscleGroupManager()
    await flushPromises()

    await wrapper.find('[data-testid="delete-muscle-group-btn"]').trigger('click')
    await flushPromises()

    expect(byTestId('delete-group-confirm-sheet').exists()).toBe(true)

    await byTestId('delete-group-confirm-btn').trigger('click')
    await flushPromises()

    expect(deleteMuscleGroup).toHaveBeenCalledWith(2)
  })

  it('item 1: the own-group delete control is an icon-only BkActionBtn with danger styling and an accessible label', async () => {
    const { listMuscleGroups } = await import('@/api/domain')
    vi.mocked(listMuscleGroups).mockResolvedValue([
      { id: 2, slug: 'gemelo', name_es: 'Gemelo', name_en: 'Calf', owner_id: 7 },
    ] as never)

    const wrapper = buildMuscleGroupManager()
    await flushPromises()

    const deleteBtn = wrapper.get('[data-testid="delete-muscle-group-btn"]')
    expect(deleteBtn.attributes('aria-label')).toBe('Borrar')
    expect(deleteBtn.classes()).toContain('text-danger')
    expect(deleteBtn.find('svg').exists()).toBe(true)
  })

  it('hides the is_global toggle for a non-admin user', async () => {
    const { listMuscleGroups } = await import('@/api/domain')
    vi.mocked(listMuscleGroups).mockResolvedValue([] as never)
    setUser({ is_admin: false })

    const wrapper = buildMuscleGroupManager()
    await flushPromises()
    await wrapper.find('[data-testid="open-create-group-btn"]').trigger('click')
    await flushPromises()

    expect(byTestId('group-is-global-checkbox').exists()).toBe(false)
  })

  it('shows the is_global toggle for an admin user', async () => {
    const { listMuscleGroups } = await import('@/api/domain')
    vi.mocked(listMuscleGroups).mockResolvedValue([] as never)
    setUser({ is_admin: true })

    const wrapper = buildMuscleGroupManager()
    await flushPromises()
    await wrapper.find('[data-testid="open-create-group-btn"]').trigger('click')
    await flushPromises()

    expect(byTestId('group-is-global-checkbox').exists()).toBe(true)
  })

  it('item 2 (v0.4.2): the Global badge renders on its own row below the name, sized down (text-2xs)', async () => {
    const { listMuscleGroups } = await import('@/api/domain')
    vi.mocked(listMuscleGroups).mockResolvedValue([
      { id: 1, slug: 'pecho', name_es: 'Pecho', name_en: 'Chest', owner_id: null },
    ] as never)

    const wrapper = buildMuscleGroupManager()
    await flushPromises()

    const row = wrapper.get('[data-testid="muscle-group-row-1"]')
    const nameRow = row.get('span.flex.items-center.gap-2')
    expect(nameRow.text()).toBe('Pecho')

    const badge = row.get('[data-testid="global-group-badge"]')
    expect(badge.text()).toBe('Global')
    expect(badge.classes()).toContain('text-2xs')
    // fila DEDICADA: el badge no vive dentro de la fila del nombre
    expect(nameRow.element.contains(badge.element)).toBe(false)
  })
})

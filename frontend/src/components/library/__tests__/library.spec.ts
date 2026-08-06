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

  it('lists only own exercises, hiding catalog rows owned by nobody', async () => {
    const { listExercises, listMuscleGroups } = await import('@/api/domain')
    vi.mocked(listExercises).mockResolvedValue([
      { id: 1, name_es: 'Press banca', name_en: 'Bench press', measurement: 'strength', owner_id: null, muscle_groups: [] },
      { id: 12, name_es: 'Press Arnold', name_en: 'Arnold press', measurement: 'strength', owner_id: 7, muscle_groups: [{ muscle_group_id: 1, is_primary: true }] },
    ] as never)
    vi.mocked(listMuscleGroups).mockResolvedValue([] as never)

    const wrapper = buildExerciseManager()
    await flushPromises()

    expect(wrapper.text()).toContain('Press Arnold')
    expect(wrapper.text()).not.toContain('Press banca')
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

    await wrapper.get('[data-testid="toggle-catalog"]').trigger('click')
    await flushPromises()

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

  it('gates the list on readiness: neither rows nor the empty state show while pending, the loaded rows appear once resolved', async () => {
    const { listExercises, listMuscleGroups } = await import('@/api/domain')
    let resolveExercises: (value: never) => void = () => {}
    vi.mocked(listExercises).mockImplementationOnce(() => new Promise((resolve) => { resolveExercises = resolve }))
    vi.mocked(listMuscleGroups).mockResolvedValue([] as never)

    const wrapper = buildExerciseManager()
    await flushPromises()

    // pendiente: ni una fila de ejercicio propio ni el mensaje vacío
    expect(wrapper.find('[data-testid^="exercise-row-"]').exists()).toBe(false)
    expect(wrapper.text()).not.toContain('Sin ejercicios propios aún')

    resolveExercises([
      { id: 12, name_es: 'Press Arnold', name_en: 'Arnold press', measurement: 'strength', owner_id: 7, muscle_groups: [] },
    ] as never)
    await flushPromises()

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

    await byTestId('muscle-group-checkbox-1').setValue(true)
    await byTestId('muscle-group-primary-1').setValue(true)

    await byTestId('save-exercise-btn').trigger('click')
    await flushPromises()

    expect(createExercise).toHaveBeenCalledWith({
      name_es: 'Press Arnold',
      name_en: 'Arnold press',
      measurement: 'strength',
      muscle_groups: [{ muscle_group_id: 1, is_primary: true }],
      is_global: false,
    })
  })

  it('item 3: hides the is_global toggle for a non-admin user', async () => {
    const { listExercises, listMuscleGroups } = await import('@/api/domain')
    vi.mocked(listExercises).mockResolvedValue([] as never)
    vi.mocked(listMuscleGroups).mockResolvedValue([] as never)
    setUser({ is_admin: false })

    const wrapper = buildExerciseManager()
    await flushPromises()
    await wrapper.find('[data-testid="new-exercise-btn"]').trigger('click')
    await flushPromises()

    expect(byTestId('exercise-is-global-checkbox').exists()).toBe(false)
  })

  it('item 3: shows the is_global toggle for an admin user and sends it true when checked', async () => {
    const { listExercises, listMuscleGroups, createExercise } = await import('@/api/domain')
    vi.mocked(listExercises).mockResolvedValue([] as never)
    vi.mocked(listMuscleGroups).mockResolvedValue([] as never)
    vi.mocked(createExercise).mockResolvedValue({
      id: 21, name_es: 'X', name_en: 'X', measurement: 'strength', owner_id: null, muscle_groups: [],
    } as never)
    setUser({ is_admin: true })

    const wrapper = buildExerciseManager()
    await flushPromises()
    await wrapper.find('[data-testid="new-exercise-btn"]').trigger('click')
    await flushPromises()

    expect(byTestId('exercise-is-global-checkbox').exists()).toBe(true)

    await byTestId('exercise-name-es-field').find('input').setValue('X')
    await byTestId('exercise-name-en-field').find('input').setValue('X')
    await byTestId('exercise-is-global-checkbox').setValue(true)
    await byTestId('save-exercise-btn').trigger('click')
    await flushPromises()

    expect(createExercise).toHaveBeenCalledWith(expect.objectContaining({ is_global: true }))
  })

  it('item 3: does not render the is_global toggle when editing (create-only, not patchable)', async () => {
    const { listExercises, listMuscleGroups } = await import('@/api/domain')
    vi.mocked(listExercises).mockResolvedValue([
      { id: 12, name_es: 'Press Arnold', name_en: 'Arnold press', measurement: 'strength', owner_id: 7, muscle_groups: [] },
    ] as never)
    vi.mocked(listMuscleGroups).mockResolvedValue([] as never)
    setUser({ is_admin: true })

    const wrapper = buildExerciseManager()
    await flushPromises()

    await wrapper.find('[data-testid="edit-exercise-12"]').trigger('click')
    await flushPromises()

    expect(byTestId('exercise-is-global-checkbox').exists()).toBe(false)
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

  it('item 4: the predefined catalog section is collapsed by default (no rows in the DOM, toggle collapsed)', async () => {
    const { listExercises, listMuscleGroups } = await import('@/api/domain')
    vi.mocked(listExercises).mockResolvedValue([
      { id: 1, name_es: 'Press banca', name_en: 'Bench press', measurement: 'strength', owner_id: null, muscle_groups: [] },
      { id: 12, name_es: 'Press Arnold', name_en: 'Arnold press', measurement: 'strength', owner_id: 7, muscle_groups: [] },
    ] as never)
    vi.mocked(listMuscleGroups).mockResolvedValue([] as never)

    const wrapper = buildExerciseManager()
    await flushPromises()

    const toggle = wrapper.get('[data-testid="toggle-catalog"]')
    expect(toggle.attributes('aria-expanded')).toBe('false')
    expect(wrapper.find('[data-testid="catalog-exercise-row-1"]').exists()).toBe(false)
    expect(wrapper.text()).toContain('Catálogo predefinido')
  })

  it('item 4: expanding the catalog toggle reveals predefined (owner_id null) rows, read-only for a non-admin user', async () => {
    const { listExercises, listMuscleGroups } = await import('@/api/domain')
    vi.mocked(listExercises).mockResolvedValue([
      { id: 1, name_es: 'Press banca', name_en: 'Bench press', measurement: 'strength', owner_id: null, muscle_groups: [] },
      { id: 12, name_es: 'Press Arnold', name_en: 'Arnold press', measurement: 'strength', owner_id: 7, muscle_groups: [] },
    ] as never)
    vi.mocked(listMuscleGroups).mockResolvedValue([] as never)
    setUser({ is_admin: false })

    const wrapper = buildExerciseManager()
    await flushPromises()

    await wrapper.get('[data-testid="toggle-catalog"]').trigger('click')
    await flushPromises()

    expect(wrapper.get('[data-testid="toggle-catalog"]').attributes('aria-expanded')).toBe('true')
    const row = wrapper.get('[data-testid="catalog-exercise-row-1"]')
    expect(row.text()).toContain('Press banca')
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
    await wrapper.get('[data-testid="toggle-catalog"]').trigger('click')
    await flushPromises()

    const row = wrapper.get('[data-testid="catalog-exercise-row-1"]')
    await row.get('[data-testid="edit-exercise-1"]').trigger('click')
    await flushPromises()

    await byTestId('exercise-name-en-field').find('input').setValue('Bench press v2')
    await byTestId('save-exercise-btn').trigger('click')
    await flushPromises()

    expect(updateExercise).toHaveBeenCalledWith(1, expect.objectContaining({ name_en: 'Bench press v2' }))
  })

  it('item 4: shows the empty state once loaded if the catalog has no predefined rows', async () => {
    const { listExercises, listMuscleGroups } = await import('@/api/domain')
    vi.mocked(listExercises).mockResolvedValue([] as never)
    vi.mocked(listMuscleGroups).mockResolvedValue([] as never)

    const wrapper = buildExerciseManager()
    await flushPromises()

    await wrapper.get('[data-testid="toggle-catalog"]').trigger('click')
    await flushPromises()

    expect(wrapper.text()).toContain('Sin ejercicios en el catálogo')
  })

  it('item 10: own-exercises empty state shows the rune, message and a single "Nuevo ejercicio" action that opens the create form', async () => {
    const { listExercises, listMuscleGroups } = await import('@/api/domain')
    vi.mocked(listExercises).mockResolvedValue([] as never)
    vi.mocked(listMuscleGroups).mockResolvedValue([] as never)

    const wrapper = buildExerciseManager()
    await flushPromises()

    expect(wrapper.text()).toContain('Sin ejercicios propios aún')
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

    expect(wrapper.text()).toContain('Sin grupos musculares propios aún')
    const buttons = wrapper.findAll('[data-testid="open-create-group-btn"]')
    expect(buttons).toHaveLength(1)

    expect(byTestId('group-slug-field').exists()).toBe(false)
    await buttons[0].trigger('click')
    await flushPromises()
    expect(byTestId('group-slug-field').exists()).toBe(true)
  })

  it('gates the list on readiness: neither rows nor the empty state show while pending, rows appear once resolved', async () => {
    const { listMuscleGroups } = await import('@/api/domain')
    let resolveGroups: (value: never) => void = () => {}
    vi.mocked(listMuscleGroups).mockImplementationOnce(() => new Promise((resolve) => { resolveGroups = resolve }))

    const wrapper = buildMuscleGroupManager()
    await flushPromises()

    expect(wrapper.find('[data-testid^="muscle-group-row-"]').exists()).toBe(false)
    expect(wrapper.text()).not.toContain('Sin grupos musculares propios aún')

    resolveGroups([
      { id: 2, slug: 'gemelo', name_es: 'Gemelo', name_en: 'Calf', owner_id: 7 },
    ] as never)
    await flushPromises()

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
})

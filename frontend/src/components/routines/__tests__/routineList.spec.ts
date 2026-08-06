import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { createI18nInstance } from '@/i18n'
import { useAuthStore } from '@/stores/auth'
import RoutineList from '../RoutineList.vue'

vi.mock('@/api/domain', () => ({
  listRoutines: vi.fn(() => Promise.resolve([
    {
      id: 1,
      name: 'Push Day',
      description: 'Upper body push',
      rune: 'chest',
      color: null,
      exercises: [
        { id: 1, exercise_id: 1, position: 0, target_sets: 4, target_reps: 8, target_weight_kg: 80, rest_seconds: 120 },
        { id: 2, exercise_id: 2, position: 1, target_sets: 3, target_reps: 10, target_weight_kg: 60, rest_seconds: 90 },
      ],
    },
    {
      id: 2,
      name: 'Pull Day',
      description: 'Upper body pull',
      rune: 'back',
      color: null,
      exercises: [
        { id: 3, exercise_id: 3, position: 0, target_sets: 4, target_reps: 6, target_weight_kg: 100, rest_seconds: 120 },
      ],
    },
  ])),
  deleteRoutine: vi.fn((id: number) => Promise.resolve(void 0)),
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

    const runes = wrapper.findAllComponents({ name: 'BkRune' })
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
})

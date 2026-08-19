import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'

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
      is_global: false,
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
      is_global: false,
      owner_username: null,
      exercises: [
        { id: 3, exercise_id: 3, position: 0, target_sets: 4, target_reps: 6, target_weight_kg: 100, rest_seconds: 120 },
      ],
    },
  ])),
  deleteRoutine: vi.fn((id: number) => Promise.resolve(void 0)),
  // ROUTINES-OPEN: resuelto en vacío por defecto, los tests que lo ejercitan
  // lo sobreescriben con mockResolvedValueOnce
  listRoutineTemplates: vi.fn(() => Promise.resolve([])),
  copyRoutine: vi.fn((id: number) => Promise.resolve({ id: 99 })),
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

  it('item 7: has no "Rutinas" heading, and the new-routine button sits alone at the left edge of its row, opening the editor in create mode', async () => {
    const wrapper = build()
    await wrapper.vm.$nextTick()
    await new Promise(resolve => setTimeout(resolve, 50))
    await wrapper.vm.$nextTick()

    // W2 feature 2: la sección "Plantillas" SÍ tiene su propio <h2> (título +
    // subtítulo compuestos a mano, item 1) — lo que sigue sin llevar heading
    // es la lista de rutinas propias en sí, así que se comprueba que ningún
    // h2 diga "Rutinas" a secas (el subtítulo de Plantillas SÍ contiene la
    // palabra dentro de una frase — "Rutinas globales…" —, eso es contenido
    // legítimo, no el heading redundante que este test descarta)
    expect(wrapper.findAll('h2').some((h) => h.text() === 'Rutinas')).toBe(false)

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

  // v0.23.0 (zurdi: "el botón nueva rutina arriba, igual que en la
  // biblioteca") — deshace el item 1 de v0.4.3, que lo tenía debajo
  it('v0.23.0: the new-routine button renders BEFORE the list in the DOM (at the top)', async () => {
    const wrapper = build()
    await wrapper.vm.$nextTick()
    await new Promise(resolve => setTimeout(resolve, 50))
    await wrapper.vm.$nextTick()

    const root = wrapper.get('.space-y-4').element
    const grid = wrapper.get('.grid.gap-3').element
    const button = wrapper.get('[data-testid="new-routine-btn"]').element
    const children = Array.from(root.children)
    expect(children.indexOf(button.parentElement!)).toBeLessThan(children.indexOf(grid))
  })

  // item 12 (v0.4.3, zurdi): la runa y el grupo de acciones centran contra
  // el alto de la fila (antes items-start, top-aligned contra una columna
  // de info de varias líneas)
  it('item 12: the card row and its info button center their content vertically (items-center)', async () => {
    const wrapper = build()
    await wrapper.vm.$nextTick()
    await new Promise(resolve => setTimeout(resolve, 50))
    await wrapper.vm.$nextTick()

    const row = wrapper.get('[data-testid="toggle-routine-1"]').element.parentElement!
    expect(row.classList.contains('items-center')).toBe(true)
    expect(wrapper.get('[data-testid="toggle-routine-1"]').classes()).toContain('items-center')
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
    // defecto dentro de su BkEmpty, que no es lo que este test comprueba.
    // v0.23.1: la fila pinta BkMedia (foto de rutina o pozo rúnico): la runa
    // válida llega como prop; la legacy inválida cae a null → bindrune
    const ownList = wrapper.get('.grid.gap-3')
    const media = ownList.findAllComponents({ name: 'BkMedia' })
    expect(media.length).toBe(2)
    expect(media[0].props('rune')).toBe('chest')
    expect(media[1].props('rune')).toBeNull()
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

  // item 2/3 (v0.4.3, zurdi): el gate-a-blanco se reemplaza por un esqueleto
  // shimmer con el mismo hueco que la lista real — ya no "nada" mientras
  // carga, sino filas placeholder; ni la lista real ni el vacío conviven con
  // el esqueleto, y al resolver se intercambian limpiamente.
  it('gates the list on readiness: the skeleton shows while listRoutines is pending (no real list, no empty state), swapped once it resolves', async () => {
    const { listRoutines } = await import('@/api/domain')
    let resolveList: (value: never) => void = () => {}
    vi.mocked(listRoutines).mockImplementationOnce(() => new Promise((resolve) => { resolveList = resolve }))

    const wrapper = build()
    await wrapper.vm.$nextTick()

    // pendiente: esqueleto presente, ni la lista real ni el mensaje vacío
    expect(wrapper.find('[data-testid="routine-list-skeleton"]').exists()).toBe(true)
    expect(wrapper.findAll('[data-testid="routine-list-skeleton"] .bk-shimmer').length).toBeGreaterThan(0)
    expect(wrapper.text()).not.toContain('Sin rutinas aún')

    resolveList([] as never)
    await new Promise(resolve => setTimeout(resolve, 0))
    await wrapper.vm.$nextTick()

    // resuelto (vacío en este caso): el esqueleto se retira y aparece el mensaje
    expect(wrapper.find('[data-testid="routine-list-skeleton"]').exists()).toBe(false)
    expect(wrapper.text()).toContain('Sin rutinas aún')
  })

  describe('UNIFIED-LISTINGS: templates (global + others\' public) live in the same list', () => {
    async function buildReady() {
      const wrapper = build()
      await wrapper.vm.$nextTick()
      await new Promise(resolve => setTimeout(resolve, 50))
      await wrapper.vm.$nextTick()
      return wrapper
    }

    // item 2 (v0.4.0 — ROOT CAUSE del bug de visibilidad "ni tampoco
    // ejercicios"): una rutina global puede referenciar un ejercicio que su
    // dueño nunca marcó is_public por separado (el campo del EJERCICIO, no
    // el is_global de la rutina) — la rutina SÍ es visible (list_templates
    // solo mira Routine.is_global), pero ese ejercicio no está en el
    // catálogo visible de quien mira (no es suyo, no es global, no es
    // público). Antes exerciseName() devolvía '' para un ExerciseOut
    // undefined y la fila salía completamente en blanco, indistinguible de
    // un fallo real. Ahora se explicita con un placeholder — sin filtrar el
    // nombre real, que sería la fuga de privacidad que el backend evita.
    it('item 2: an exercise not visible to the viewer (owner made the routine global but not that exercise) shows a "private exercise" placeholder instead of a blank name', async () => {
      const { listRoutineTemplates } = await import('@/api/domain')
      vi.mocked(listRoutineTemplates).mockResolvedValueOnce([
        {
          id: 10, owner_id: 9, name: 'Empuje de Freyja', description: null, rune: null, color: null,
          is_global: true, owner_username: 'freyja',
          exercises: [
            // exercise_id 999: NO está en el mock de listExercises (solo 1,2,3) —
            // simula el ejercicio privado de freyja que nunca hizo público
            { id: 1, exercise_id: 999, position: 0, target_sets: 3, target_reps: null, target_weight_kg: null, rest_seconds: null },
          ],
        },
      ] as never)

      const wrapper = await buildReady()

      await wrapper.get('[data-testid="toggle-template-10"]').trigger('click')
      await wrapper.vm.$nextTick()

      const list = wrapper.get('[data-testid="exercise-list-template-10"]')
      expect(list.text()).toContain('Ejercicio privado')
      expect(list.text()).not.toBe('') // nunca una fila muda, sin explicación
    })

    it('renders a GLOBAL template (owner_username null) with the "Global" attribution chip, and a public template from another user via BkUser', async () => {
      const { listRoutineTemplates } = await import('@/api/domain')
      vi.mocked(listRoutineTemplates).mockResolvedValueOnce([
        {
          id: 10, owner_id: null, name: 'Plantilla admin', description: null, rune: null, color: null,
          is_global: false, owner_username: null, exercises: [],
        },
        {
          id: 11, owner_id: 9, name: 'Rutina de Freyja', description: null, rune: null, color: null,
          is_global: true, owner_username: 'freyja', exercises: [],
        },
      ] as never)

      const wrapper = await buildReady()

      expect(wrapper.text()).toContain('Plantilla admin')
      expect(wrapper.get('[data-testid="template-attribution-10"]').text()).toBe('Global')
      expect(wrapper.text()).toContain('Rutina de Freyja')
      // UNIFIED-LISTINGS: la atribución de "de otro usuario" es la primitiva
      // BkUser (dot + nombre), no un texto suelto de "sharedBy"
      const otherAttribution = wrapper.get('[data-testid="template-attribution-11"]')
      expect(otherAttribution.text()).toContain('freyja')
      expect(otherAttribution.findComponent({ name: 'BkUser' }).exists()).toBe(true)
    })

    it('UNIFIED-LISTINGS: own routines never carry a creator label (no attribution element on own cards)', async () => {
      const wrapper = await buildReady()

      expect(wrapper.find('[data-testid="template-attribution-1"]').exists()).toBe(false)
      expect(wrapper.find('[data-testid="template-attribution-2"]').exists()).toBe(false)
    })

    it('UNIFIED-LISTINGS: global and others\' templates expose only the duplicate action (no edit or delete)', async () => {
      const { listRoutineTemplates } = await import('@/api/domain')
      vi.mocked(listRoutineTemplates).mockResolvedValueOnce([
        {
          id: 10, owner_id: null, name: 'Plantilla admin', description: null, rune: null, color: null,
          is_global: false, owner_username: null, exercises: [],
        },
        {
          id: 11, owner_id: 9, name: 'Rutina de Freyja', description: null, rune: null, color: null,
          is_global: true, owner_username: 'freyja', exercises: [],
        },
      ] as never)

      const wrapper = await buildReady()

      for (const id of [10, 11]) {
        expect(wrapper.find(`[data-testid="edit-routine-${id}"]`).exists()).toBe(false)
        expect(wrapper.find(`[data-testid="delete-routine-${id}"]`).exists()).toBe(false)
        expect(wrapper.find(`[data-testid="duplicate-routine-${id}"]`).exists()).toBe(true)
      }
    })

    // ROUTINES-OPEN: "Duplicar" ya no es exclusivo de lo ajeno — una rutina
    // PROPIA también expone la acción, junto a editar/borrar
    it('ROUTINES-OPEN: own routines ALSO expose the duplicate action alongside edit/delete', async () => {
      const wrapper = await buildReady()

      expect(wrapper.find('[data-testid="edit-routine-1"]').exists()).toBe(true)
      expect(wrapper.find('[data-testid="delete-routine-1"]').exists()).toBe(true)
      expect(wrapper.find('[data-testid="duplicate-routine-1"]').exists()).toBe(true)
    })

    it('ROUTINES-OPEN: clicking duplicate on an OWN routine calls copyRoutine and reloads', async () => {
      const { copyRoutine, listRoutines } = await import('@/api/domain')
      vi.mocked(copyRoutine).mockClear()
      vi.mocked(listRoutines).mockClear()

      const wrapper = await buildReady()
      const callsBefore = vi.mocked(listRoutines).mock.calls.length

      await wrapper.get('[data-testid="duplicate-routine-1"]').trigger('click')
      await flushPromises()

      expect(copyRoutine).toHaveBeenCalledWith(1)
      expect(vi.mocked(listRoutines).mock.calls.length).toBeGreaterThan(callsBefore)
    })

    it('UNIFIED-LISTINGS: sorts the merged list mine first, then global templates, then others\' public templates', async () => {
      const { listRoutineTemplates } = await import('@/api/domain')
      vi.mocked(listRoutineTemplates).mockResolvedValueOnce([
        {
          id: 11, owner_id: 9, name: 'Rutina de Freyja', description: null, rune: null, color: null,
          is_global: true, owner_username: 'freyja', exercises: [],
        },
        {
          id: 10, owner_id: null, name: 'Plantilla admin', description: null, rune: null, color: null,
          is_global: false, owner_username: null, exercises: [],
        },
      ] as never)

      const wrapper = await buildReady()

      // fixture por defecto de listRoutines: 'Push Day' (1), 'Pull Day' (2)
      const names = wrapper.findAll('h3').map((h) => h.text())
      expect(names).toEqual(['Push Day', 'Pull Day', 'Plantilla admin', 'Rutina de Freyja'])
    })

    it('clicking the duplicate button duplicates the routine and reloads the lists', async () => {
      const { listRoutineTemplates, copyRoutine, listRoutines } = await import('@/api/domain')
      vi.mocked(listRoutineTemplates).mockResolvedValue([
        {
          id: 10, owner_id: null, name: 'Plantilla admin', description: null, rune: null, color: null,
          is_global: false, owner_username: null, exercises: [],
        },
      ] as never)
      vi.mocked(copyRoutine).mockClear()
      vi.mocked(listRoutines).mockClear()

      const wrapper = await buildReady()
      const callsBeforeCopy = vi.mocked(listRoutines).mock.calls.length

      await wrapper.get('[data-testid="duplicate-routine-10"]').trigger('click')
      await flushPromises()

      expect(copyRoutine).toHaveBeenCalledWith(10)
      // recarga tras duplicar: mis rutinas se vuelven a pedir para reflejar la copia
      expect(vi.mocked(listRoutines).mock.calls.length).toBeGreaterThan(callsBeforeCopy)
    })

    it('the duplicate action renders an icon-only BkActionBtn with icon="copy", labelled "Duplicar"', async () => {
      const { listRoutineTemplates } = await import('@/api/domain')
      vi.mocked(listRoutineTemplates).mockResolvedValueOnce([
        {
          id: 10, owner_id: null, name: 'Plantilla admin', description: null, rune: null, color: null,
          is_global: false, owner_username: null, exercises: [],
        },
      ] as never)

      const wrapper = await buildReady()

      const duplicateBtn = wrapper.get('[data-testid="duplicate-routine-10"]')
      expect(duplicateBtn.attributes('aria-label')).toBe('Duplicar')
      expect(duplicateBtn.find('svg').findAll('rect')).toHaveLength(2)
    })

    it('a template card expands to reveal its exercises, same as an own routine card', async () => {
      const { listRoutineTemplates } = await import('@/api/domain')
      vi.mocked(listRoutineTemplates).mockResolvedValueOnce([
        {
          id: 10, owner_id: null, name: 'Plantilla admin', description: null, rune: null, color: null,
          is_global: false, owner_username: null,
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

    it('UNIFIED-LISTINGS: with no own routines but templates present, the list still renders (no BkEmpty)', async () => {
      const { listRoutines, listRoutineTemplates } = await import('@/api/domain')
      vi.mocked(listRoutines).mockResolvedValueOnce([])
      vi.mocked(listRoutineTemplates).mockResolvedValueOnce([
        {
          id: 10, owner_id: null, name: 'Plantilla admin', description: null, rune: null, color: null,
          is_global: false, owner_username: null, exercises: [],
        },
      ] as never)

      const wrapper = await buildReady()

      expect(wrapper.text()).not.toContain('Sin rutinas aún')
      expect(wrapper.text()).toContain('Plantilla admin')
    })

    it('UNIFIED-LISTINGS: the single BkEmpty only appears when BOTH own routines and templates are empty', async () => {
      const { listRoutines, listRoutineTemplates } = await import('@/api/domain')
      vi.mocked(listRoutines).mockResolvedValueOnce([])
      vi.mocked(listRoutineTemplates).mockResolvedValueOnce([])

      const wrapper = await buildReady()

      expect(wrapper.text()).toContain('Sin rutinas aún')
    })
  })

  // ROUTINES-OPEN (course correction, v0.4.2): el toggle "Compartir como
  // plantilla" de la tarjeta y el control admin-only "Convertir en global"
  // (con su confirm sheet) MUEREN los dos — el check "Global" vive ahora en
  // RoutineEditorSheet (ver routineEditor.spec.ts), disponible a CUALQUIER
  // usuario sobre su propia rutina, sin ceder la propiedad. Este test barre
  // que ninguno de los dos afordances viejos sobrevive en la card, ni para
  // un usuario normal ni para un admin.
  describe('ROUTINES-OPEN: no card-level visibility controls survive the pivot', () => {
    it('no toggle-public or globalize control renders anywhere, for a regular user', async () => {
      const wrapper = build()
      await wrapper.vm.$nextTick()
      await new Promise(resolve => setTimeout(resolve, 50))
      await wrapper.vm.$nextTick()

      expect(wrapper.find('[data-testid="toggle-public-routine-1"]').exists()).toBe(false)
      expect(wrapper.find('[data-testid="globalize-routine-1"]').exists()).toBe(false)
      expect(wrapper.text()).not.toContain('Compartir como plantilla')
      expect(wrapper.text()).not.toContain('Convertir en global')
    })

    it('no toggle-public or globalize control renders anywhere, for an admin either', async () => {
      const auth = useAuthStore()
      auth.user = { id: 1, username: 'admin', is_admin: true, locale: 'es', units: 'kg', timezone: 'UTC' }
      const wrapper = build()
      await wrapper.vm.$nextTick()
      await new Promise(resolve => setTimeout(resolve, 50))
      await wrapper.vm.$nextTick()

      expect(wrapper.find('[data-testid="toggle-public-routine-1"]').exists()).toBe(false)
      expect(wrapper.find('[data-testid="globalize-routine-1"]').exists()).toBe(false)
    })
  })

  // brief: "Ownership chip on its own row, smaller" — text-2xs scale, y la
  // atribución de otro usuario vía BkUser en size="xs" (más pequeño que el
  // "sm" que usaba UNIFIED-LISTINGS antes de esta pivot)
  describe('ROUTINES-OPEN: compact attribution row', () => {
    async function buildReady() {
      const wrapper = build()
      await wrapper.vm.$nextTick()
      await new Promise(resolve => setTimeout(resolve, 50))
      await wrapper.vm.$nextTick()
      return wrapper
    }

    it('renders the "Global" chip at text-2xs scale for a legacy owner_id NULL routine', async () => {
      const { listRoutineTemplates } = await import('@/api/domain')
      vi.mocked(listRoutineTemplates).mockResolvedValueOnce([
        {
          id: 10, owner_id: null, name: 'Plantilla admin', description: null, rune: null, color: null,
          is_global: false, owner_username: null, exercises: [],
        },
      ] as never)

      const wrapper = await buildReady()

      const attribution = wrapper.get('[data-testid="template-attribution-10"]')
      expect(attribution.find('span').classes()).toContain('text-2xs')
    })

    it('renders a global routine\'s owner via BkUser at size="xs"', async () => {
      const { listRoutineTemplates } = await import('@/api/domain')
      vi.mocked(listRoutineTemplates).mockResolvedValueOnce([
        {
          id: 11, owner_id: 9, name: 'Rutina de Freyja', description: null, rune: null, color: null,
          is_global: true, owner_username: 'freyja', exercises: [],
        },
      ] as never)

      const wrapper = await buildReady()

      const bkUser = wrapper.get('[data-testid="template-attribution-11"]').findComponent({ name: 'BkUser' })
      expect(bkUser.props('size')).toBe('xs')
    })
  })
})

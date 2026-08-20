import { DOMWrapper, flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { createI18nInstance } from '@/i18n'
import { useRestTimerStore } from '@/stores/restTimer'
import { useToastStore } from '@/stores/toast'
import { restFor } from '../rest'
import WorkoutExerciseCard from '../WorkoutExerciseCard.vue'

const pushExercise = {
  id: 20,
  exercise_id: 5,
  position: 0,
  note: null,
  rest_seconds: null,
  sets: [
    { id: 1, set_number: 1, reps: 5, weight_kg: 100, duration_seconds: null, distance_m: null, is_warmup: false, rpe: null, completed_at: 'x' },
    { id: 2, set_number: 2, reps: 5, weight_kg: 40, duration_seconds: null, distance_m: null, is_warmup: true, rpe: null, completed_at: 'x' },
  ],
}

const cardioWorkoutExercise = {
  id: 30,
  exercise_id: 6,
  position: 1,
  note: null,
  rest_seconds: null,
  sets: [],
}

const routines = [
  {
    id: 1,
    name: 'Push',
    description: null,
    rune: null,
    color: null,
    exercises: [
      { id: 10, exercise_id: 5, position: 0, target_sets: 3, target_reps: 8, target_weight_kg: null, rest_seconds: 120 },
    ],
  },
]

const exercise = {
  id: 5,
  name_es: 'Press banca',
  name_en: 'Bench press',
  measurement: 'strength' as const,
  owner_id: null,
  muscle_groups: [{ muscle_group_id: 1, is_primary: true }],
}

const cardioExercise = {
  id: 6,
  name_es: 'Cinta',
  name_en: 'Treadmill',
  measurement: 'cardio' as const,
  owner_id: null,
  muscle_groups: [],
}

const muscleGroups = [{ id: 1, slug: 'chest', name_es: 'Pecho', name_en: 'Chest', owner_id: null }]

describe('restFor (item 11: workout-exercise override > routine target > default)', () => {
  it('picks the workout exercise override first, even over a routine target', () => {
    expect(restFor(200, 1, routines as never, 5)).toBe(200)
  })

  it('falls back to the routine rest_seconds when there is no override', () => {
    expect(restFor(null, 1, routines as never, 5)).toBe(120)
  })

  // v0.9.4 (zurdi): default 60s, antes 90
  it('falls back to 60 when the workout is free (no routine) and no override', () => {
    expect(restFor(null, null, routines as never, 5)).toBe(60)
  })

  it('falls back to 60 when the exercise is not part of the matched routine', () => {
    expect(restFor(null, 1, routines as never, 999)).toBe(60)
  })

  it('an override of 0 is still respected (falsy but not nullish)', () => {
    expect(restFor(0, 1, routines as never, 5)).toBe(0)
  })
})

// round 8: WorkoutExerciseCard dejó de leer un store propio (ver
// workoutActions.ts) — las acciones de escritura llegan como prop
// `actions`, así que los mocks van directos ahí, sin pasar por '@/api/domain'
function makeActions(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    logSet: vi.fn(async () => ({
      set: {
        id: 101,
        set_number: 1,
        reps: 8,
        weight_kg: 20,
        duration_seconds: null,
        distance_m: null,
        is_warmup: false,
        rpe: null,
        completed_at: '2026-08-05T10:00:00Z',
      },
      new_records: [],
    })),
    updateSet: vi.fn(async () => {}),
    deleteSet: vi.fn(async () => {}),
    removeExercise: vi.fn(async () => {}),
    reorder: vi.fn(async () => {}),
    addExercise: vi.fn(async () => {}),
    exerciseHistory: vi.fn(async () => null),
    setExerciseRest: vi.fn(async () => {}),
    exerciseNote: vi.fn(async () => ''),
    saveExerciseNote: vi.fn(async (_id: number, note: string) => note.trim()),
    ...overrides,
  }
}

function mountCard(overrides: Partial<Record<string, unknown>> = {}) {
  const actions = (overrides.actions as ReturnType<typeof makeActions>) ?? makeActions()
  return mount(WorkoutExerciseCard, {
    props: {
      workoutExercise: pushExercise as never,
      exercise: exercise as never,
      muscleGroups: muscleGroups as never,
      routines: [] as never,
      routineId: null,
      exerciseIds: [20],
      units: 'kg',
      locale: 'es',
      ...overrides,
      actions,
    },
    global: { plugins: [createI18nInstance()] },
    attachTo: document.body,
  })
}

// BkSheet teletransporta el drawer a document.body — patrón obligatorio
// (HARD TEST RULES) para cualquier interacción con SetForm dentro del cajón
function byTestId(id: string): DOMWrapper<Element> {
  return new DOMWrapper(document.body.querySelector(`[data-testid="${id}"]`) as Element | null)
}

async function openDrawer(weid: number) {
  await byTestId(`add-set-${weid}`).trigger('click')
  await flushPromises()
}

// facelift: la gestión (reordenar/descanso/bloque/quitar) vive en el sheet
// kebab del ejercicio — se abre primero, y sus controles se consultan vía
// byTestId (el sheet teletransporta a body, wrapper.find no llega)
async function openMenu(weid: number) {
  await byTestId(`exercise-menu-${weid}`).trigger('click')
  await flushPromises()
}

function drawerForm(): DOMWrapper<HTMLFormElement> {
  return new DOMWrapper(document.body.querySelector('form') as HTMLFormElement)
}

describe('WorkoutExerciseCard', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  afterEach(() => {
    document.body.innerHTML = ''
  })

  it('renders the exercise name, its primary-group rune (in the BkMedia well fallback) and the formatted sets as rows', () => {
    const wrapper = mountCard()
    expect(wrapper.text()).toContain('Press banca')
    // facelift: el primer BkRune es el pozo de fallback de BkMedia (sin foto)
    const rune = wrapper.findComponent({ name: 'BkRune' })
    expect(rune.props('name')).toBe('chest')
    expect(wrapper.text()).toContain('100 kg')
  })

  // fix M10a (revisión): "· N" es el nº de series EFECTIVAS, como en el
  // resto de la app — pushExercise trae 1 de trabajo + 1 de calentamiento
  it('fix M10a: the compact set count excludes warmups (1 effective + 1 warmup shows "1", not "2")', () => {
    const wrapper = mountCard()
    expect(wrapper.get('[data-testid="set-count-20"]').text()).toContain('1')
    expect(wrapper.get('[data-testid="set-count-20"]').text()).not.toContain('2')
  })

  it('fix M10a: hides the set-count badge entirely when every logged set is a warmup', () => {
    const warmupOnly = {
      ...pushExercise,
      sets: [{ id: 1, set_number: 1, reps: 10, weight_kg: 20, duration_seconds: null, distance_m: null, is_warmup: true, rpe: null, completed_at: 'x' }],
    }
    const wrapper = mountCard({ workoutExercise: warmupOnly })
    expect(wrapper.find('[data-testid="set-count-20"]').exists()).toBe(false)
  })

  it('marks warmup sets as ink-faint', () => {
    const wrapper = mountCard()
    const rows = wrapper.findAll('[data-testid^="set-row-"]')
    expect(rows[0].classes()).not.toContain('text-ink-faint')
    expect(rows[1].classes()).toContain('text-ink-faint')
  })

  it('there is no permanent inline form: no <form> exists until the drawer is opened', () => {
    const wrapper = mountCard()
    expect(wrapper.find('form').exists()).toBe(false)
    expect(document.body.querySelector('form')).toBeNull()
  })

  describe('item 1: drawer logging', () => {
    it('"+ Serie" opens a real dialog with SetForm inside, teleported to body', async () => {
      mountCard()
      expect(document.body.querySelector('[role="dialog"]')).toBeNull()

      await openDrawer(20)

      expect(document.body.querySelector('[role="dialog"]')).not.toBeNull()
      expect(drawerForm()).not.toBeNull()
    })

    it('"Registrar serie" (primary submit) logs through actions.logSet and CLOSES the drawer', async () => {
      const actions = makeActions()
      mountCard({ actions })
      await openDrawer(20)

      await drawerForm().trigger('submit')
      await flushPromises()

      expect(actions.logSet).toHaveBeenCalledWith(
        20,
        expect.objectContaining({ is_warmup: false, reps: expect.any(Number), weight_kg: expect.any(Number) }),
      )
      expect(document.body.querySelector('[role="dialog"]')).toBeNull()
    })

    it('"Registrar y otra" logs through actions.logSet and KEEPS the drawer open with values kept', async () => {
      const actions = makeActions()
      mountCard({ actions })
      await openDrawer(20)

      await byTestId('log-set-and-another').trigger('click')
      await flushPromises()

      expect(actions.logSet).toHaveBeenCalledTimes(1)
      expect(document.body.querySelector('[role="dialog"]')).not.toBeNull()
      // el form sigue montado (misma instancia): un segundo envío reutiliza los valores
      await drawerForm().trigger('submit')
      await flushPromises()
      expect(actions.logSet).toHaveBeenCalledTimes(2)
    })

    it('editing a set opens the drawer prefilled with its EXACT values (not the item-2 defaults chain)', async () => {
      const actions = makeActions()
      mountCard({ actions })

      await byTestId('edit-set-1').trigger('click')
      await flushPromises()

      // item 2 (post-0.3.0): el stepper del cajón ahora es size="compact"
      // (text-lg, no el text-2xl de "md") — ver SetForm.vue
      const weightDisplay = document.body.querySelector('.bk-metric.text-lg')
      expect(weightDisplay?.textContent).toContain('100')

      await drawerForm().trigger('submit')
      await flushPromises()

      expect(actions.updateSet).toHaveBeenCalledWith(20, 1, { is_warmup: false, reps: 5, weight_kg: 100, load_mode: 'weight' })
      expect(document.body.querySelector('[role="dialog"]')).toBeNull()
    })

    // fix I2 (revisión): la prueba de arriba envía el payload SIN tocar nada,
    // así que pasaría igual con un formulario "muerto" (que no leyera de
    // verdad el valor tecleado). Esta es la versión discriminante: toca UN
    // campo (peso) y comprueba que el payload COMPLETO — con reps intacto —
    // refleja el cambio; es el footgun real del PATCH full-replace del
    // backend (ver backend/app/routers/workouts.py::update_set)
    it('edits a set via actions.updateSet with the full SetIn payload after a real click-through tweak (I5 full-replace footgun)', async () => {
      const actions = makeActions()
      mountCard({ actions })

      await byTestId('edit-set-1').trigger('click')
      await flushPromises()

      // set 1 del fixture: reps 5, weight_kg 100, is_warmup false, sin rpe —
      // el primer "Aumentar" del drawer es el del peso (stepper de peso
      // antes que el de reps en la rama strength de SetForm)
      const weightPlus = new DOMWrapper(
        document.body.querySelectorAll('[aria-label="Aumentar"]')[0] as HTMLElement,
      )
      await weightPlus.trigger('click', { detail: 0 })
      await drawerForm().trigger('submit')
      await flushPromises()

      // payload COMPLETO: reps e is_warmup viajan intactos aunque solo se
      // haya tocado el peso
      expect(actions.updateSet).toHaveBeenCalledWith(20, 1, {
        is_warmup: false,
        reps: 5,
        weight_kg: 102.5,
        // v0.18.0: el modo viaja en todo payload de serie de fuerza
        load_mode: 'weight',
      })
    })

    it('editing never shows "Registrar y otra" (only makes sense for a fresh set)', async () => {
      mountCard()
      await byTestId('edit-set-1').trigger('click')
      await flushPromises()
      expect(document.body.querySelector('[data-testid="log-set-and-another"]')).toBeNull()
    })

    it('closing the drawer via Escape without submitting never calls logSet/updateSet', async () => {
      const actions = makeActions()
      mountCard({ actions })
      await openDrawer(20)

      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
      await flushPromises()

      expect(document.body.querySelector('[role="dialog"]')).toBeNull()
      expect(actions.logSet).not.toHaveBeenCalled()
      expect(actions.updateSet).not.toHaveBeenCalled()
    })

    it('a rejected logSet surfaces a toast and leaves the drawer open and usable', async () => {
      const toast = useToastStore()
      const actions = makeActions({ logSet: vi.fn().mockRejectedValueOnce(new Error('network down')) })
      mountCard({ actions })
      await openDrawer(20)

      await drawerForm().trigger('submit')
      await flushPromises()

      expect(toast.toasts.length).toBeGreaterThan(0)
      expect(document.body.querySelector('[role="dialog"]')).not.toBeNull()

      actions.logSet = vi.fn(async () => ({ set: pushExercise.sets[0], new_records: [] }))
      await drawerForm().trigger('submit')
      await flushPromises()
      expect(actions.logSet).toHaveBeenCalled()
    })
  })

  describe('item 2: prefill defaults for a NEW set', () => {
    it('defaults from the last EFFECTIVE (non-warmup) set of THIS exercise in THIS workout when one exists', async () => {
      mountCard()
      await openDrawer(20)
      // fix I1 (revisión): el fixture trae reps 5/100kg (set 1, trabajo) y
      // LUEGO reps 5/40kg (set 2, calentamiento) — el último set SIN MÁS es
      // el calentamiento, pero el prefill debe ignorarlo y usar el 100kg de
      // la serie de trabajo (ver setDefaults.ts::resolveNewSetDefaults)
      const weightDisplay = document.body.querySelector('.bk-metric.text-lg')
      expect(weightDisplay?.textContent).toContain('100')
    })

    it('falls back to the routine target when this workout has no sets yet for the exercise', async () => {
      const emptyExercise = { ...pushExercise, sets: [] }
      mountCard({ workoutExercise: emptyExercise, routines, routineId: 1 })
      await openDrawer(20)

      const weightDisplay = document.body.querySelector('.bk-metric.text-lg')
      const repsDisplay = document.body.querySelectorAll('.bk-metric.text-lg')[1]
      // target_weight_kg es null en el fixture de rutina, así que cae al
      // default de medición (20kg); target_reps sí está fijado (8)
      expect(weightDisplay?.textContent).toContain('20')
      expect(repsDisplay?.textContent).toContain('8')
    })

    it('falls back to the previous-session history when there is no workout data and no routine target', async () => {
      const emptyExercise = { ...pushExercise, sets: [] }
      const actions = makeActions({
        exerciseHistory: vi.fn(async () => ({
          workout_id: 9,
          date: '2026-07-20',
          sets: [{ reps: 6, weight_kg: 82.5, duration_seconds: null, distance_m: null, is_warmup: false }],
        })),
      })
      mountCard({ workoutExercise: emptyExercise, actions })
      await openDrawer(20)

      const weightDisplay = document.body.querySelector('.bk-metric.text-lg')
      expect(weightDisplay?.textContent).toContain('82.5')
    })
  })

  // v0.18.1 (zurdi: "los bloques deberían poder cambiarse también mid
  // entreno"): picker "Bloque: X" en la card en vivo
  describe('v0.18.1: per-card block picker', () => {
    it('is hidden when the actions lack setExerciseBlock (retro editor)', async () => {
      mountCard()
      await openMenu(20)
      expect(byTestId('block-toggle-20').exists()).toBe(false)
    })

    it('moves the exercise to an existing block via the chips', async () => {
      const setExerciseBlock = vi.fn(async () => {})
      const actions = makeActions({ setExerciseBlock })
      mountCard({ actions, blockLabels: ['Empuje', 'Tirón'] })

      await openMenu(20)
      await byTestId('block-toggle-20').trigger('click')
      await byTestId('block-pick-20-Tirón').trigger('click')
      expect(setExerciseBlock).toHaveBeenCalledWith(20, 'Tirón')
      // el picker se cierra tras elegir
      expect(byTestId('block-picker-20').exists()).toBe(false)
    })

    it('offers "sin bloque" only when the exercise IS in one, and clears with null', async () => {
      const setExerciseBlock = vi.fn(async () => {})
      const actions = makeActions({ setExerciseBlock })
      const inBlock = { ...pushExercise, block_label: 'Empuje' }
      mountCard({ actions, workoutExercise: inBlock, blockLabels: ['Empuje'] })

      await openMenu(20)
      await byTestId('block-toggle-20').trigger('click')
      await byTestId('block-pick-none-20').trigger('click')
      expect(setExerciseBlock).toHaveBeenCalledWith(20, null)
    })

    it('"+ Nuevo bloque…" emits newBlock for the parent to name it', async () => {
      const actions = makeActions({ setExerciseBlock: vi.fn(async () => {}) })
      const wrapper = mountCard({ actions })

      await openMenu(20)
      await byTestId('block-toggle-20').trigger('click')
      await byTestId('block-new-20').trigger('click')
      expect(wrapper.emitted('newBlock')).toBeTruthy()
    })
  })

  describe('item 3: previous-session history', () => {
    it('shows the multi-line "last time" block on the compact card when the exercise has no sets yet (v0.17.0)', async () => {
      const emptyExercise = { ...pushExercise, sets: [] }
      const actions = makeActions({
        exerciseHistory: vi.fn(async () => ({
          workout_id: 9,
          date: '2026-07-20',
          sets: [
            { reps: 8, weight_kg: 80, duration_seconds: null, distance_m: null, is_warmup: false },
            { reps: 8, weight_kg: 80, duration_seconds: null, distance_m: null, is_warmup: false },
          ],
        })),
      })
      const wrapper = mountCard({ workoutExercise: emptyExercise, actions })
      await flushPromises()

      // v0.17.0 (zurdi): una línea por serie, como el bloque del drawer — la
      // línea densa agrupada ("2×8·80 kg") murió
      const hint = wrapper.get('[data-testid="card-history-hint"]').text()
      expect(hint).toContain('S1 · 8 × 80 kg')
      expect(hint).toContain('S2 · 8 × 80 kg')
    })

    it('facelift v3 (zurdi): the card hint stays visible even once the exercise has sets logged — it is the reference to beat', async () => {
      const actions = makeActions({
        exerciseHistory: vi.fn(async () => ({ workout_id: 9, date: '2026-07-20', sets: [{ reps: 8, weight_kg: 80, duration_seconds: null, distance_m: null, is_warmup: false }] })),
      })
      const wrapper = mountCard({ actions })
      await flushPromises()
      expect(wrapper.find('[data-testid="card-history-hint"]').exists()).toBe(true)
    })

    it('item 4d: shows a multi-line "Última vez" block inside the drawer, date on its own line + one "Sn · reps × peso" line per set', async () => {
      const actions = makeActions({
        exerciseHistory: vi.fn(async () => ({
          workout_id: 9,
          date: '2026-07-20',
          sets: [
            { reps: 8, weight_kg: 80, duration_seconds: null, distance_m: null, is_warmup: false },
            { reps: 8, weight_kg: 82.5, duration_seconds: null, distance_m: null, is_warmup: false },
          ],
        })),
      })
      mountCard({ actions })
      await flushPromises()
      await openDrawer(20)

      const hint = byTestId('drawer-history-hint')
      const lines = hint.findAll('p')
      expect(lines[0].text()).toContain('20 jul')
      expect(lines[1].text()).toBe('S1 · 8 × 80 kg')
      expect(lines[2].text()).toBe('S2 · 8 × 82.5 kg')
    })

    it('item 4d: the "Última vez" block never contains an em-dash or en-dash (zurdi: "quita el m-dash")', async () => {
      const actions = makeActions({
        exerciseHistory: vi.fn(async () => ({
          workout_id: 9,
          date: '2026-07-20',
          sets: [{ reps: 8, weight_kg: 80, duration_seconds: null, distance_m: null, is_warmup: false }],
        })),
      })
      mountCard({ actions })
      await flushPromises()
      await openDrawer(20)

      const hint = byTestId('drawer-history-hint')
      expect(hint.text()).not.toMatch(/[—–]/)
    })

    it('fetches history once per exercise id (cache lives in the store, not refetched per drawer open)', async () => {
      const actions = makeActions()
      mountCard({ actions })
      await flushPromises()

      await openDrawer(20)
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
      await flushPromises()
      await openDrawer(20)

      // se pide UNA vez al montar (para el hint de la tarjeta), no de nuevo
      // en cada apertura del cajón — el cacheo es responsabilidad del store,
      // pero la tarjeta tampoco debe volver a llamar a exerciseHistory ella sola
      expect(actions.exerciseHistory).toHaveBeenCalledTimes(1)
    })
  })

  // v0.24.0: sugerencia de progresión — chip solo cuando la última sesión
  // cumplió el objetivo entero; tocarla abre el cajón con el peso sugerido
  describe('v0.24.0: progression suggestion chip', () => {
    const freshExercise = { ...pushExercise, id: 21, sets: [] }
    const metSet = { reps: 8, weight_kg: 60, duration_seconds: null, distance_m: null, is_warmup: false, load_mode: 'weight' }
    const metHistory = { workout_id: 9, date: '2026-08-12', sets: [metSet, metSet, { ...metSet, reps: 9 }] }

    it('renders the chip with the suggested weight and taps open the drawer prefilled with it', async () => {
      const actions = makeActions({ exerciseHistory: vi.fn(async () => metHistory) })
      const wrapper = mountCard({
        workoutExercise: freshExercise as never,
        actions,
        live: true,
        routineId: 1,
        routines: routines as never,
      })
      await flushPromises()

      const chip = wrapper.get('[data-testid="progression-hint-21"]')
      expect(chip.text()).toContain('62.5')

      await chip.trigger('click')
      await flushPromises()
      // el cajón abre con el peso sugerido ya puesto (valor del stepper)
      const stepperValues = [...document.body.querySelectorAll('[data-testid="stepper-edit"]')].map((el) => el.textContent)
      expect(stepperValues.some((v) => v?.includes('62.5'))).toBe(true)
    })

    it('stays hidden when the last session missed the target, and once an effective set exists today', async () => {
      const missedHistory = { ...metHistory, sets: [metSet, metSet, { ...metSet, reps: 6 }] }
      const actions = makeActions({ exerciseHistory: vi.fn(async () => missedHistory) })
      const missed = mountCard({
        workoutExercise: freshExercise as never,
        actions,
        live: true,
        routineId: 1,
        routines: routines as never,
      })
      await flushPromises()
      expect(missed.find('[data-testid="progression-hint-21"]').exists()).toBe(false)

      // con una serie efectiva de HOY el chip tampoco pinta (ya empezó)
      const started = mountCard({
        workoutExercise: pushExercise as never,
        actions: makeActions({ exerciseHistory: vi.fn(async () => metHistory) }),
        live: true,
        routineId: 1,
        routines: routines as never,
      })
      await flushPromises()
      expect(started.find('[data-testid="progression-hint-20"]').exists()).toBe(false)
    })
  })

  describe('item 6: cardio block', () => {
    function mountCardio(overrides: Partial<Record<string, unknown>> = {}) {
      return mountCard({
        workoutExercise: cardioWorkoutExercise,
        exercise: cardioExercise,
        exerciseIds: [30],
        ...overrides,
      })
    }

    // v0.23.0 (zurdi): el acento lateral de cardio muere — con el facelift
    // leía como un borde descuadrado; la card es el slab normal
    it('renders as the plain slab, without the old left border accent', () => {
      const wrapper = mountCardio()
      expect(wrapper.classes()).not.toEqual(expect.arrayContaining(['border-l-2']))
    })

    // v0.23.0 (zurdi): las dos acciones ocupan toda la fila a partes iguales
    it('the log/start actions fill the row equally (2-col grid, block buttons)', async () => {
      const wrapper = mountCardio()
      await flushPromises()
      const actions = wrapper.get('[data-testid="cardio-actions-30"]')
      expect(actions.classes()).toEqual(expect.arrayContaining(['grid', 'grid-cols-2', 'flex-1']))
    })

    // v0.10.0 (zurdi: "o una entrada con el tiempo hecho y ya, o empezar
    // timer que se añada solo — no inline controls y formulario"): el
    // formulario inline de la v0.9.4 muere; la card son DOS acciones limpias
    it('v0.10.0: renders the two clean actions (log time / start) and no inline form', async () => {
      const wrapper = mountCardio()
      await flushPromises()
      expect(wrapper.find('[data-testid="add-set-30"]').exists()).toBe(false)
      expect(wrapper.find('[data-testid="cardio-inline-form-30"]').exists()).toBe(false)
      expect(wrapper.get('[data-testid="cardio-log-30"]').text()).toBe('Registrar tiempo')
      expect(wrapper.get('[data-testid="cardio-start-30"]').text()).toContain('Empezar')
    })

    it('v0.10.0: "Registrar tiempo" opens the drawer with the cardio form', async () => {
      const wrapper = mountCardio()
      await flushPromises()
      await wrapper.get('[data-testid="cardio-log-30"]').trigger('click')
      await flushPromises()
      expect(document.body.querySelector('form')).not.toBeNull()
    })

    it('shows no rest control at all, even with restEnabled on', async () => {
      mountCardio()
      await flushPromises()
      await openMenu(30)
      expect(byTestId('rest-toggle-30').exists()).toBe(false)
    })

    it('logging cardio through the drawer never starts the rest timer', async () => {
      const actions = makeActions()
      const restTimer = useRestTimerStore()
      const startSpy = vi.spyOn(restTimer, 'start')

      const wrapper = mountCardio({ actions })
      await flushPromises()
      await wrapper.get('[data-testid="cardio-log-30"]').trigger('click')
      await flushPromises()
      const form = document.body.querySelector('form') as HTMLFormElement
      form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
      await flushPromises()

      expect(actions.logSet).toHaveBeenCalledWith(30, expect.objectContaining({ duration_seconds: expect.any(Number) }))
      expect(startSpy).not.toHaveBeenCalled()
    })

    it('cardio rows are not numbered (no "N." prefix)', () => {
      const withSet = {
        ...cardioWorkoutExercise,
        sets: [{ id: 1, set_number: 1, reps: null, weight_kg: null, duration_seconds: 1800, distance_m: 5000, is_warmup: false, rpe: null, completed_at: 'x' }],
      }
      const wrapper = mountCardio({ workoutExercise: withSet })
      const row = wrapper.get('[data-testid="set-row-1"]')
      expect(row.text()).not.toMatch(/^1\./)
      expect(row.text()).toContain('5000 m')
    })
  })

  describe('item 7: cardio countdown', () => {
    // v0.3.2 CARDIO-COUNTDOWN PERSISTENCE: localStorage real (no el stub roto
    // de Node, ver uiPrefs.spec.ts) para poder afirmar sobre lo persistido,
    // no solo sobre la degradación a default
    function mockStorage(): Storage {
      const store = new Map<string, string>()
      return {
        getItem: (key: string) => (store.has(key) ? store.get(key)! : null),
        setItem: (key: string, value: string) => { store.set(key, value) },
        removeItem: (key: string) => { store.delete(key) },
        clear: () => { store.clear() },
        key: (index: number) => Array.from(store.keys())[index] ?? null,
        get length() { return store.size },
      } as Storage
    }

    beforeEach(() => {
      vi.useFakeTimers()
      vi.stubGlobal('navigator', { vibrate: vi.fn() })
      vi.stubGlobal('localStorage', mockStorage())
    })
    afterEach(() => {
      vi.useRealTimers()
      vi.unstubAllGlobals()
    })

    function mountCardio(overrides: Partial<Record<string, unknown>> = {}) {
      return mountCard({
        workoutExercise: cardioWorkoutExercise,
        exercise: cardioExercise,
        exerciseIds: [30],
        workoutId: 1,
        ...overrides,
      })
    }

    // v0.11.5 (zurdi): "Empezar" abre el picker de duración (sheet
    // teleportado a body); el countdown arranca al confirmarlo — el objetivo
    // por defecto sigue siendo el que anuncia la etiqueta del botón
    async function startCardio(wrapper: ReturnType<typeof mountCard>) {
      await wrapper.get('[data-testid="cardio-start-30"]').trigger('click')
      await flushPromises()
      await byTestId('cardio-start-confirm').trigger('click')
      await flushPromises()
    }

    // v0.10.0: "Empezar" vive en la CARD (con el objetivo por defecto en la
    // etiqueta) y arranca el countdown reutilizando la superficie de resume;
    // cuelga de `live`, no de restEnabled (cardio ya ni siquiera descansa)
    it('shows "Empezar" on the card when live', async () => {
      const wrapper = mountCardio()
      await flushPromises()
      expect(wrapper.find('[data-testid="cardio-start-30"]').exists()).toBe(true)
    })

    it('hides "Empezar" when live is false (retro editor) but keeps "Registrar tiempo"', async () => {
      const wrapper = mountCardio({ live: false })
      await flushPromises()
      expect(wrapper.find('[data-testid="cardio-start-30"]').exists()).toBe(false)
      expect(wrapper.find('[data-testid="cardio-log-30"]').exists()).toBe(true)
    })

    it('keeps "Empezar" with restEnabled off (the auto-rest toggle no longer gates the countdown)', async () => {
      const wrapper = mountCardio({ restEnabled: false })
      await flushPromises()
      expect(wrapper.find('[data-testid="cardio-start-30"]').exists()).toBe(true)
    })

    // v0.11.5 (zurdi: "cuando se inicia un ejercicio de cardio se tiene que
    // poder elegir cuánto tiempo vas a hacer ese cardio")
    describe('start duration picker', () => {
      it('"Empezar" opens the picker instead of starting the countdown straight away', async () => {
        const wrapper = mountCardio()
        await flushPromises()

        await wrapper.get('[data-testid="cardio-start-30"]').trigger('click')
        await flushPromises()

        expect(document.body.querySelector('[data-testid="cardio-duration-picker"]')).not.toBeNull()
        expect(wrapper.find('[data-testid="resumed-cardio-countdown-30"]').exists()).toBe(false)
        expect(localStorage.getItem('berserk:cardio-countdown')).toBeNull()
      })

      it('the picker opens on the target the button announces (20:00 with no history)', async () => {
        const wrapper = mountCardio()
        await flushPromises()

        await wrapper.get('[data-testid="cardio-start-30"]').trigger('click')
        await flushPromises()

        expect(byTestId('cardio-duration-preset-20').attributes('aria-pressed')).toBe('true')
        expect(byTestId('cardio-start-confirm').text()).toContain('20:00')
      })

      it('dismissing the picker starts nothing', async () => {
        const wrapper = mountCardio()
        await flushPromises()
        await wrapper.get('[data-testid="cardio-start-30"]').trigger('click')
        await flushPromises()

        // click en el backdrop del sheet = cerrar
        ;(document.body.querySelector('.bg-scrim') as HTMLElement).click()
        await flushPromises()

        expect(localStorage.getItem('berserk:cardio-countdown')).toBeNull()
        expect(wrapper.find('[data-testid="resumed-cardio-countdown-30"]').exists()).toBe(false)
      })

      it('the chosen duration drives the whole run: countdown, persistence and the auto-logged set', async () => {
        const actions = makeActions({
          logSet: vi.fn(async () => ({
            set: { id: 1, set_number: 1, reps: null, weight_kg: null, duration_seconds: 900, distance_m: null, is_warmup: false, rpe: null, completed_at: 'x' },
            new_records: [],
          })),
        })
        const wrapper = mountCardio({ actions, workoutId: 7 })
        await flushPromises()

        await wrapper.get('[data-testid="cardio-start-30"]').trigger('click')
        await flushPromises()
        await byTestId('cardio-duration-preset-15').trigger('click')
        await flushPromises()
        await byTestId('cardio-start-confirm').trigger('click')
        await flushPromises()

        expect(wrapper.get('[data-testid="cardio-countdown-label"]').text()).toBe('15:00')
        expect(JSON.parse(localStorage.getItem('berserk:cardio-countdown')!).targetSeconds).toBe(900)

        vi.advanceTimersByTime(900_000)
        await flushPromises()
        vi.advanceTimersByTime(1_200)
        await flushPromises()

        expect(actions.logSet).toHaveBeenCalledWith(30, expect.objectContaining({ duration_seconds: 900 }))
      })

      it('the picker stepper fine-tunes in 30s steps over the preset', async () => {
        const wrapper = mountCardio({ workoutId: 7 })
        await flushPromises()

        await wrapper.get('[data-testid="cardio-start-30"]').trigger('click')
        await flushPromises()
        await byTestId('cardio-duration-preset-5').trigger('click')
        await flushPromises()
        const plus = document.body.querySelector('[data-testid="cardio-duration-picker"] button[aria-label="Aumentar"]') as HTMLElement
        plus.dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 0 }))
        await flushPromises()
        await byTestId('cardio-start-confirm').trigger('click')
        await flushPromises()

        expect(JSON.parse(localStorage.getItem('berserk:cardio-countdown')!).targetSeconds).toBe(330)
      })
    })

    it('starting the countdown and letting it reach zero auto-logs the set after the finish hold, without rest', async () => {
      const actions = makeActions({
        logSet: vi.fn(async () => ({
          set: { id: 1, set_number: 1, reps: null, weight_kg: null, duration_seconds: 60, distance_m: null, is_warmup: false, rpe: null, completed_at: 'x' },
          new_records: [],
        })),
      })
      const restTimer = useRestTimerStore()
      const startSpy = vi.spyOn(restTimer, 'start')
      const wrapper = mountCardio({ actions })
      await flushPromises()

      // sin historial, el objetivo por defecto es 20:00 (1200s)
      await startCardio(wrapper)
      expect(wrapper.find('[data-testid="resumed-cardio-countdown-30"]').exists()).toBe(true)

      vi.advanceTimersByTime(1_200_000)
      await flushPromises()
      vi.advanceTimersByTime(1_200)
      await flushPromises()

      expect(actions.logSet).toHaveBeenCalledWith(30, expect.objectContaining({ duration_seconds: 1200 }))
      // v0.9.4: cardio no descansa — ni siquiera al auto-registrarse
      expect(startSpy).not.toHaveBeenCalled()
    })

    describe('CARDIO-COUNTDOWN PERSISTENCE: persist on start / clear on cancel / clear on complete', () => {
      it('persists {endsAt, workoutId, workoutExerciseId, targetSeconds} to localStorage when the card countdown starts', async () => {
        const wrapper = mountCardio({ workoutId: 7 })
        await flushPromises()

        await startCardio(wrapper)

        const raw = localStorage.getItem('berserk:cardio-countdown')
        expect(raw).not.toBeNull()
        const persisted = JSON.parse(raw!)
        expect(persisted).toMatchObject({ workoutId: 7, workoutExerciseId: 30, targetSeconds: 1200 })
        expect(persisted.endsAt).toBeGreaterThan(Date.now())
      })

      it('does not persist nor start when workoutId is not provided (defensive: no orphaned entry)', async () => {
        const wrapper = mountCardio({ workoutId: undefined })
        await flushPromises()

        await startCardio(wrapper)

        expect(localStorage.getItem('berserk:cardio-countdown')).toBeNull()
        expect(wrapper.find('[data-testid="resumed-cardio-countdown-30"]').exists()).toBe(false)
      })

      it('cancelling the countdown clears the persisted state', async () => {
        const wrapper = mountCardio()
        await flushPromises()
        await startCardio(wrapper)
        expect(localStorage.getItem('berserk:cardio-countdown')).not.toBeNull()

        await byTestId('cardio-countdown-cancel').trigger('click')
        await flushPromises()

        expect(localStorage.getItem('berserk:cardio-countdown')).toBeNull()
      })

      it('completing the countdown (reaching zero) clears the persisted state', async () => {
        const actions = makeActions({
          logSet: vi.fn(async () => ({
            set: { id: 1, set_number: 1, reps: null, weight_kg: null, duration_seconds: 60, distance_m: null, is_warmup: false, rpe: null, completed_at: 'x' },
            new_records: [],
          })),
        })
        const wrapper = mountCardio({ actions })
        await flushPromises()
        await startCardio(wrapper)
        expect(localStorage.getItem('berserk:cardio-countdown')).not.toBeNull()

        // objetivo por defecto (1200s) + el hold del estado de fin
        vi.advanceTimersByTime(1_200_000)
        await flushPromises()
        vi.advanceTimersByTime(1_200)
        await flushPromises()

        expect(localStorage.getItem('berserk:cardio-countdown')).toBeNull()
      })

      it('a manual (drawer) cardio log also clears a persisted countdown for this exercise (never leaves a zombie entry)', async () => {
        const actions = makeActions()
        const wrapper = mountCardio({ actions })
        await flushPromises()
        // countdown persistido "en vuelo" simulado a mano; luego se loguea
        // manualmente por el cajón antes de que termine — debe limpiarse
        localStorage.setItem('berserk:cardio-countdown', JSON.stringify({
          endsAt: Date.now() + 600_000, workoutId: 1, workoutExerciseId: 30, targetSeconds: 1200,
        }))

        await wrapper.get('[data-testid="cardio-log-30"]').trigger('click')
        await flushPromises()
        const form = document.body.querySelector('form') as HTMLFormElement
        form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
        await flushPromises()

        expect(localStorage.getItem('berserk:cardio-countdown')).toBeNull()
      })
    })

    describe('CARDIO-COUNTDOWN PERSISTENCE: resumed surface (endsAt still in the future)', () => {
      const resumed = { endsAt: 0, workoutId: 1, workoutExerciseId: 30, targetSeconds: 1800, distanceM: 5000 }

      it('renders the resumed countdown at the correct remaining time, and hides the inline form while it runs', async () => {
        const wrapper = mountCardio({ resumedCountdown: { ...resumed, endsAt: Date.now() + 600_000 } })
        await flushPromises()
        expect(wrapper.get('[data-testid="cardio-countdown-label"]').text()).toBe('10:00')
        expect(wrapper.find('[data-testid="cardio-actions-30"]').exists()).toBe(false)
      })

      it('ignores a resumedCountdown for a DIFFERENT workoutExerciseId (no cross-exercise leakage)', async () => {
        const wrapper = mountCardio({
          resumedCountdown: { ...resumed, workoutExerciseId: 999, endsAt: Date.now() + 600_000 },
        })
        await flushPromises()
        expect(wrapper.find('[data-testid="cardio-countdown"]').exists()).toBe(false)
        expect(wrapper.find('[data-testid="cardio-actions-30"]').exists()).toBe(true)
      })

      it('letting the resumed countdown reach zero logs the set with the persisted duration/distance, without rest, and clears storage', async () => {
        const actions = makeActions({
          logSet: vi.fn(async () => ({
            set: { id: 1, set_number: 1, reps: null, weight_kg: null, duration_seconds: 1800, distance_m: 5000, is_warmup: false, rpe: null, completed_at: 'x' },
            new_records: [],
          })),
        })
        const restTimer = useRestTimerStore()
        const startSpy = vi.spyOn(restTimer, 'start')
        localStorage.setItem('berserk:cardio-countdown', JSON.stringify({ ...resumed, endsAt: Date.now() + 5_000 }))

        const wrapper = mountCardio({ actions, resumedCountdown: { ...resumed, endsAt: Date.now() + 5_000 } })
        // 5s restantes + el hold del estado de fin (v0.9.4) antes del submit
        vi.advanceTimersByTime(5_000)
        await flushPromises()
        vi.advanceTimersByTime(1_200)
        await flushPromises()

        expect(actions.logSet).toHaveBeenCalledWith(30, expect.objectContaining({ duration_seconds: 1800, distance_m: 5000 }))
        // v0.9.4 (zurdi): cardio no descansa — tampoco el countdown resumido
        expect(startSpy).not.toHaveBeenCalled()
        expect(localStorage.getItem('berserk:cardio-countdown')).toBeNull()
        expect(wrapper.find('[data-testid="cardio-countdown"]').exists()).toBe(false)
        expect(wrapper.find('[data-testid="cardio-actions-30"]').exists()).toBe(true)
      })

      it('cancelling the resumed countdown clears storage WITHOUT logging', async () => {
        const actions = makeActions()
        localStorage.setItem('berserk:cardio-countdown', JSON.stringify({ ...resumed, endsAt: Date.now() + 600_000 }))

        const wrapper = mountCardio({ actions, resumedCountdown: { ...resumed, endsAt: Date.now() + 600_000 } })
        await flushPromises()
        await wrapper.get('[data-testid="cardio-countdown-cancel"]').trigger('click')
        await flushPromises()

        expect(actions.logSet).not.toHaveBeenCalled()
        expect(localStorage.getItem('berserk:cardio-countdown')).toBeNull()
        expect(wrapper.find('[data-testid="cardio-actions-30"]').exists()).toBe(true)
      })
    })
  })

  describe('item 11: rest control', () => {
    it('shows the effective rest (workout override > routine target > default) and toggles a preset picker', async () => {
      mountCard({ routines, routineId: 1 })
      await openMenu(20)
      expect(byTestId('rest-toggle-20').text()).toContain('120')

      expect(byTestId('rest-picker-20').exists()).toBe(false)
      await byTestId('rest-toggle-20').trigger('click')
      expect(byTestId('rest-picker-20').exists()).toBe(true)
    })

    it('picking a preset calls actions.setExerciseRest with that value', async () => {
      const actions = makeActions()
      mountCard({ actions })
      await openMenu(20)
      await byTestId('rest-toggle-20').trigger('click')

      await byTestId('rest-preset-20-120').trigger('click')
      await flushPromises()

      expect(actions.setExerciseRest).toHaveBeenCalledWith(20, 120)
    })

    // item 7 (v0.4.3, zurdi): entrada manual (stepper) JUNTO a los presets —
    // un gimnasta puede querer un valor entre saltos de 30 (p.ej. 95s)
    it('item 7: the picker also shows a manual stepper (step 5, bounds 5-900) that calls setExerciseRest with the exact resulting seconds, without closing the picker', async () => {
      const actions = makeActions()
      const wrapper = mountCard({ actions })
      await openMenu(20)
      await byTestId('rest-toggle-20').trigger('click')

      const manual = byTestId('rest-manual-20')
      // el stepper del descanso es el ÚNICO BkStepper montado (el cajón de
      // series está cerrado), así que se localiza por el árbol de componentes
      // (findComponent atraviesa el Teleport del sheet; el DOM no)
      const stepper = wrapper.findComponent({ name: 'BkStepper' })
      expect(stepper.props('step')).toBe(5)
      expect(stepper.props('min')).toBe(5)
      expect(stepper.props('max')).toBe(900)
      // valor de arranque: el descanso EFECTIVO actual (60, default sin
      // override ni rutina), no un 0/vacío desconectado del resto del picker
      expect(stepper.props('modelValue')).toBe(60)

      const plusButton = manual.findAll('button').find((b) => b.attributes('aria-label') === 'Aumentar')!
      await plusButton.trigger('pointerdown')
      await plusButton.trigger('pointerup')
      await flushPromises()

      expect(actions.setExerciseRest).toHaveBeenCalledWith(20, 65)
      // a diferencia de un preset, el stepper NO cierra el picker (se pulsa
      // varias veces seguidas para afinar)
      expect(byTestId('rest-picker-20').exists()).toBe(true)
    })

    it('reflects the workout exercise override over the routine target', async () => {
      const overridden = { ...pushExercise, rest_seconds: 60 }
      mountCard({ workoutExercise: overridden, routines, routineId: 1 })
      await openMenu(20)
      expect(byTestId('rest-toggle-20').text()).toContain('60')
    })

    it('is hidden entirely when restEnabled is false (retro editor)', async () => {
      mountCard({ restEnabled: false })
      await openMenu(20)
      expect(byTestId('rest-toggle-20').exists()).toBe(false)
    })
  })

  it('logs a set and starts the rest timer with the default 60s AND the exercise name for a free workout', async () => {
    const actions = makeActions()
    const restTimer = useRestTimerStore()
    const startSpy = vi.spyOn(restTimer, 'start')

    mountCard({ actions, routines: [], routineId: null })
    await openDrawer(20)
    await drawerForm().trigger('submit')
    await flushPromises()

    expect(startSpy).toHaveBeenCalledWith(60, 'Press banca', undefined)
  })

  it('starts the rest timer with the routine rest_seconds when the workout came from a routine', async () => {
    const actions = makeActions()
    const restTimer = useRestTimerStore()
    const startSpy = vi.spyOn(restTimer, 'start')

    mountCard({ actions, routines, routineId: 1 })
    await openDrawer(20)
    await drawerForm().trigger('submit')
    await flushPromises()

    expect(startSpy).toHaveBeenCalledWith(120, 'Press banca', undefined)
  })

  it('does not start the rest timer when restEnabled is false (retro editor)', async () => {
    const actions = makeActions()
    const restTimer = useRestTimerStore()
    const startSpy = vi.spyOn(restTimer, 'start')

    mountCard({ actions, restEnabled: false })
    await openDrawer(20)
    await drawerForm().trigger('submit')
    await flushPromises()

    expect(actions.logSet).toHaveBeenCalled()
    expect(startSpy).not.toHaveBeenCalled()
  })

  it('emits recorded AND logged(true) so the retro editor can toast instead of celebrating, and the live view can skip the neon pulse', async () => {
    const actions = makeActions({
      logSet: vi.fn(async () => ({
        set: { id: 101, set_number: 1, reps: 8, weight_kg: 20, duration_seconds: null, distance_m: null, is_warmup: false, rpe: null, completed_at: 'x' },
        new_records: [{ id: 9, exercise_id: 5, kind: 'max_weight', value: 100, achieved_at: 'x' }],
      })),
    })
    const wrapper = mountCard({ actions, restEnabled: false })

    await openDrawer(20)
    await drawerForm().trigger('submit')
    await flushPromises()

    expect(wrapper.emitted('recorded')).toBeTruthy()
    expect(wrapper.emitted('recorded')![0][0]).toEqual([
      { id: 9, exercise_id: 5, kind: 'max_weight', value: 100, achieved_at: 'x' },
    ])
    expect(wrapper.emitted('logged')![0]).toEqual([true])
  })

  it('emits logged(false) for an ordinary set with no new records', async () => {
    const actions = makeActions()
    const wrapper = mountCard({ actions, restEnabled: false })

    await openDrawer(20)
    await drawerForm().trigger('submit')
    await flushPromises()

    expect(wrapper.emitted('logged')![0]).toEqual([false])
  })

  // facelift: borrar la serie vive en el PIE del cajón de edición (la fila
  // ya no lleva icono) — tocar la fila abre el cajón, y ahí se borra
  it('deletes a set via actions.deleteSet after confirming with a real click', async () => {
    const actions = makeActions()
    mountCard({ actions })

    await byTestId('edit-set-1').trigger('click')
    await flushPromises()
    await byTestId('delete-set-1').trigger('click')
    await flushPromises()
    expect(actions.deleteSet).not.toHaveBeenCalled()

    await byTestId('confirm-delete-set-1').trigger('click')
    await flushPromises()

    expect(actions.deleteSet).toHaveBeenCalledWith(20, 1)
  })

  it('cancelling the delete-set confirm never calls actions.deleteSet', async () => {
    const actions = makeActions()
    mountCard({ actions })

    await byTestId('edit-set-1').trigger('click')
    await flushPromises()
    await byTestId('delete-set-1').trigger('click')
    await flushPromises()

    await byTestId('cancel-delete-set-1').trigger('click')
    await flushPromises()

    expect(actions.deleteSet).not.toHaveBeenCalled()
    // el cancelar debe devolver el botón de borrar, no dejar el pie colgado en confirmación
    expect(byTestId('delete-set-1').exists()).toBe(true)
  })

  describe('item 7: confirm/cancel swap animation', () => {
    // VTU stubea <Transition> por defecto: hay que desactivarlo para ver la
    // clase real (mismo patrón que BkSelect.spec.ts) — cheap/estructural:
    // solo confirma que el swap vive dentro de la Transition con el nombre
    // correcto, no la coreografía CSS en sí
    function mountReal(overrides: Partial<Record<string, unknown>> = {}) {
      const actions = (overrides.actions as ReturnType<typeof makeActions>) ?? makeActions()
      return mount(WorkoutExerciseCard, {
        props: {
          workoutExercise: pushExercise as never,
          exercise: exercise as never,
          muscleGroups: muscleGroups as never,
          routines: [] as never,
          routineId: null,
          exerciseIds: [20],
          units: 'kg',
          locale: 'es',
          ...overrides,
          actions,
        },
        global: { plugins: [createI18nInstance()], stubs: { transition: false } },
        attachTo: document.body,
      })
    }

    it('the delete-set swap enters via bk-pop-soft when confirming', async () => {
      const wrapper = mountReal()
      await byTestId('edit-set-1').trigger('click')
      await flushPromises()
      await byTestId('delete-set-1').trigger('click')
      await flushPromises()

      const confirmBtn = document.querySelector('[data-testid="confirm-delete-set-1"]')
      expect(confirmBtn?.closest('.bk-pop-soft-enter-active, [class*="bk-pop-soft"]')).not.toBeNull()
      wrapper.unmount()
    })

    it('the remove-exercise swap enters via bk-pop-soft when confirming', async () => {
      const wrapper = mountReal()
      await byTestId('exercise-menu-20').trigger('click')
      await flushPromises()
      await byTestId('remove-exercise-20').trigger('click')
      await flushPromises()

      const confirmBtn = document.querySelector('[data-testid="confirm-remove-exercise-20"]')
      expect(confirmBtn?.closest('.bk-pop-soft-enter-active, [class*="bk-pop-soft"]')).not.toBeNull()
      wrapper.unmount()
    })
  })

  it('removes the exercise via actions.removeExercise after confirming with a real click', async () => {
    const actions = makeActions()
    mountCard({ actions })

    await openMenu(20)
    await byTestId('remove-exercise-20').trigger('click')
    await flushPromises()
    expect(actions.removeExercise).not.toHaveBeenCalled()

    await byTestId('confirm-remove-exercise-20').trigger('click')
    await flushPromises()

    expect(actions.removeExercise).toHaveBeenCalledWith(20)
  })

  // v0.11.5 (zurdi: "ya que aún no se ha registrado nada, ese botón debería
  // cancelar directamente"): confirmar solo protege trabajo ya hecho
  it('removes an exercise with no logged sets straight away, without the confirm step', async () => {
    const actions = makeActions()
    mountCard({
      workoutExercise: cardioWorkoutExercise,
      exercise: cardioExercise,
      exerciseIds: [30],
      actions,
    })
    await flushPromises()

    await openMenu(30)
    await byTestId('remove-exercise-30').trigger('click')
    await flushPromises()

    expect(actions.removeExercise).toHaveBeenCalledWith(30)
    expect(byTestId('confirm-remove-exercise-30').exists()).toBe(false)
  })

  it('still asks for confirmation once something is logged (the sets, not the measurement, decide)', async () => {
    const actions = makeActions()
    mountCard({
      workoutExercise: {
        ...cardioWorkoutExercise,
        sets: [{ id: 9, set_number: 1, reps: null, weight_kg: null, duration_seconds: 600, distance_m: null, is_warmup: false, rpe: null, completed_at: 'x' }],
      },
      exercise: cardioExercise,
      exerciseIds: [30],
      actions,
    })
    await flushPromises()

    await openMenu(30)
    await byTestId('remove-exercise-30').trigger('click')
    await flushPromises()

    expect(actions.removeExercise).not.toHaveBeenCalled()
    expect(byTestId('confirm-remove-exercise-30').exists()).toBe(true)
  })

  it('reorders via actions.reorder with the full id list when moving down', async () => {
    const actions = makeActions()
    mountCard({ actions, exerciseIds: [20, 30] })

    await openMenu(20)
    await byTestId('move-down-20').trigger('click')
    await flushPromises()

    expect(actions.reorder).toHaveBeenCalledWith([30, 20])
  })

  it('hides the move-up control on the first exercise', async () => {
    mountCard({ exerciseIds: [20, 30] })
    await openMenu(20)
    expect(byTestId('move-up-20').exists()).toBe(false)
    expect(byTestId('move-down-20').exists()).toBe(true)
  })

  // facelift: GHOST ROWS — las series pendientes del objetivo de rutina como
  // filas con check de un toque (el gesto central del rediseño)
  describe('facelift: ghost rows + one-tap check', () => {
    it('renders max(0, target−efectivas) ghosts from the routine target, with the check only on the first', async () => {
      mountCard({ routines, routineId: 1 })
      await flushPromises()
      // target 3, 1 efectiva → 2 ghosts
      expect(byTestId('ghost-set-20-0').exists()).toBe(true)
      expect(byTestId('ghost-set-20-1').exists()).toBe(true)
      expect(byTestId('ghost-set-20-2').exists()).toBe(false)
      expect(byTestId('ghost-check-20').exists()).toBe(true)
    })

    it('a free exercise (no routine target) renders exactly one ghost', async () => {
      mountCard()
      await flushPromises()
      expect(byTestId('ghost-set-20-0').exists()).toBe(true)
      expect(byTestId('ghost-set-20-1').exists()).toBe(false)
    })

    it('tapping the check logs the prefilled defaults through actions.logSet (same path as the drawer: emits logged)', async () => {
      const actions = makeActions()
      const wrapper = mountCard({ actions, routines, routineId: 1, restEnabled: false })
      await flushPromises()

      await byTestId('ghost-check-20').trigger('click')
      await flushPromises()

      // prefill = última serie EFECTIVA de la sesión (5 × 100), item 2
      expect(actions.logSet).toHaveBeenCalledWith(20, {
        is_warmup: false,
        reps: 5,
        weight_kg: 100,
        load_mode: 'weight',
      })
      expect(wrapper.emitted('logged')![0]).toEqual([false])
    })

    it('tapping the ghost ROW opens the drawer instead of logging blind', async () => {
      mountCard({ routines, routineId: 1 })
      await flushPromises()
      expect(document.body.querySelector('form')).toBeNull()

      await byTestId('ghost-set-20-0').find('button').trigger('click')
      await flushPromises()
      expect(document.body.querySelector('form')).not.toBeNull()
    })

    it('facelift v2: unchecking a logged set deletes it through actions.deleteSet', async () => {
      const actions = makeActions()
      mountCard({ actions })
      await flushPromises()

      await byTestId('uncheck-set-1').trigger('click')
      await flushPromises()

      expect(actions.deleteSet).toHaveBeenCalledWith(20, 1)
    })

    it('cardio never renders ghosts (its model is the two actions)', async () => {
      mountCard({ workoutExercise: cardioWorkoutExercise, exercise: cardioExercise, exerciseIds: [30] })
      await flushPromises()
      expect(byTestId('ghost-set-30-0').exists()).toBe(false)
    })
  })

  it('a rejected reorder (move-down) surfaces a toast instead of failing silently', async () => {
    const toast = useToastStore()
    const actions = makeActions({ reorder: vi.fn().mockRejectedValueOnce(new Error('conflict')) })

    mountCard({ actions, exerciseIds: [20, 30] })
    await openMenu(20)
    await byTestId('move-down-20').trigger('click')
    await flushPromises()

    expect(toast.toasts.length).toBeGreaterThan(0)
  })

  // v0.12.0 (backlog "notas por ejercicio"): la nota persistente carga con la
  // card, la línea entera abre el sheet de edición y guardar pasa por actions
  describe('v0.12.0: per-exercise note', () => {
    it('shows the loaded note on the card (and the add affordance when empty)', async () => {
      document.body.innerHTML = ''
      const actions = makeActions({ exerciseNote: vi.fn(async () => 'asiento en el 5') })
      const wrapper = mountCard({ actions })
      await flushPromises()
      expect(wrapper.get('[data-testid="exercise-note-20"]').text()).toContain('asiento en el 5')

      const empty = mountCard({})
      await flushPromises()
      expect(empty.get('[data-testid="exercise-note-20"]').text()).toContain('Añadir nota')
    })

    it('editing through the sheet saves via actions and updates the line', async () => {
      document.body.innerHTML = ''
      const actions = makeActions()
      const wrapper = mountCard({ actions })
      await flushPromises()

      await wrapper.get('[data-testid="exercise-note-20"]').trigger('click')
      await flushPromises()
      const input = document.querySelector('[data-testid="note-input"]') as HTMLTextAreaElement
      input.value = 'agarre ancho'
      input.dispatchEvent(new Event('input', { bubbles: true }))
      await flushPromises()
      ;(document.querySelector('[data-testid="note-save"]') as HTMLElement).click()
      await flushPromises()

      expect(actions.saveExerciseNote).toHaveBeenCalledWith(5, 'agarre ancho')
      expect(wrapper.get('[data-testid="exercise-note-20"]').text()).toContain('agarre ancho')
    })
  })
})

// v0.5.0 superseries: la tarjeta recibe el agrupado YA resuelto (label /
// last / next, computado por WorkoutView vía lib/supersets.ts) — aquí se
// prueba el contrato de la tarjeta: gating del auto-descanso y chips
describe('v0.5.0 superseries: rest gating and chips', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  afterEach(() => {
    document.body.innerHTML = ''
  })

  it('a NON-last group member logs the set but NEVER starts the rest timer (it chains into the next member)', async () => {
    const actions = makeActions()
    const restTimer = useRestTimerStore()
    const startSpy = vi.spyOn(restTimer, 'start')

    const wrapper = mountCard({ actions, supersetLabel: 'A', supersetLast: false })
    await openDrawer(20)
    await drawerForm().trigger('submit')
    await flushPromises()

    expect(actions.logSet).toHaveBeenCalled()
    expect(startSpy).not.toHaveBeenCalled()
    // la serie sigue emitiendo logged: el pulso neón y el marcado de
    // "siguiente" en la vista no dependen del descanso
    expect(wrapper.emitted('logged')).toBeTruthy()
  })

  it('the LAST group member starts the rest timer normally when logging (the round is closed)', async () => {
    const actions = makeActions()
    const restTimer = useRestTimerStore()
    const startSpy = vi.spyOn(restTimer, 'start')

    mountCard({ actions, supersetLabel: 'A', supersetLast: true })
    await openDrawer(20)
    await drawerForm().trigger('submit')
    await flushPromises()

    expect(startSpy).toHaveBeenCalledWith(60, 'Press banca', undefined)
  })

  it('a loose exercise (default props: no label) keeps firing auto-rest — only group members are gated', async () => {
    const actions = makeActions()
    const restTimer = useRestTimerStore()
    const startSpy = vi.spyOn(restTimer, 'start')

    mountCard({ actions })
    await openDrawer(20)
    await drawerForm().trigger('submit')
    await flushPromises()

    expect(startSpy).toHaveBeenCalledWith(60, 'Press banca', undefined)
  })

  // v0.7.0 (feedback de zurdi): chip y acento del grupo suben al CONTENEDOR
  // del bloque en WorkoutView — la card NO pinta nada de superserie propio
  // aunque esté agrupada (supersetLabel solo gobierna el gating del descanso)
  it('v0.7.0: a grouped card renders NO chip nor side-frame of its own (the block container carries them)', () => {
    const wrapper = mountCard({ supersetLabel: 'A' })
    expect(wrapper.find('[data-testid="superset-chip-20"]').exists()).toBe(false)
    expect(wrapper.classes()).not.toContain('border-l-2')
  })

  it('renders no superset chip nor frame for a loose card', () => {
    const wrapper = mountCard()
    expect(wrapper.find('[data-testid="superset-chip-20"]').exists()).toBe(false)
    expect(wrapper.classes()).not.toContain('border-l-2')
  })

  it('shows the "Siguiente" chip only when supersetNext is set', () => {
    const without = mountCard({ supersetLabel: 'A' })
    expect(without.find('[data-testid="superset-next-20"]').exists()).toBe(false)
    without.unmount()

    const withNext = mountCard({ supersetLabel: 'A', supersetNext: true })
    expect(withNext.get('[data-testid="superset-next-20"]').text()).toBe('Siguiente')
  })

  // v0.9.1 (zurdi: "el descanso debería estar solo al final de la
  // superserie"): el control de descanso ENTERO se esconde en los miembros
  // no finales — el descanso es de la ronda, y la ronda la cierra el último
  it('v0.9.1: the rest control is hidden on a non-last member and present on the last one', async () => {
    const nonLast = mountCard({ supersetLabel: 'A', supersetLast: false })
    await openMenu(20)
    expect(byTestId('rest-toggle-20').exists()).toBe(false)
    nonLast.unmount()
    document.body.innerHTML = ''

    mountCard({ supersetLabel: 'A', supersetLast: true })
    await openMenu(20)
    expect(byTestId('rest-toggle-20').exists()).toBe(true)
  })
})

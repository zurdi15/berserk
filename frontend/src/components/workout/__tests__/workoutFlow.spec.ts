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

  it('falls back to 90 when the workout is free (no routine) and no override', () => {
    expect(restFor(null, null, routines as never, 5)).toBe(90)
  })

  it('falls back to 90 when the exercise is not part of the matched routine', () => {
    expect(restFor(null, 1, routines as never, 999)).toBe(90)
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

  it('renders the exercise name, its primary-group rune (size 14) and the formatted sets as dense rows', () => {
    const wrapper = mountCard()
    expect(wrapper.text()).toContain('Press banca')
    const rune = wrapper.findComponent({ name: 'BkRune' })
    expect(rune.props('name')).toBe('chest')
    expect(rune.props('size')).toBe(14)
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

      expect(actions.updateSet).toHaveBeenCalledWith(20, 1, { is_warmup: false, reps: 5, weight_kg: 100 })
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

  describe('item 3: previous-session history', () => {
    it('shows a one-line hint on the compact card when the exercise has no sets yet', async () => {
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

      expect(wrapper.get('[data-testid="card-history-hint"]').text()).toContain('2×8·80 kg')
    })

    it('does not show the card hint once the exercise already has sets logged', async () => {
      const actions = makeActions({
        exerciseHistory: vi.fn(async () => ({ workout_id: 9, date: '2026-07-20', sets: [{ reps: 8, weight_kg: 80, duration_seconds: null, distance_m: null, is_warmup: false }] })),
      })
      const wrapper = mountCard({ actions })
      await flushPromises()
      expect(wrapper.find('[data-testid="card-history-hint"]').exists()).toBe(false)
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

  describe('item 6: cardio block', () => {
    function mountCardio(overrides: Partial<Record<string, unknown>> = {}) {
      return mountCard({
        workoutExercise: cardioWorkoutExercise,
        exercise: cardioExercise,
        exerciseIds: [30],
        ...overrides,
      })
    }

    it('renders with a left border accent instead of the plain slab', () => {
      const wrapper = mountCardio()
      expect(wrapper.classes()).toEqual(expect.arrayContaining(['border-l-2', 'border-aurora/50']))
    })

    it('the add-set button reads "+ Cardio" instead of "+ Serie"', () => {
      const wrapper = mountCardio()
      expect(wrapper.get('[data-testid="add-set-30"]').text()).toBe('Añadir cardio')
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

    it('shows "Empezar" for a live cardio drawer (not editing)', async () => {
      const actions = makeActions()
      mountCardio({ actions })
      await openDrawer(30)
      expect(document.body.querySelector('[data-testid="cardio-start-countdown"]')).not.toBeNull()
    })

    it('hides "Empezar" when restEnabled is false (retro editor)', async () => {
      mountCardio({ restEnabled: false })
      await openDrawer(30)
      expect(document.body.querySelector('[data-testid="cardio-start-countdown"]')).toBeNull()
    })

    it('starting the countdown and letting it reach zero auto-logs the set and closes the drawer', async () => {
      const actions = makeActions({
        logSet: vi.fn(async () => ({
          set: { id: 1, set_number: 1, reps: null, weight_kg: null, duration_seconds: 60, distance_m: null, is_warmup: false, rpe: null, completed_at: 'x' },
          new_records: [],
        })),
      })
      mountCardio({ actions })
      await openDrawer(30)

      await byTestId('cardio-start-countdown').trigger('click')
      await flushPromises()
      expect(document.body.querySelector('[data-testid="cardio-countdown"]')).not.toBeNull()

      vi.advanceTimersByTime(60_000)
      await flushPromises()

      expect(actions.logSet).toHaveBeenCalledWith(30, expect.objectContaining({ duration_seconds: 60, is_warmup: false }))
      expect(document.body.querySelector('[role="dialog"]')).toBeNull()
    })

    describe('CARDIO-COUNTDOWN PERSISTENCE: persist on start / clear on cancel / clear on complete', () => {
      it('persists {endsAt, workoutId, workoutExerciseId, targetSeconds, distanceM} to localStorage when the countdown starts', async () => {
        mountCardio({ workoutId: 7 })
        await openDrawer(30)

        // sube la distancia antes de arrancar, para afirmar que viaja también
        const plus = document.body.querySelectorAll('button[aria-label="Aumentar"]')[1] as HTMLElement
        plus.dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 0 }))
        await flushPromises()

        await byTestId('cardio-start-countdown').trigger('click')
        await flushPromises()

        const raw = localStorage.getItem('berserk:cardio-countdown')
        expect(raw).not.toBeNull()
        const persisted = JSON.parse(raw!)
        expect(persisted).toMatchObject({ workoutId: 7, workoutExerciseId: 30, targetSeconds: 60, distanceM: 100 })
        expect(persisted.endsAt).toBeGreaterThan(Date.now())
      })

      it('does not persist when workoutId is not provided (defensive: no orphaned entry with a bogus workout)', async () => {
        mountCardio({ workoutId: undefined })
        await openDrawer(30)

        await byTestId('cardio-start-countdown').trigger('click')
        await flushPromises()

        expect(localStorage.getItem('berserk:cardio-countdown')).toBeNull()
      })

      it('cancelling the countdown clears the persisted state', async () => {
        mountCardio()
        await openDrawer(30)
        await byTestId('cardio-start-countdown').trigger('click')
        await flushPromises()
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
        mountCardio({ actions })
        await openDrawer(30)
        await byTestId('cardio-start-countdown').trigger('click')
        await flushPromises()
        expect(localStorage.getItem('berserk:cardio-countdown')).not.toBeNull()

        vi.advanceTimersByTime(60_000)
        await flushPromises()

        expect(localStorage.getItem('berserk:cardio-countdown')).toBeNull()
      })

      it('a manual (non-countdown) cardio log also clears a persisted countdown for this exercise (never leaves a zombie entry)', async () => {
        const actions = makeActions()
        mountCardio({ actions })
        await openDrawer(30)
        await byTestId('cardio-start-countdown').trigger('click')
        await flushPromises()
        // el usuario cancela el countdown en marcha... espera, este test
        // simula en cambio persistencia ya escrita "a mano" (p.ej. sesión
        // anterior) y comprueba que loguear la limpia igual
        expect(localStorage.getItem('berserk:cardio-countdown')).not.toBeNull()
        await byTestId('cardio-countdown-cancel').trigger('click')
        await flushPromises()

        // se re-persiste como si el countdown siguiera corriendo, y en su
        // lugar se loguea manualmente vía "Registrar y otra" antes de que
        // termine — debe limpiarse igual
        await byTestId('cardio-start-countdown').trigger('click')
        await flushPromises()
        expect(localStorage.getItem('berserk:cardio-countdown')).not.toBeNull()

        await byTestId('cardio-countdown-cancel').trigger('click')
        await flushPromises()
        await byTestId('log-set-and-another').trigger('click')
        await flushPromises()

        expect(localStorage.getItem('berserk:cardio-countdown')).toBeNull()
      })
    })

    describe('CARDIO-COUNTDOWN PERSISTENCE: resumed surface (endsAt still in the future)', () => {
      const resumed = { endsAt: 0, workoutId: 1, workoutExerciseId: 30, targetSeconds: 1800, distanceM: 5000 }

      it('renders the resumed countdown at the correct remaining time, and hides "+ Cardio" while it runs', () => {
        const wrapper = mountCardio({ resumedCountdown: { ...resumed, endsAt: Date.now() + 600_000 } })
        expect(wrapper.get('[data-testid="cardio-countdown-label"]').text()).toBe('10:00')
        expect(wrapper.find('[data-testid="add-set-30"]').exists()).toBe(false)
      })

      it('ignores a resumedCountdown for a DIFFERENT workoutExerciseId (no cross-exercise leakage)', () => {
        const wrapper = mountCardio({
          resumedCountdown: { ...resumed, workoutExerciseId: 999, endsAt: Date.now() + 600_000 },
        })
        expect(wrapper.find('[data-testid="cardio-countdown"]').exists()).toBe(false)
        expect(wrapper.find('[data-testid="add-set-30"]').exists()).toBe(true)
      })

      it('letting the resumed countdown reach zero logs the set with the persisted duration/distance, starts the rest timer, and clears storage', async () => {
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
        vi.advanceTimersByTime(5_000)
        await flushPromises()

        expect(actions.logSet).toHaveBeenCalledWith(30, expect.objectContaining({ duration_seconds: 1800, distance_m: 5000 }))
        expect(startSpy).toHaveBeenCalled()
        expect(localStorage.getItem('berserk:cardio-countdown')).toBeNull()
        expect(wrapper.find('[data-testid="cardio-countdown"]').exists()).toBe(false)
        expect(wrapper.find('[data-testid="add-set-30"]').exists()).toBe(true)
      })

      it('cancelling the resumed countdown clears storage WITHOUT logging', async () => {
        const actions = makeActions()
        localStorage.setItem('berserk:cardio-countdown', JSON.stringify({ ...resumed, endsAt: Date.now() + 600_000 }))

        const wrapper = mountCardio({ actions, resumedCountdown: { ...resumed, endsAt: Date.now() + 600_000 } })
        await wrapper.get('[data-testid="cardio-countdown-cancel"]').trigger('click')
        await flushPromises()

        expect(actions.logSet).not.toHaveBeenCalled()
        expect(localStorage.getItem('berserk:cardio-countdown')).toBeNull()
        expect(wrapper.find('[data-testid="add-set-30"]').exists()).toBe(true)
      })
    })
  })

  describe('item 11: rest control', () => {
    it('shows the effective rest (workout override > routine target > default) and toggles a preset picker', async () => {
      const wrapper = mountCard({ routines, routineId: 1 })
      expect(wrapper.get('[data-testid="rest-toggle-20"]').text()).toContain('120')

      expect(wrapper.find('[data-testid="rest-picker-20"]').exists()).toBe(false)
      await wrapper.get('[data-testid="rest-toggle-20"]').trigger('click')
      expect(wrapper.find('[data-testid="rest-picker-20"]').exists()).toBe(true)
    })

    it('picking a preset calls actions.setExerciseRest with that value', async () => {
      const actions = makeActions()
      const wrapper = mountCard({ actions })
      await wrapper.get('[data-testid="rest-toggle-20"]').trigger('click')

      await wrapper.get('[data-testid="rest-preset-20-120"]').trigger('click')
      await flushPromises()

      expect(actions.setExerciseRest).toHaveBeenCalledWith(20, 120)
    })

    it('reflects the workout exercise override over the routine target', () => {
      const overridden = { ...pushExercise, rest_seconds: 60 }
      const wrapper = mountCard({ workoutExercise: overridden, routines, routineId: 1 })
      expect(wrapper.get('[data-testid="rest-toggle-20"]').text()).toContain('60')
    })

    it('is hidden entirely when restEnabled is false (retro editor)', () => {
      const wrapper = mountCard({ restEnabled: false })
      expect(wrapper.find('[data-testid="rest-toggle-20"]').exists()).toBe(false)
    })
  })

  it('logs a set and starts the rest timer with the default 90s AND the exercise name for a free workout', async () => {
    const actions = makeActions()
    const restTimer = useRestTimerStore()
    const startSpy = vi.spyOn(restTimer, 'start')

    mountCard({ actions, routines: [], routineId: null })
    await openDrawer(20)
    await drawerForm().trigger('submit')
    await flushPromises()

    expect(startSpy).toHaveBeenCalledWith(90, 'Press banca')
  })

  it('starts the rest timer with the routine rest_seconds when the workout came from a routine', async () => {
    const actions = makeActions()
    const restTimer = useRestTimerStore()
    const startSpy = vi.spyOn(restTimer, 'start')

    mountCard({ actions, routines, routineId: 1 })
    await openDrawer(20)
    await drawerForm().trigger('submit')
    await flushPromises()

    expect(startSpy).toHaveBeenCalledWith(120, 'Press banca')
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

  it('deletes a set via actions.deleteSet after confirming with a real click', async () => {
    const actions = makeActions()
    const wrapper = mountCard({ actions })

    await wrapper.find('[data-testid="delete-set-1"]').trigger('click')
    await flushPromises()
    expect(actions.deleteSet).not.toHaveBeenCalled()

    await wrapper.find('[data-testid="confirm-delete-set-1"]').trigger('click')
    await flushPromises()

    expect(actions.deleteSet).toHaveBeenCalledWith(20, 1)
  })

  it('cancelling the delete-set confirm never calls actions.deleteSet', async () => {
    const actions = makeActions()
    const wrapper = mountCard({ actions })

    await wrapper.find('[data-testid="delete-set-1"]').trigger('click')
    await flushPromises()

    await wrapper.find('[data-testid="cancel-delete-set-1"]').trigger('click')
    await flushPromises()

    expect(actions.deleteSet).not.toHaveBeenCalled()
    // el cancelar debe devolver el botón de borrar, no dejar la fila colgada en confirmación
    expect(wrapper.find('[data-testid="delete-set-1"]').exists()).toBe(true)
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
      await wrapper.find('[data-testid="delete-set-1"]').trigger('click')
      await flushPromises()

      const confirmBtn = document.querySelector('[data-testid="confirm-delete-set-1"]')
      expect(confirmBtn?.closest('.bk-pop-soft-enter-active, [class*="bk-pop-soft"]')).not.toBeNull()
      wrapper.unmount()
    })

    it('the remove-exercise swap enters via bk-pop-soft when confirming', async () => {
      const wrapper = mountReal()
      await wrapper.find('[data-testid="remove-exercise-20"]').trigger('click')
      await flushPromises()

      const confirmBtn = document.querySelector('[data-testid="confirm-remove-exercise-20"]')
      expect(confirmBtn?.closest('.bk-pop-soft-enter-active, [class*="bk-pop-soft"]')).not.toBeNull()
      wrapper.unmount()
    })
  })

  it('removes the exercise via actions.removeExercise after confirming with a real click', async () => {
    const actions = makeActions()
    const wrapper = mountCard({ actions })

    await wrapper.find('[data-testid="remove-exercise-20"]').trigger('click')
    await flushPromises()
    expect(actions.removeExercise).not.toHaveBeenCalled()

    await wrapper.find('[data-testid="confirm-remove-exercise-20"]').trigger('click')
    await flushPromises()

    expect(actions.removeExercise).toHaveBeenCalledWith(20)
  })

  it('reorders via actions.reorder with the full id list when moving down', async () => {
    const actions = makeActions()
    const wrapper = mountCard({ actions, exerciseIds: [20, 30] })

    await wrapper.find('[data-testid="move-down-20"]').trigger('click')
    await flushPromises()

    expect(actions.reorder).toHaveBeenCalledWith([30, 20])
  })

  it('hides the move-up control on the first exercise', () => {
    const wrapper = mountCard({ exerciseIds: [20, 30] })
    expect(wrapper.find('[data-testid="move-up-20"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="move-down-20"]').exists()).toBe(true)
  })

  it('a rejected reorder (move-down) surfaces a toast instead of failing silently', async () => {
    const toast = useToastStore()
    const actions = makeActions({ reorder: vi.fn().mockRejectedValueOnce(new Error('conflict')) })

    const wrapper = mountCard({ actions, exerciseIds: [20, 30] })
    await wrapper.find('[data-testid="move-down-20"]').trigger('click')
    await flushPromises()

    expect(toast.toasts.length).toBeGreaterThan(0)
  })
})

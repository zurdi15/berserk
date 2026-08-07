import { DOMWrapper, flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const push = vi.fn()
const routeQuery: Record<string, unknown> = {}
vi.mock('vue-router', () => ({
  useRouter: () => ({ push }),
  useRoute: () => ({ query: routeQuery }),
}))

const routines = [
  { id: 7, name: 'Push day', description: null, rune: null, color: null, exercises: [] },
]

vi.mock('@/api/domain', () => ({
  listRoutines: vi.fn(async () => routines),
  listExercises: vi.fn(async () => []),
  listMuscleGroups: vi.fn(async () => []),
  deleteWorkout: vi.fn(),
  getExerciseHistory: vi.fn(async () => null),
  getWorkout: vi.fn(),
  logSet: vi.fn(),
  updateSet: vi.fn(),
  deleteSet: vi.fn(),
  addWorkoutExercise: vi.fn(),
  removeWorkoutExercise: vi.fn(),
  reorderWorkoutExercises: vi.fn(),
  updateWorkoutExercise: vi.fn(),
  finishWorkout: vi.fn(),
}))

import { ApiError } from '@/api/client'
import * as domain from '@/api/domain'
import { createI18nInstance } from '@/i18n'
import { useActiveWorkoutStore } from '@/stores/activeWorkout'
import { useAuthStore } from '@/stores/auth'
import { useRestTimerStore } from '@/stores/restTimer'
import { useToastStore } from '@/stores/toast'
import WorkoutExerciseCard from '@/components/workout/WorkoutExerciseCard.vue'
import WorkoutView from '../WorkoutView.vue'

function build() {
  return mount(WorkoutView, {
    global: { plugins: [createI18nInstance()] },
  })
}

describe('WorkoutView', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    push.mockClear()
    for (const key of Object.keys(routeQuery)) delete routeQuery[key]
  })

  // v0.5.0 (modelo de scroll único, ver ShellView.vue): las ramas FLUYEN
  // contra <main> — sin h-full/flex-1/overflow propio en raíz ni ramas
  it('v0.5.0: root and visible branch flow against <main> (no bounded-scroll classes)', async () => {
    const activeWorkout = useActiveWorkoutStore()
    vi.spyOn(activeWorkout, 'resume').mockResolvedValue(undefined)

    const wrapper = build()
    await flushPromises()

    expect(wrapper.classes()).not.toContain('h-full')
    const startFree = wrapper.get('[data-testid="start-free"]')
    const idleBranch = startFree.element.parentElement!
    expect(idleBranch.classList.contains('flex-1')).toBe(false)
    expect(idleBranch.classList.contains('overflow-y-auto')).toBe(false)
  })

  it('calls activeWorkout.resume on mount to survive reloads', async () => {
    const activeWorkout = useActiveWorkoutStore()
    const resumeSpy = vi.spyOn(activeWorkout, 'resume').mockResolvedValue(undefined)

    build()
    await flushPromises()

    expect(resumeSpy).toHaveBeenCalled()
  })

  it('item 4: the idle (no active workout) state has its own bk-stagger entry, since it no longer gets one from the removed router Transition', async () => {
    const activeWorkout = useActiveWorkoutStore()
    vi.spyOn(activeWorkout, 'resume').mockResolvedValue(undefined)

    const wrapper = build()
    await flushPromises()

    expect(wrapper.find('.bk-stagger').exists()).toBe(true)
    expect(wrapper.find('[data-testid="start-free"]').exists()).toBe(true)
  })

  it('starts a free workout when clicking the free-workout button (start({}))', async () => {
    const activeWorkout = useActiveWorkoutStore()
    vi.spyOn(activeWorkout, 'resume').mockResolvedValue(undefined)
    const startSpy = vi.spyOn(activeWorkout, 'start').mockResolvedValue(undefined)

    const wrapper = build()
    await flushPromises()

    await wrapper.find('[data-testid="start-free"]').trigger('click')
    await flushPromises()

    expect(startSpy).toHaveBeenCalledWith({})
  })

  it('starts from a routine when clicking a routine button (start({routine_id}))', async () => {
    const activeWorkout = useActiveWorkoutStore()
    vi.spyOn(activeWorkout, 'resume').mockResolvedValue(undefined)
    const startSpy = vi.spyOn(activeWorkout, 'start').mockResolvedValue(undefined)

    const wrapper = build()
    await flushPromises()

    await wrapper.find('[data-testid="start-routine-7"]').trigger('click')
    await flushPromises()

    expect(startSpy).toHaveBeenCalledWith({ routine_id: 7 })
  })

  it('gates the "start from routine" list on readiness: absent while listRoutines is pending, present once resolved', async () => {
    const activeWorkout = useActiveWorkoutStore()
    vi.spyOn(activeWorkout, 'resume').mockResolvedValue(undefined)

    let resolveRoutines: (value: never) => void = () => {}
    vi.mocked(domain.listRoutines).mockImplementationOnce(() => new Promise((resolve) => { resolveRoutines = resolve }))

    const wrapper = build()
    await flushPromises()

    // pendiente: el botón de entreno libre sí está, la lista de rutinas no
    expect(wrapper.find('[data-testid="start-free"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="start-routine-7"]').exists()).toBe(false)

    resolveRoutines(routines as never)
    await flushPromises()

    expect(wrapper.find('[data-testid="start-routine-7"]').exists()).toBe(true)
  })

  describe('item 5: idle state separator and routine runes', () => {
    it('renders the "o" separator between the free-workout button and the routines list', async () => {
      const activeWorkout = useActiveWorkoutStore()
      vi.spyOn(activeWorkout, 'resume').mockResolvedValue(undefined)

      const wrapper = build()
      await flushPromises()

      expect(wrapper.get('[data-testid="or-separator"]').text()).toBe('o')
    })

    it('shows a BkRune next to a routine name when the routine has a valid rune', async () => {
      vi.mocked(domain.listRoutines).mockResolvedValueOnce([
        { id: 7, name: 'Push day', description: null, rune: 'chest', color: null, exercises: [] },
      ] as never)
      const activeWorkout = useActiveWorkoutStore()
      vi.spyOn(activeWorkout, 'resume').mockResolvedValue(undefined)

      const wrapper = build()
      await flushPromises()

      const rune = wrapper.get('[data-testid="start-routine-7"]').findComponent({ name: 'BkRune' })
      expect(rune.exists()).toBe(true)
      expect(rune.props('name')).toBe('chest')
    })

    it('renders no rune next to a routine name when the routine has no rune', async () => {
      vi.mocked(domain.listRoutines).mockResolvedValueOnce([
        { id: 7, name: 'Push day', description: null, rune: null, color: null, exercises: [] },
      ] as never)
      const activeWorkout = useActiveWorkoutStore()
      vi.spyOn(activeWorkout, 'resume').mockResolvedValue(undefined)

      const wrapper = build()
      await flushPromises()

      const routineButton = wrapper.get('[data-testid="start-routine-7"]')
      expect(routineButton.findComponent({ name: 'BkRune' }).exists()).toBe(false)
    })

    it('renders no rune next to a routine name when the routine rune is not a valid rune name', async () => {
      vi.mocked(domain.listRoutines).mockResolvedValueOnce([
        { id: 7, name: 'Push day', description: null, rune: 'not-a-rune', color: null, exercises: [] },
      ] as never)
      const activeWorkout = useActiveWorkoutStore()
      vi.spyOn(activeWorkout, 'resume').mockResolvedValue(undefined)

      const wrapper = build()
      await flushPromises()

      const routineButton = wrapper.get('[data-testid="start-routine-7"]')
      expect(routineButton.findComponent({ name: 'BkRune' }).exists()).toBe(false)
    })
  })

  it('auto-starts from the ?session= query when there is no active workout (start({scheduled_session_id}))', async () => {
    routeQuery.session = '42'
    const activeWorkout = useActiveWorkoutStore()
    vi.spyOn(activeWorkout, 'resume').mockResolvedValue(undefined)
    const startSpy = vi.spyOn(activeWorkout, 'start').mockResolvedValue(undefined)

    build()
    await flushPromises()

    expect(startSpy).toHaveBeenCalledWith({ scheduled_session_id: 42 })
  })

  it('does not auto-start when resume already found an active workout', async () => {
    const activeWorkout = useActiveWorkoutStore()
    routeQuery.session = '42'
    vi.spyOn(activeWorkout, 'resume').mockImplementation(async () => {
      activeWorkout.workout = {
        id: 1,
        date: '2026-08-06',
        started_at: '2026-08-06T09:00:00Z',
        ended_at: null,
        routine_id: null,
        note: null,
        feeling: null,
        exercises: [],
        muscle_tag_ids: [],
      } as never
    })
    const startSpy = vi.spyOn(activeWorkout, 'start').mockResolvedValue(undefined)

    build()
    await flushPromises()

    expect(startSpy).not.toHaveBeenCalled()
  })

  describe('elapsed ticker (naive UTC started_at)', () => {
    afterEach(() => {
      vi.useRealTimers()
      vi.unstubAllEnvs()
    })

    // ledger T11 — este es exactamente el sitio donde vivía el bug de C2: un
    // started_at naive del backend se interpretaba como hora LOCAL del
    // navegador (+2h en Europe/Madrid) en vez de UTC, así que el elapsed de
    // un entreno recién empezado mostraba +2h en lugar de segundos.
    it('ticks the elapsed label from a backend-naive started_at parsed as UTC, not shifted by local offset', async () => {
      // TZ pineada: en un runner UTC el parseo local y el UTC coinciden y el
      // test no discriminaría el bug original
      vi.stubEnv('TZ', 'Europe/Madrid')
      vi.useFakeTimers()
      vi.setSystemTime(new Date('2026-08-06T09:00:00Z'))

      const activeWorkout = useActiveWorkoutStore()
      vi.spyOn(activeWorkout, 'resume').mockImplementation(async () => {
        activeWorkout.workout = {
          id: 1,
          date: '2026-08-06',
          started_at: '2026-08-06T09:00:00', // naive, sin offset — mismo instante que "now" arriba
          ended_at: null,
          routine_id: null,
          note: null,
          feeling: null,
          exercises: [],
          muscle_tag_ids: [],
        } as never
      })

      const wrapper = build()
      await flushPromises()

      expect(wrapper.find('[data-testid="elapsed"]').text()).toBe('0:00')

      vi.advanceTimersByTime(5000)
      await flushPromises()

      expect(wrapper.find('[data-testid="elapsed"]').text()).toBe('0:05')

      wrapper.unmount()
    })
  })

  describe('PR celebration', () => {
    const exerciseFixture = {
      id: 5,
      name_es: 'Press banca',
      name_en: 'Bench press',
      measurement: 'strength' as const,
      owner_id: null,
      muscle_groups: [{ muscle_group_id: 1, is_primary: true }],
    }
    const muscleGroupsFixture = [
      { id: 1, slug: 'chest', name_es: 'Pecho', name_en: 'Chest', owner_id: null },
    ]
    const workoutFixture = {
      id: 1,
      date: '2026-08-06',
      // formato naive real del backend (sin offset, con microsegundos) — no 'Z'
      started_at: '2026-08-06T09:00:00.685240',
      ended_at: null,
      routine_id: null,
      note: null,
      feeling: null,
      exercises: [{ id: 20, exercise_id: 5, position: 0, note: null, sets: [] }],
      muscle_tag_ids: [],
    }

    // BkCelebration se teletransporta a document.body: si no se desmonta,
    // el siguiente test hereda el overlay huérfano del anterior
    let wrapper: ReturnType<typeof build> | null = null

    beforeEach(() => {
      vi.mocked(domain.listExercises).mockResolvedValue([exerciseFixture] as never)
      vi.mocked(domain.listMuscleGroups).mockResolvedValue(muscleGroupsFixture as never)
    })

    afterEach(() => {
      wrapper?.unmount()
      wrapper = null
    })

    it('shows the celebration with the logged exercise\'s primary-group rune when lastRecords fills', async () => {
      const activeWorkout = useActiveWorkoutStore()
      vi.spyOn(activeWorkout, 'resume').mockImplementation(async () => {
        activeWorkout.workout = workoutFixture as never
      })

      wrapper = build()
      await flushPromises()

      expect(wrapper.findComponent({ name: 'BkCelebration' }).exists()).toBe(false)

      activeWorkout.lastRecords = [
        { id: 9, exercise_id: 5, kind: 'max_weight', value: 100, achieved_at: 'x' },
      ] as never
      await flushPromises()

      const celebration = wrapper.findComponent({ name: 'BkCelebration' })
      expect(celebration.exists()).toBe(true)
      expect(celebration.props('runeName')).toBe('chest')
      expect(celebration.props('records')).toEqual(activeWorkout.lastRecords)
    })

    it('clears activeWorkout.lastRecords when the celebration emits done', async () => {
      const activeWorkout = useActiveWorkoutStore()
      vi.spyOn(activeWorkout, 'resume').mockImplementation(async () => {
        activeWorkout.workout = workoutFixture as never
      })

      wrapper = build()
      await flushPromises()

      activeWorkout.lastRecords = [
        { id: 9, exercise_id: 5, kind: 'max_weight', value: 100, achieved_at: 'x' },
      ] as never
      await flushPromises()

      wrapper.findComponent({ name: 'BkCelebration' }).vm.$emit('done')
      await flushPromises()

      expect(activeWorkout.lastRecords).toHaveLength(0)
    })

    it('falls back to the "pr" rune when the catalog cannot resolve a primary muscle group', async () => {
      const activeWorkout = useActiveWorkoutStore()
      vi.spyOn(activeWorkout, 'resume').mockImplementation(async () => {
        activeWorkout.workout = workoutFixture as never
      })
      // catálogo sin grupos musculares: no hay runa que resolver, así que cae al fallback 'pr'
      vi.mocked(domain.listMuscleGroups).mockResolvedValue([] as never)

      wrapper = build()
      await flushPromises()

      activeWorkout.lastRecords = [
        { id: 9, exercise_id: 5, kind: 'max_weight', value: 100, achieved_at: 'x' },
      ] as never
      await flushPromises()

      expect(wrapper.findComponent({ name: 'BkCelebration' }).props('runeName')).toBe('pr')
    })

    it("passes the athlete's configured units through to the celebration", async () => {
      const activeWorkout = useActiveWorkoutStore()
      vi.spyOn(activeWorkout, 'resume').mockImplementation(async () => {
        activeWorkout.workout = workoutFixture as never
      })
      useAuthStore().user = { units: 'lb' } as never

      wrapper = build()
      await flushPromises()

      activeWorkout.lastRecords = [
        { id: 9, exercise_id: 5, kind: 'max_weight', value: 100, achieved_at: 'x' },
      ] as never
      await flushPromises()

      expect(wrapper.findComponent({ name: 'BkCelebration' }).props('units')).toBe('lb')
    })
  })

  describe('item 3 (ola de pulido v0.3.0): header carries only date+timer now, wraps at narrow viewports', () => {
    const workoutFixture = {
      id: 1,
      date: '2026-08-06',
      started_at: '2026-08-06T09:00:00Z',
      ended_at: null,
      routine_id: null,
      note: null,
      feeling: null,
      exercises: [],
      muscle_tag_ids: [],
    }

    let wrapper: VueWrapper | null = null
    afterEach(() => {
      wrapper?.unmount()
      wrapper = null
    })

    function mountLive() {
      const activeWorkout = useActiveWorkoutStore()
      vi.spyOn(activeWorkout, 'resume').mockImplementation(async () => {
        activeWorkout.workout = workoutFixture as never
      })
      return build()
    }

    // re-apuntado (ronda anterior: el pin cubría fecha+cronómetro+botones en
    // una sola fila; ahora los botones ya no viven aquí, ver item 3 debajo)
    it('pins flex-wrap (plus items-center/justify-between/gap-3) on the elapsed+date row', async () => {
      wrapper = mountLive()
      await flushPromises()

      const header = wrapper.get('[data-testid="workout-header"]')
      expect(header.classes()).toEqual(
        expect.arrayContaining(['flex', 'flex-wrap', 'items-center', 'justify-between', 'gap-3']),
      )
    })

    it('the header shows only the elapsed timer and the date — no discard/finish buttons in it', async () => {
      wrapper = mountLive()
      await flushPromises()

      const header = wrapper.get('[data-testid="workout-header"]')
      expect(header.find('[data-testid="elapsed"]').exists()).toBe(true)
      expect(header.find('[data-testid="workout-date"]').exists()).toBe(true)
      expect(header.find('[data-testid="discard-workout"]').exists()).toBe(false)
    })

    it('discard/finish now live at the bottom of the workout content, after a divider, below "Añadir ejercicio"', async () => {
      wrapper = mountLive()
      await flushPromises()

      const actions = wrapper.get('[data-testid="workout-actions"]')
      expect(actions.classes()).toEqual(expect.arrayContaining(['border-t', 'border-line']))
      expect(actions.find('[data-testid="discard-workout"]').exists()).toBe(true)
      expect(actions.text()).toContain('Terminar')

      // orden real en el DOM: "Añadir ejercicio" antes que el bloque de acciones
      const html = wrapper.html()
      expect(html.indexOf('Añadir ejercicio')).toBeLessThan(html.indexOf('data-testid="workout-actions"'))
    })
  })

  describe('discard workout', () => {
    const workoutFixture = {
      id: 1,
      date: '2026-08-06',
      started_at: '2026-08-06T09:00:00Z',
      ended_at: null,
      routine_id: null,
      note: null,
      feeling: null,
      exercises: [],
      muscle_tag_ids: [],
    }

    // BkSheet usa <Teleport to="body">: hay que montar sobre document.body,
    // buscar ahí dentro y desmontar tras cada prueba (ver library.spec.ts)
    let wrapper: VueWrapper | null = null

    afterEach(() => {
      wrapper?.unmount()
      wrapper = null
    })

    function byTestId(id: string): DOMWrapper<Element> {
      return new DOMWrapper(document.body.querySelector(`[data-testid="${id}"]`) as Element | null)
    }

    it('opens the discard confirm sheet on click, and confirming calls deleteWorkout and navigates to today', async () => {
      const activeWorkout = useActiveWorkoutStore()
      vi.spyOn(activeWorkout, 'resume').mockImplementation(async () => {
        activeWorkout.workout = workoutFixture as never
      })
      vi.mocked(domain.deleteWorkout).mockResolvedValue(undefined as never)

      wrapper = mount(WorkoutView, {
        global: { plugins: [createI18nInstance()] },
        attachTo: document.body,
      })
      await flushPromises()

      await wrapper.find('[data-testid="discard-workout"]').trigger('click')
      await flushPromises()

      expect(document.body.querySelector('[role="dialog"]')?.textContent).toContain('¿Descartar el entreno?')

      await byTestId('discard-confirm-btn').trigger('click')
      await flushPromises()

      expect(domain.deleteWorkout).toHaveBeenCalledWith(1)
      expect(push).toHaveBeenCalledWith({ name: 'today' })
    })
  })

  describe('item 4: derived muscle groups display (read-only)', () => {
    const workoutFixture = {
      id: 1,
      date: '2026-08-06',
      started_at: '2026-08-06T09:00:00Z',
      ended_at: null,
      routine_id: null,
      note: null,
      feeling: null,
      exercises: [],
      muscle_tag_ids: [1],
    }
    const muscleGroupsFixture = [
      { id: 1, slug: 'chest', name_es: 'Pecho', name_en: 'Chest', owner_id: null },
      { id: 2, slug: 'back', name_es: 'Espalda', name_en: 'Back', owner_id: null },
    ]

    let wrapper: VueWrapper | null = null

    afterEach(() => {
      wrapper?.unmount()
      wrapper = null
    })

    it('renders only the groups present in muscle_tag_ids, as non-interactive spans (no click handler, no editor)', async () => {
      vi.mocked(domain.listMuscleGroups).mockResolvedValue(muscleGroupsFixture as never)
      const activeWorkout = useActiveWorkoutStore()
      vi.spyOn(activeWorkout, 'resume').mockImplementation(async () => {
        activeWorkout.workout = workoutFixture as never
      })

      wrapper = build()
      await flushPromises()

      const tag = wrapper.get('[data-testid="muscle-tag-1"]')
      expect(tag.element.tagName).toBe('SPAN')
      expect(tag.text()).toBe('Pecho')
      expect(wrapper.find('[data-testid="muscle-tag-2"]').exists()).toBe(false)
    })

    it('renders nothing when muscle_tag_ids is empty (no exercises added yet)', async () => {
      vi.mocked(domain.listMuscleGroups).mockResolvedValue(muscleGroupsFixture as never)
      const activeWorkout = useActiveWorkoutStore()
      vi.spyOn(activeWorkout, 'resume').mockImplementation(async () => {
        activeWorkout.workout = { ...workoutFixture, muscle_tag_ids: [] } as never
      })

      wrapper = build()
      await flushPromises()

      expect(wrapper.find('[data-testid^="muscle-tag-"]').exists()).toBe(false)
    })
  })

  describe('item 1 + item 9: drawer logging flow and neon feedback', () => {
    const exerciseFixture = {
      id: 5,
      name_es: 'Press banca',
      name_en: 'Bench press',
      measurement: 'strength' as const,
      owner_id: null,
      muscle_groups: [],
    }
    const workoutFixture = {
      id: 1,
      date: '2026-08-06',
      started_at: '2026-08-06T09:00:00Z',
      ended_at: null,
      routine_id: null,
      note: null,
      feeling: null,
      exercises: [{ id: 20, exercise_id: 5, position: 0, note: null, rest_seconds: null, sets: [] }],
      muscle_tag_ids: [],
    }

    let wrapper: VueWrapper | null = null

    beforeEach(() => {
      vi.mocked(domain.listExercises).mockResolvedValue([exerciseFixture] as never)
      vi.mocked(domain.getWorkout).mockResolvedValue(workoutFixture as never)
      // el mock de logSet no se limpia solo entre tests de este archivo, y el
      // último test de este bloque afirma un conteo exacto de llamadas
      vi.mocked(domain.logSet).mockClear()
    })

    afterEach(() => {
      wrapper?.unmount()
      wrapper = null
      document.body.innerHTML = ''
    })

    function mountLive() {
      const activeWorkout = useActiveWorkoutStore()
      vi.spyOn(activeWorkout, 'resume').mockImplementation(async () => {
        activeWorkout.workout = workoutFixture as never
      })
      return mount(WorkoutView, { global: { plugins: [createI18nInstance()] }, attachTo: document.body })
    }

    it('no drawer is open right after mount — adding an exercise never auto-opens a form (zurdi\'s bug)', async () => {
      wrapper = mountLive()
      await flushPromises()

      expect(document.body.querySelector('[role="dialog"]')).toBeNull()
    })

    it('opens the drawer via "+ Serie", logs the set on submit, closes the drawer and fires the neon pulse', async () => {
      vi.mocked(domain.logSet).mockResolvedValue({
        set: { id: 101, set_number: 1, reps: 8, weight_kg: 20, duration_seconds: null, distance_m: null, is_warmup: false, rpe: null, completed_at: 'x' },
        new_records: [],
      } as never)

      wrapper = mountLive()
      await flushPromises()

      await wrapper.find('[data-testid="add-set-20"]').trigger('click')
      await flushPromises()
      expect(document.body.querySelector('[role="dialog"]')).not.toBeNull()

      const form = new DOMWrapper(document.body.querySelector('form') as Element)
      await form.trigger('submit')
      await flushPromises()

      expect(domain.logSet).toHaveBeenCalledWith(
        1,
        20,
        expect.objectContaining({ is_warmup: false, reps: expect.any(Number), weight_kg: expect.any(Number) }),
      )
      expect(document.body.querySelector('[role="dialog"]')).toBeNull()
      expect(document.body.querySelector('[data-testid="neon-pulse"]')).not.toBeNull()
    })

    it('fix M4: a second log while the first pulse is still "animating" (no done yet) retriggers a fresh pulse instead of staying inert', async () => {
      vi.mocked(domain.logSet).mockResolvedValue({
        set: { id: 101, set_number: 1, reps: 8, weight_kg: 20, duration_seconds: null, distance_m: null, is_warmup: false, rpe: null, completed_at: 'x' },
        new_records: [],
      } as never)

      wrapper = mountLive()
      await flushPromises()

      await wrapper.find('[data-testid="add-set-20"]').trigger('click')
      await flushPromises()
      let form = new DOMWrapper(document.body.querySelector('form') as Element)
      await form.trigger('submit')
      await flushPromises()

      const firstPulseEl = document.body.querySelector('[data-testid="neon-pulse"]')
      expect(firstPulseEl).not.toBeNull()

      // segundo logueo SIN que el pulso anterior haya emitido 'done' (como si
      // la animación CSS del primero siguiera en curso) — antes del fix,
      // show ya estaba en `true` y una segunda asignación a `true` no
      // remontaba el nodo, así que el pulso no se reiniciaba visualmente
      await wrapper.find('[data-testid="add-set-20"]').trigger('click')
      await flushPromises()
      form = new DOMWrapper(document.body.querySelector('form') as Element)
      await form.trigger('submit')
      await flushPromises()

      const secondPulseEl = document.body.querySelector('[data-testid="neon-pulse"]')
      expect(secondPulseEl).not.toBeNull()
      // nodo DOM distinto: se desmontó y remontó de verdad (ciclo
      // false→true real), no el mismo elemento que se quedó ahí sin más
      expect(secondPulseEl).not.toBe(firstPulseEl)
    })

    it('skips the neon pulse when the log produces a new PR — the ember celebration wins instead', async () => {
      vi.mocked(domain.logSet).mockResolvedValue({
        set: { id: 101, set_number: 1, reps: 8, weight_kg: 100, duration_seconds: null, distance_m: null, is_warmup: false, rpe: null, completed_at: 'x' },
        new_records: [{ id: 9, exercise_id: 5, kind: 'max_weight', value: 100, achieved_at: 'x' }],
      } as never)

      wrapper = mountLive()
      await flushPromises()

      await wrapper.find('[data-testid="add-set-20"]').trigger('click')
      await flushPromises()
      const form = new DOMWrapper(document.body.querySelector('form') as Element)
      await form.trigger('submit')
      await flushPromises()

      expect(document.body.querySelector('[data-testid="celebration-overlay"]')).not.toBeNull()
      expect(document.body.querySelector('[data-testid="neon-pulse"]')).toBeNull()
    })

    it('"Registrar y otra" logs the set and keeps the drawer open', async () => {
      vi.mocked(domain.logSet).mockResolvedValue({
        set: { id: 101, set_number: 1, reps: 8, weight_kg: 20, duration_seconds: null, distance_m: null, is_warmup: false, rpe: null, completed_at: 'x' },
        new_records: [],
      } as never)

      wrapper = mountLive()
      await flushPromises()

      await wrapper.find('[data-testid="add-set-20"]').trigger('click')
      await flushPromises()

      const andAnother = new DOMWrapper(
        document.body.querySelector('[data-testid="log-set-and-another"]') as Element,
      )
      await andAnother.trigger('click')
      await flushPromises()

      expect(domain.logSet).toHaveBeenCalledTimes(1)
      expect(document.body.querySelector('[role="dialog"]')).not.toBeNull()
    })
  })

  describe('item 4 (post-0.3.0): rest timer cancel chip + auto-rest opt-out', () => {
    const exerciseFixture = {
      id: 5,
      name_es: 'Press banca',
      name_en: 'Bench press',
      measurement: 'strength' as const,
      owner_id: null,
      muscle_groups: [],
    }
    const workoutFixture = {
      id: 1,
      date: '2026-08-06',
      started_at: '2026-08-06T09:00:00Z',
      ended_at: null,
      routine_id: null,
      note: null,
      feeling: null,
      exercises: [{ id: 20, exercise_id: 5, position: 0, note: null, rest_seconds: null, sets: [] }],
      muscle_tag_ids: [],
    }

    let wrapper: VueWrapper | null = null

    beforeEach(() => {
      vi.mocked(domain.listExercises).mockResolvedValue([exerciseFixture] as never)
      vi.mocked(domain.getWorkout).mockResolvedValue(workoutFixture as never)
      vi.mocked(domain.logSet).mockClear()
      vi.mocked(domain.logSet).mockResolvedValue({
        set: { id: 101, set_number: 1, reps: 8, weight_kg: 20, duration_seconds: null, distance_m: null, is_warmup: false, rpe: null, completed_at: 'x' },
        new_records: [],
      } as never)
    })

    afterEach(() => {
      wrapper?.unmount()
      wrapper = null
      document.body.innerHTML = ''
      vi.unstubAllGlobals()
    })

    function mountLive() {
      const activeWorkout = useActiveWorkoutStore()
      vi.spyOn(activeWorkout, 'resume').mockImplementation(async () => {
        activeWorkout.workout = workoutFixture as never
      })
      return mount(WorkoutView, { global: { plugins: [createI18nInstance()] }, attachTo: document.body })
    }

    async function logASet(w: VueWrapper) {
      await w.find('[data-testid="add-set-20"]').trigger('click')
      await flushPromises()
      const form = new DOMWrapper(document.body.querySelector('form') as Element)
      await form.trigger('submit')
      await flushPromises()
    }

    // item 6 (v0.4.3, zurdi): el chip "M:SS ✕" del header se retira —
    // cancelar el descanso se mueve DENTRO del CTA del shell (ver
    // ShellView.spec.ts, describe "CTA tap-to-cancel-rest"). Este test
    // confirma que el header YA NO lleva esa superficie, ni siquiera
    // descansando — WorkoutView solo arranca el timer, nunca lo cancela.
    it('item 6: logging a set with auto-rest ON starts the timer, but the header carries no cancel-rest chip anymore (moved into the shell CTA)', async () => {
      wrapper = mountLive()
      await flushPromises()
      const restTimer = useRestTimerStore()

      await logASet(wrapper)

      expect(restTimer.active).toBe(true)
      expect(document.body.querySelector('[data-testid="rest-cancel-chip"]')).toBeNull()
      expect(document.body.querySelector('[data-testid="cancel-rest"]')).toBeNull()
    })

    // item 5 (v0.4.3, zurdi): la etiqueta SEPARADA ("Descanso automático" a
    // la izquierda del toggle) se retira — el propio botón ya lo dice, y
    // llevaba un aria-label explícito propio como ancla de accesibilidad
    it('item 5: has no separate label sibling next to the toggle, but the toggle itself carries an aria-label', async () => {
      wrapper = mountLive()
      await flushPromises()

      const toggle = wrapper.get('[data-testid="rest-auto-toggle"]')
      // única hija de su fila: nada a su lado que duplique el texto
      expect(toggle.element.parentElement?.children).toHaveLength(1)
      expect(toggle.attributes('aria-label')).toBe('Descanso automático')
    })

    it('tapping the auto-rest toggle off, then logging a set, starts NO timer', async () => {
      wrapper = mountLive()
      await flushPromises()
      const restTimer = useRestTimerStore()

      const toggle = wrapper.get('[data-testid="rest-auto-toggle"]')
      expect(toggle.attributes('aria-pressed')).toBe('true')
      await toggle.trigger('click')
      expect(toggle.attributes('aria-pressed')).toBe('false')

      await logASet(wrapper)

      expect(domain.logSet).toHaveBeenCalled()
      expect(restTimer.active).toBe(false)
      expect(document.body.querySelector('[data-testid="rest-cancel-chip"]')).toBeNull()
    })

    it('the auto-rest preference persists to localStorage and is restored on the next mount', async () => {
      const store = new Map<string, string>()
      vi.stubGlobal('localStorage', {
        getItem: (key: string) => (store.has(key) ? store.get(key)! : null),
        setItem: (key: string, value: string) => { store.set(key, value) },
      })

      wrapper = mountLive()
      await flushPromises()

      await wrapper.get('[data-testid="rest-auto-toggle"]').trigger('click')
      expect(store.get('berserk:rest-auto-enabled')).toBe('false')

      // "recarga": un montaje nuevo, mismo backing store — debe arrancar ya en OFF
      wrapper.unmount()
      wrapper = mountLive()
      await flushPromises()

      expect(wrapper.get('[data-testid="rest-auto-toggle"]').attributes('aria-pressed')).toBe('false')
    })
  })

  // v0.3.2 CARDIO-COUNTDOWN PERSISTENCE: al montar la vista EN VIVO (nunca en
  // el editor retroactivo, que ni monta este componente), se decide qué
  // hacer con un countdown que se dejó corriendo antes de que Android
  // matara la pestaña — ver WorkoutView.vue::checkPersistedCardioCountdown.
  describe('v0.3.2 CARDIO-COUNTDOWN PERSISTENCE: resume-check on mount', () => {
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

    const cardioExerciseFixture = {
      id: 6,
      name_es: 'Cinta',
      name_en: 'Treadmill',
      measurement: 'cardio' as const,
      owner_id: null,
      muscle_groups: [],
    }
    const workoutFixture = {
      id: 1,
      date: '2026-08-06',
      started_at: '2026-08-06T09:00:00Z',
      ended_at: null,
      routine_id: null,
      note: null,
      feeling: null,
      exercises: [{ id: 20, exercise_id: 6, position: 0, note: null, rest_seconds: null, sets: [] }],
      muscle_tag_ids: [],
    }

    let wrapper: VueWrapper | null = null

    beforeEach(() => {
      vi.useFakeTimers()
      vi.setSystemTime(new Date('2026-08-06T10:00:00Z'))
      vi.mocked(domain.listExercises).mockResolvedValue([cardioExerciseFixture] as never)
      vi.mocked(domain.getWorkout).mockResolvedValue(workoutFixture as never)
      vi.mocked(domain.logSet).mockReset()
      vi.mocked(domain.finishWorkout).mockReset()
    })

    afterEach(() => {
      wrapper?.unmount()
      wrapper = null
      document.body.innerHTML = ''
      vi.useRealTimers()
      vi.unstubAllGlobals()
    })

    function mountLiveWithStorage(storage: Storage) {
      vi.stubGlobal('localStorage', storage)
      const activeWorkout = useActiveWorkoutStore()
      vi.spyOn(activeWorkout, 'resume').mockImplementation(async () => {
        activeWorkout.workout = workoutFixture as never
      })
      return mount(WorkoutView, { global: { plugins: [createI18nInstance()] }, attachTo: document.body })
    }

    it('resumes a still-running countdown (endsAt in the future) at the correct remaining time, without logging', async () => {
      const storage = mockStorage()
      storage.setItem(
        'berserk:cardio-countdown',
        JSON.stringify({ endsAt: Date.now() + 600_000, workoutId: 1, workoutExerciseId: 20, targetSeconds: 1800, distanceM: 5000 }),
      )

      wrapper = mountLiveWithStorage(storage)
      await flushPromises()

      expect(wrapper.get('[data-testid="cardio-countdown-label"]').text()).toBe('10:00')
      expect(domain.logSet).not.toHaveBeenCalled()
    })

    it('an already-expired countdown (endsAt in the past) auto-logs the full target duration, toasts the result, and clears storage', async () => {
      const storage = mockStorage()
      storage.setItem(
        'berserk:cardio-countdown',
        JSON.stringify({ endsAt: Date.now() - 5_000, workoutId: 1, workoutExerciseId: 20, targetSeconds: 1800, distanceM: 5000 }),
      )
      vi.mocked(domain.logSet).mockResolvedValue({
        set: { id: 1, set_number: 1, reps: null, weight_kg: null, duration_seconds: 1800, distance_m: 5000, is_warmup: false, rpe: null, completed_at: 'x' },
        new_records: [],
      } as never)
      const toast = useToastStore()

      wrapper = mountLiveWithStorage(storage)
      await flushPromises()

      expect(domain.logSet).toHaveBeenCalledWith(1, 20, expect.objectContaining({ duration_seconds: 1800, distance_m: 5000 }))
      expect(toast.toasts.some((t) => t.message === 'Cardio registrado: 30:00')).toBe(true)
      expect(storage.getItem('berserk:cardio-countdown')).toBeNull()
    })

    it('a stale workoutId (no longer the active workout) clears storage WITHOUT logging', async () => {
      const storage = mockStorage()
      storage.setItem(
        'berserk:cardio-countdown',
        JSON.stringify({ endsAt: Date.now() - 5_000, workoutId: 999, workoutExerciseId: 20, targetSeconds: 1800 }),
      )

      wrapper = mountLiveWithStorage(storage)
      await flushPromises()

      expect(domain.logSet).not.toHaveBeenCalled()
      expect(storage.getItem('berserk:cardio-countdown')).toBeNull()
    })

    it('no active workout at all clears storage WITHOUT logging (mismatch, same as a stale workoutId)', async () => {
      const storage = mockStorage()
      storage.setItem(
        'berserk:cardio-countdown',
        JSON.stringify({ endsAt: Date.now() - 5_000, workoutId: 1, workoutExerciseId: 20, targetSeconds: 1800 }),
      )
      vi.stubGlobal('localStorage', storage)
      const activeWorkout = useActiveWorkoutStore()
      vi.spyOn(activeWorkout, 'resume').mockResolvedValue(undefined)

      wrapper = mount(WorkoutView, { global: { plugins: [createI18nInstance()] } })
      await flushPromises()

      expect(domain.logSet).not.toHaveBeenCalled()
      expect(storage.getItem('berserk:cardio-countdown')).toBeNull()
    })

    it('a workoutExerciseId that no longer exists in the workout clears storage WITHOUT logging', async () => {
      const storage = mockStorage()
      storage.setItem(
        'berserk:cardio-countdown',
        JSON.stringify({ endsAt: Date.now() - 5_000, workoutId: 1, workoutExerciseId: 999, targetSeconds: 1800 }),
      )

      wrapper = mountLiveWithStorage(storage)
      await flushPromises()

      expect(domain.logSet).not.toHaveBeenCalled()
      expect(storage.getItem('berserk:cardio-countdown')).toBeNull()
    })

    // edge honesty (lane spec): el backend SÍ permite loguear contra un
    // entreno ya terminado, pero uno DESCARTADO ya no existe y 404 — ese caso
    // no lo caza el mismatch de arriba si el descarte pasó en otro
    // dispositivo/pestaña justo entre el resume() de esta y el intento de log
    it('a discarded workout (the log attempt 404s) clears storage silently — no error toast, no success toast', async () => {
      const storage = mockStorage()
      storage.setItem(
        'berserk:cardio-countdown',
        JSON.stringify({ endsAt: Date.now() - 5_000, workoutId: 1, workoutExerciseId: 20, targetSeconds: 1800 }),
      )
      vi.mocked(domain.logSet).mockRejectedValue(new ApiError(404, 'not_found'))
      const toast = useToastStore()

      wrapper = mountLiveWithStorage(storage)
      await flushPromises()

      expect(storage.getItem('berserk:cardio-countdown')).toBeNull()
      expect(toast.toasts).toHaveLength(0)
    })

    it('a non-404 error while auto-logging surfaces the usual error toast (not swallowed)', async () => {
      const storage = mockStorage()
      storage.setItem(
        'berserk:cardio-countdown',
        JSON.stringify({ endsAt: Date.now() - 5_000, workoutId: 1, workoutExerciseId: 20, targetSeconds: 1800 }),
      )
      vi.mocked(domain.logSet).mockRejectedValue(new ApiError(500, 'generic'))
      const toast = useToastStore()

      wrapper = mountLiveWithStorage(storage)
      await flushPromises()

      expect(toast.toasts.some((t) => t.kind === 'error')).toBe(true)
      expect(storage.getItem('berserk:cardio-countdown')).toBeNull()
    })

    it('finishing the workout clears a lingering persisted countdown', async () => {
      const storage = mockStorage()
      storage.setItem(
        'berserk:cardio-countdown',
        JSON.stringify({ endsAt: Date.now() + 600_000, workoutId: 1, workoutExerciseId: 20, targetSeconds: 1800 }),
      )
      vi.mocked(domain.finishWorkout).mockResolvedValue({ ...workoutFixture, ended_at: '2026-08-06T10:00:00Z' } as never)

      wrapper = mountLiveWithStorage(storage)
      await flushPromises()

      // sin data-testid propio (ver WorkoutView.vue): el botón "Terminar" se
      // localiza por texto dentro del bloque de acciones, como ya hace el
      // bloque "item 3" de arriba (`actions.text()).toContain('Terminar')`)
      const finishBtn = wrapper
        .get('[data-testid="workout-actions"]')
        .findAll('button')
        .find((b) => b.text() === 'Terminar')!
      await finishBtn.trigger('click')
      await flushPromises()

      expect(storage.getItem('berserk:cardio-countdown')).toBeNull()
    })

    it('discarding the workout clears a lingering persisted countdown', async () => {
      const storage = mockStorage()
      storage.setItem(
        'berserk:cardio-countdown',
        JSON.stringify({ endsAt: Date.now() + 600_000, workoutId: 1, workoutExerciseId: 20, targetSeconds: 1800 }),
      )
      vi.mocked(domain.deleteWorkout).mockResolvedValue(undefined as never)

      wrapper = mountLiveWithStorage(storage)
      await flushPromises()

      await wrapper.find('[data-testid="discard-workout"]').trigger('click')
      await flushPromises()
      const confirmBtn = document.body.querySelector('[data-testid="discard-confirm-btn"]') as HTMLElement
      confirmBtn.click()
      await flushPromises()

      expect(storage.getItem('berserk:cardio-countdown')).toBeNull()
    })
  })
})

// v0.5.0 superseries: la vista computa el agrupado por CONTIGÜIDAD
// (lib/supersets.ts) y lo baja resuelto a cada tarjeta; el marcado de
// "siguiente" vive aquí (la tarjeta solo lo pinta)
describe('WorkoutView v0.5.0 superseries: render agrupado y encadenado', () => {
  const groupedFixture = {
    id: 1,
    date: '2026-08-06',
    started_at: '2026-08-06T09:00:00Z',
    ended_at: null,
    routine_id: null,
    note: null,
    feeling: null,
    stretched: false,
    exercises: [
      { id: 20, exercise_id: 5, position: 1, note: null, rest_seconds: null, superset_group: 0, sets: [] },
      { id: 21, exercise_id: 6, position: 2, note: null, rest_seconds: null, superset_group: 0, sets: [] },
      { id: 22, exercise_id: 7, position: 3, note: null, rest_seconds: null, superset_group: null, sets: [] },
    ],
    muscle_tag_ids: [],
  }

  let wrapper: VueWrapper | null = null

  beforeEach(() => {
    setActivePinia(createPinia())
  })

  afterEach(() => {
    wrapper?.unmount()
    wrapper = null
    document.body.innerHTML = ''
  })

  function mountGrouped() {
    const activeWorkout = useActiveWorkoutStore()
    vi.spyOn(activeWorkout, 'resume').mockImplementation(async () => {
      activeWorkout.workout = groupedFixture as never
    })
    return mount(WorkoutView, { global: { plugins: [createI18nInstance()] }, attachTo: document.body })
  }

  // v0.7.0 (feedback de zurdi): los miembros van DENTRO de un contenedor con
  // borde aurora y UN chip de cabecera de bloque; las cards ya no llevan chip
  it('v0.7.0: wraps the contiguous group in ONE aurora-bordered container with a single "Superserie A" header; the loose card stays outside', async () => {
    wrapper = mountGrouped()
    await flushPromises()

    const container = wrapper.get('[data-testid="superset-container-A"]')
    expect(container.classes()).toEqual(expect.arrayContaining(['border', 'border-aurora/50']))
    expect(container.text()).toContain('Superserie A')
    // ambas cards del grupo viven DENTRO del contenedor; la suelta fuera
    const cards = wrapper.findAllComponents(WorkoutExerciseCard)
    expect(container.element.contains(cards[0].element)).toBe(true)
    expect(container.element.contains(cards[1].element)).toBe(true)
    expect(container.element.contains(cards[2].element)).toBe(false)
    // sin chips por card (el contenedor lleva la única etiqueta del bloque)
    expect(wrapper.find('[data-testid="superset-chip-20"]').exists()).toBe(false)
  })

  // v0.9.1 (zurdi: "en vez de un icono que la deshaga, un botón de editar"):
  // la cabecera del bloque abre el sheet de edición — deshacer vive dentro,
  // junto al cambio de miembros; sin toggles de frontera entre cards
  it('v0.9.1: the container header opens the edit sheet; dissolving from it clears the group', async () => {
    wrapper = mountGrouped()
    await flushPromises()

    expect(wrapper.findAll('[data-testid^="workout-superset-toggle-"]')).toHaveLength(0)
    expect(wrapper.find('[data-testid="superset-dissolve-A"]').exists()).toBe(false)

    await wrapper.get('[data-testid="superset-edit-A"]').trigger('click')
    await flushPromises()
    // el sheet lista los DOS miembros del grupo con su acción de cambiar
    expect(document.querySelectorAll('[data-testid^="superset-swap-"]')).toHaveLength(2)

    const store = useActiveWorkoutStore()
    const spy = vi.spyOn(store, 'setSupersetGroups').mockResolvedValue(undefined)
    ;(document.querySelector('[data-testid="superset-dissolve-btn"]') as HTMLElement).click()
    await flushPromises()
    expect(spy).toHaveBeenCalledWith([null, null, null])
    // el sheet se cierra al deshacer
    expect(document.querySelector('[data-testid="superset-dissolve-btn"]')).toBeNull()
  })

  it('v0.9.1: picking a replacement in the edit sheet calls swapSupersetMember with old weid and new exercise id', async () => {
    wrapper = mountGrouped()
    await flushPromises()

    await wrapper.get('[data-testid="superset-edit-A"]').trigger('click')
    await flushPromises()

    const store = useActiveWorkoutStore()
    const spy = vi.spyOn(store, 'swapSupersetMember').mockResolvedValue(undefined)

    // cambiar el primer miembro (weid 20): entra el buscador de sustituto
    ;(document.querySelector('[data-testid="superset-swap-20"]') as HTMLElement).click()
    await flushPromises()
    ;(document.querySelector('[data-testid^="superset-replacement-"]') as HTMLElement).click()
    await flushPromises()

    expect(spy).toHaveBeenCalledTimes(1)
    const [oldWeid, newExerciseId] = spy.mock.calls[0]
    expect(oldWeid).toBe(20)
    expect(typeof newExerciseId).toBe('number')
  })

  it('wires the positional rest gating: non-last member gets supersetLast=false, last and loose get true', async () => {
    wrapper = mountGrouped()
    await flushPromises()

    const cards = wrapper.findAllComponents(WorkoutExerciseCard)
    expect(cards).toHaveLength(3)
    expect(cards[0].props('supersetLabel')).toBe('A')
    expect(cards[0].props('supersetLast')).toBe(false)
    expect(cards[1].props('supersetLabel')).toBe('A')
    expect(cards[1].props('supersetLast')).toBe(true)
    expect(cards[2].props('supersetLabel')).toBeNull()
    expect(cards[2].props('supersetLast')).toBe(true)
  })

  it('logging on a NON-last member marks the NEXT member "Siguiente"; logging on the last member clears the mark', async () => {
    wrapper = mountGrouped()
    await flushPromises()

    expect(wrapper.find('[data-testid="superset-next-21"]').exists()).toBe(false)

    const cards = wrapper.findAllComponents(WorkoutExerciseCard)
    cards[0].vm.$emit('logged', false)
    await flushPromises()
    expect(wrapper.get('[data-testid="superset-next-21"]').text()).toBe('Siguiente')

    // cerrar la ronda (serie en el último miembro) limpia el marcado
    cards[1].vm.$emit('logged', false)
    await flushPromises()
    expect(wrapper.find('[data-testid="superset-next-21"]').exists()).toBe(false)
  })

  it('logging on a loose exercise clears any pending "Siguiente" mark (the chain was abandoned)', async () => {
    wrapper = mountGrouped()
    await flushPromises()

    const cards = wrapper.findAllComponents(WorkoutExerciseCard)
    cards[0].vm.$emit('logged', false)
    await flushPromises()
    expect(wrapper.find('[data-testid="superset-next-21"]').exists()).toBe(true)

    cards[2].vm.$emit('logged', false)
    await flushPromises()
    expect(wrapper.find('[data-testid="superset-next-21"]').exists()).toBe(false)
  })

  it('a group whose contiguity was broken (reorder mid-workout) renders NO group at all — singles dissolve', async () => {
    const broken = {
      ...groupedFixture,
      exercises: [
        { id: 20, exercise_id: 5, position: 1, note: null, rest_seconds: null, superset_group: 0, sets: [] },
        { id: 22, exercise_id: 7, position: 2, note: null, rest_seconds: null, superset_group: null, sets: [] },
        { id: 21, exercise_id: 6, position: 3, note: null, rest_seconds: null, superset_group: 0, sets: [] },
      ],
    }
    const activeWorkout = useActiveWorkoutStore()
    vi.spyOn(activeWorkout, 'resume').mockImplementation(async () => {
      activeWorkout.workout = broken as never
    })
    wrapper = mount(WorkoutView, { global: { plugins: [createI18nInstance()] }, attachTo: document.body })
    await flushPromises()

    expect(wrapper.find('[data-testid="superset-chip-20"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="superset-chip-21"]').exists()).toBe(false)
  })
})

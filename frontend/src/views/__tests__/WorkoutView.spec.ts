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
}))

import * as domain from '@/api/domain'
import { createI18nInstance } from '@/i18n'
import { useActiveWorkoutStore } from '@/stores/activeWorkout'
import { useAuthStore } from '@/stores/auth'
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
})

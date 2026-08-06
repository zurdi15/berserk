import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'

// uplot no corre bien en jsdom: se mockea igual que en progress.spec.ts para
// que el BkChart de ProgressView no reviente al montar tras elegir ejercicio
vi.mock('uplot', () => ({
  default: vi.fn(() => ({ destroy: vi.fn(), setSize: vi.fn() })),
  tzDate: vi.fn((date: Date) => date),
}))

const routerPush = vi.fn()
const routeQuery: Record<string, unknown> = {}
vi.mock('vue-router', () => ({
  useRouter: () => ({ push: routerPush }),
  useRoute: () => ({ query: routeQuery }),
}))

const EXERCISE = {
  id: 1,
  name_es: 'Press banca',
  name_en: 'Bench press',
  measurement: 'strength',
  owner_id: null,
  muscle_groups: [],
}

vi.mock('@/api/domain', () => ({
  getStreak: vi.fn(async () => ({ weeks: 2 })),
  getMonth: vi.fn(async () => ({ scheduled: [], workouts: [] })),
  getHeatmap: vi.fn(async () => []),
  getDistribution: vi.fn(async () => []),
  getRecords: vi.fn(async () => []),
  getSeries: vi.fn(async () => ({ series: [{ workout_id: 1, date: '2026-08-01', top_weight: 80, volume: 800, est_1rm: 90 }] })),
  listWorkouts: vi.fn(async () => []),
  listExercises: vi.fn(async () => [EXERCISE]),
  listMuscleGroups: vi.fn(async () => []),
  listBody: vi.fn(async () => []),
  listRoutines: vi.fn(async () => []),
  upsertBody: vi.fn(async () => ({})),
  deleteBody: vi.fn(async () => undefined),
}))

import type { UserOut } from '@/api/domain'
import * as domain from '@/api/domain'
import { createI18nInstance } from '@/i18n'
import { useActiveWorkoutStore } from '@/stores/activeWorkout'
import { useAthleteStore } from '@/stores/athlete'
import CalendarView from '@/views/CalendarView.vue'
import ProgressView from '@/views/ProgressView.vue'
import TodayView from '@/views/TodayView.vue'
import WorkoutView from '@/views/WorkoutView.vue'

const ATHLETE: UserOut = { id: 7, username: 'freyja', is_admin: false, locale: 'es', units: 'kg', timezone: 'UTC' }

function withI18n() {
  return { global: { plugins: [createI18nInstance()] } }
}

describe('TodayView athlete threading', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.mocked(domain.getStreak).mockClear()
    vi.mocked(domain.getMonth).mockClear()
    vi.mocked(domain.listWorkouts).mockClear()
    vi.mocked(domain.getRecords).mockClear()
    vi.mocked(domain.listExercises).mockClear()
    vi.mocked(domain.listMuscleGroups).mockClear()
  })

  it('threads the viewed athlete id through every read on mount', async () => {
    useAthleteStore().view(ATHLETE)
    mount(TodayView, withI18n())
    await flushPromises()

    expect(domain.getStreak).toHaveBeenCalledWith(7)
    expect(domain.getMonth).toHaveBeenCalledWith(expect.any(Number), expect.any(Number), 7)
    expect(domain.listWorkouts).toHaveBeenCalledWith(expect.objectContaining({ userId: 7 }))
    expect(domain.getRecords).toHaveBeenCalledWith({ userId: 7 })
    expect(domain.listMuscleGroups).toHaveBeenCalledWith(7)
  })

  it('re-fetches every read when switching athlete mid-session, and again on exit', async () => {
    const athlete = useAthleteStore()
    mount(TodayView, withI18n())
    await flushPromises()
    expect(domain.getStreak).toHaveBeenLastCalledWith(undefined)
    expect(domain.getRecords).toHaveBeenLastCalledWith({ userId: undefined })

    athlete.view(ATHLETE)
    await flushPromises()
    expect(domain.getStreak).toHaveBeenLastCalledWith(7)
    expect(domain.getRecords).toHaveBeenLastCalledWith({ userId: 7 })
    expect(domain.listWorkouts).toHaveBeenLastCalledWith(expect.objectContaining({ userId: 7 }))

    athlete.clear()
    await flushPromises()
    expect(domain.getStreak).toHaveBeenLastCalledWith(undefined)
    expect(domain.getRecords).toHaveBeenLastCalledWith({ userId: undefined })
  })
})

describe('CalendarView athlete threading', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.mocked(domain.getMonth).mockClear()
    vi.mocked(domain.getHeatmap).mockClear()
    vi.mocked(domain.listMuscleGroups).mockClear()
  })

  it('threads the viewed athlete id through every read on mount', async () => {
    useAthleteStore().view(ATHLETE)
    mount(CalendarView, withI18n())
    await flushPromises()

    expect(domain.getMonth).toHaveBeenCalledWith(expect.any(Number), expect.any(Number), 7)
    expect(domain.getHeatmap).toHaveBeenCalledWith(expect.any(Number), 7)
    expect(domain.listMuscleGroups).toHaveBeenCalledWith(7)
  })

  it('re-fetches month, heatmap and muscle groups when switching athlete, and again on exit', async () => {
    const athlete = useAthleteStore()
    mount(CalendarView, withI18n())
    await flushPromises()
    expect(domain.getMonth).toHaveBeenLastCalledWith(expect.any(Number), expect.any(Number), undefined)
    expect(domain.getHeatmap).toHaveBeenLastCalledWith(expect.any(Number), undefined)

    athlete.view(ATHLETE)
    await flushPromises()
    expect(domain.getMonth).toHaveBeenLastCalledWith(expect.any(Number), expect.any(Number), 7)
    expect(domain.getHeatmap).toHaveBeenLastCalledWith(expect.any(Number), 7)
    expect(domain.listMuscleGroups).toHaveBeenLastCalledWith(7)

    athlete.clear()
    await flushPromises()
    expect(domain.getMonth).toHaveBeenLastCalledWith(expect.any(Number), expect.any(Number), undefined)
    expect(domain.getHeatmap).toHaveBeenLastCalledWith(expect.any(Number), undefined)
    expect(domain.listMuscleGroups).toHaveBeenLastCalledWith(undefined)
  })
})

describe('ProgressView athlete threading', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.mocked(domain.getDistribution).mockClear()
    vi.mocked(domain.getRecords).mockClear()
    vi.mocked(domain.getSeries).mockClear()
    vi.mocked(domain.listBody).mockClear()
    vi.mocked(domain.listExercises).mockClear().mockResolvedValue([EXERCISE] as never)
  })

  it('threads the viewed athlete id through distribution and records on mount', async () => {
    useAthleteStore().view(ATHLETE)
    mount(ProgressView, withI18n())
    await flushPromises()

    expect(domain.getDistribution).toHaveBeenCalledWith(4, 7)
    expect(domain.getRecords).toHaveBeenCalledWith({ exercise_id: undefined, userId: 7 })
  })

  it('threads the viewed athlete id into the series fetch once an exercise is picked', async () => {
    useAthleteStore().view(ATHLETE)
    const wrapper = mount(ProgressView, withI18n())
    await flushPromises()

    await wrapper.find('[data-testid="exercise-option-1"]').trigger('click')
    await flushPromises()

    expect(domain.getSeries).toHaveBeenCalledWith(1, 7)
    expect(domain.getRecords).toHaveBeenCalledWith({ exercise_id: 1, userId: 7 })
  })

  it('threads the viewed athlete id into body entries on the cuerpo tab', async () => {
    useAthleteStore().view(ATHLETE)
    const wrapper = mount(ProgressView, withI18n())
    await flushPromises()

    // cuerpo es la 3ª pestaña (entrenos, récords, cuerpo) desde que récords
    // se separó de entrenos
    const mainTablist = wrapper.findAll('[role="tablist"]')[0]
    await mainTablist.findAll('[role="tab"]')[2].trigger('click')
    await flushPromises()

    expect(domain.listBody).toHaveBeenCalledWith(7)
  })

  it('re-fetches distribution and records when switching athlete, and again on exit', async () => {
    const athlete = useAthleteStore()
    mount(ProgressView, withI18n())
    await flushPromises()
    expect(domain.getDistribution).toHaveBeenLastCalledWith(4, undefined)

    athlete.view(ATHLETE)
    await flushPromises()
    expect(domain.getDistribution).toHaveBeenLastCalledWith(4, 7)
    expect(domain.getRecords).toHaveBeenLastCalledWith({ exercise_id: undefined, userId: 7 })

    athlete.clear()
    await flushPromises()
    expect(domain.getDistribution).toHaveBeenLastCalledWith(4, undefined)
    expect(domain.getRecords).toHaveBeenLastCalledWith({ exercise_id: undefined, userId: undefined })
  })
})

describe('WorkoutView ignores athlete viewing entirely', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.mocked(domain.listRoutines).mockClear()
    vi.mocked(domain.listExercises).mockClear().mockResolvedValue([] as never)
    vi.mocked(domain.listMuscleGroups).mockClear().mockResolvedValue([] as never)
  })

  it('loads its own catalog with no user_id even while viewing another athlete', async () => {
    const athlete = useAthleteStore()
    athlete.view(ATHLETE)

    const activeWorkout = useActiveWorkoutStore()
    vi.spyOn(activeWorkout, 'resume').mockResolvedValue(undefined)

    mount(WorkoutView, withI18n())
    await flushPromises()

    expect(domain.listRoutines).toHaveBeenCalledWith()
    expect(domain.listExercises).toHaveBeenCalledWith({})
    expect(domain.listMuscleGroups).toHaveBeenCalledWith()
  })
})

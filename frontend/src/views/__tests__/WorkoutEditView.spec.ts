import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const push = vi.fn()
const routeParams: Record<string, unknown> = { id: '4' }
vi.mock('vue-router', () => ({
  useRouter: () => ({ push }),
  useRoute: () => ({ params: routeParams }),
}))

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

vi.mock('@/api/domain', () => ({
  listExercises: vi.fn(async () => [exerciseFixture]),
  listMuscleGroups: vi.fn(async () => muscleGroupsFixture),
  getWorkout: vi.fn(),
  logSet: vi.fn(),
  updateSet: vi.fn(),
  deleteSet: vi.fn(),
  addWorkoutExercise: vi.fn(),
  removeWorkoutExercise: vi.fn(),
  reorderWorkoutExercises: vi.fn(),
  setWorkoutMuscleTags: vi.fn(),
  updateWorkout: vi.fn(),
}))

import * as domain from '@/api/domain'
import { createI18nInstance } from '@/i18n'
import { useToastStore } from '@/stores/toast'
import { useWorkoutEditorStore } from '@/stores/workoutEditor'
import WorkoutEditView from '../WorkoutEditView.vue'

const workoutFixture = {
  id: 4,
  date: '2026-07-20',
  started_at: '2026-07-20T12:00:00',
  ended_at: '2026-07-20T12:00:00',
  routine_id: null,
  note: null,
  feeling: null,
  exercises: [{ id: 20, exercise_id: 5, position: 0, note: null, sets: [] }],
  muscle_tag_ids: [],
}

function build() {
  return mount(WorkoutEditView, {
    global: { plugins: [createI18nInstance()] },
    attachTo: document.body,
  })
}

describe('WorkoutEditView', () => {
  let wrapper: VueWrapper | null = null

  beforeEach(() => {
    setActivePinia(createPinia())
    push.mockClear()
    routeParams.id = '4'
    vi.mocked(domain.getWorkout).mockResolvedValue(workoutFixture as never)
  })

  afterEach(() => {
    wrapper?.unmount()
    wrapper = null
  })

  it('loads the workout by the :id route param on mount', async () => {
    wrapper = build()
    await flushPromises()

    expect(domain.getWorkout).toHaveBeenCalledWith(4)
    expect(wrapper.text()).toContain('Press banca')
  })

  it('logs a set through workoutEditor.logSet with the full SetIn payload via a real submit', async () => {
    vi.mocked(domain.logSet).mockResolvedValue({
      set: { id: 101, set_number: 1, reps: 8, weight_kg: 20, duration_seconds: null, distance_m: null, is_warmup: false, rpe: null, completed_at: 'x' },
      new_records: [],
    } as never)

    wrapper = build()
    await flushPromises()

    await wrapper.find('form').trigger('submit')
    await flushPromises()

    expect(domain.logSet).toHaveBeenCalledWith(
      4,
      20,
      expect.objectContaining({ is_warmup: false, reps: expect.any(Number), weight_kg: expect.any(Number) }),
    )
  })

  it('never shows BkCelebration, and toasts the retro-PR count instead when logging a set produces new records', async () => {
    vi.mocked(domain.logSet).mockResolvedValue({
      set: { id: 101, set_number: 1, reps: 8, weight_kg: 100, duration_seconds: null, distance_m: null, is_warmup: false, rpe: null, completed_at: 'x' },
      new_records: [
        { id: 9, exercise_id: 5, kind: 'max_weight', value: 100, achieved_at: '2026-07-20T12:00:00' },
        { id: 10, exercise_id: 5, kind: 'est_1rm', value: 100, achieved_at: '2026-07-20T12:00:00' },
      ],
    } as never)
    const toast = useToastStore()

    wrapper = build()
    await flushPromises()
    expect(wrapper.findComponent({ name: 'BkCelebration' }).exists()).toBe(false)

    await wrapper.find('form').trigger('submit')
    await flushPromises()

    expect(wrapper.findComponent({ name: 'BkCelebration' }).exists()).toBe(false)
    expect(toast.toasts.some((t) => t.message === 'Récords recalculados: 2')).toBe(true)
  })

  it('does not toast when logging a set produces no new records', async () => {
    vi.mocked(domain.logSet).mockResolvedValue({
      set: { id: 101, set_number: 1, reps: 8, weight_kg: 20, duration_seconds: null, distance_m: null, is_warmup: false, rpe: null, completed_at: 'x' },
      new_records: [],
    } as never)
    const toast = useToastStore()

    wrapper = build()
    await flushPromises()

    await wrapper.find('form').trigger('submit')
    await flushPromises()

    expect(toast.toasts).toHaveLength(0)
  })

  it('edits the workout date through BkDateField, calling workoutEditor.patch', async () => {
    vi.mocked(domain.updateWorkout).mockResolvedValue({ ...workoutFixture, date: '2026-07-25' } as never)

    wrapper = build()
    await flushPromises()

    const dateTrigger = wrapper.get('[role="combobox"]')
    await dateTrigger.trigger('click')
    await flushPromises()

    const day25 = Array.from(document.querySelectorAll('[role="gridcell"]')).find((c) =>
      c.id.endsWith('2026-07-25'),
    ) as HTMLElement
    expect(day25).not.toBeUndefined()
    day25.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await flushPromises()

    expect(domain.updateWorkout).toHaveBeenCalledWith(4, { date: '2026-07-25' })
  })

  it('redirects to the calendar and toasts when the workout fails to load (e.g. not found)', async () => {
    vi.mocked(domain.getWorkout).mockRejectedValueOnce(new Error('not_found'))

    wrapper = build()
    await flushPromises()

    expect(push).toHaveBeenCalledWith({ name: 'calendar' })
  })
})

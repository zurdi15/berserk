import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/api/domain', () => ({
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
  updateSet: vi.fn(async () => ({
    id: 1,
    set_number: 1,
    reps: 5,
    weight_kg: 102.5,
    duration_seconds: null,
    distance_m: null,
    is_warmup: false,
    rpe: null,
    completed_at: 'x',
  })),
  getWorkout: vi.fn(async () => freeWorkout),
  deleteSet: vi.fn(async () => {}),
  removeWorkoutExercise: vi.fn(async () => {}),
  reorderWorkoutExercises: vi.fn(async () => freeWorkout),
}))

import * as domain from '@/api/domain'
import { createI18nInstance } from '@/i18n'
import { useActiveWorkoutStore } from '@/stores/activeWorkout'
import { useRestTimerStore } from '@/stores/restTimer'
import { useToastStore } from '@/stores/toast'
import { restFor } from '../rest'
import WorkoutExerciseCard from '../WorkoutExerciseCard.vue'

const pushExercise = {
  id: 20,
  exercise_id: 5,
  position: 0,
  note: null,
  sets: [
    { id: 1, set_number: 1, reps: 5, weight_kg: 100, duration_seconds: null, distance_m: null, is_warmup: false, rpe: null, completed_at: 'x' },
    { id: 2, set_number: 2, reps: 5, weight_kg: 40, duration_seconds: null, distance_m: null, is_warmup: true, rpe: null, completed_at: 'x' },
  ],
}

const routineWorkout = {
  id: 4,
  date: '2026-08-05',
  started_at: '2026-08-05T09:00:00Z',
  ended_at: null,
  routine_id: 1,
  note: null,
  feeling: null,
  exercises: [pushExercise],
  muscle_tag_ids: [],
}

const freeWorkout = { ...routineWorkout, id: 7, routine_id: null }

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

const muscleGroups = [{ id: 1, slug: 'chest', name_es: 'Pecho', name_en: 'Chest', owner_id: null }]

describe('restFor', () => {
  it('picks the routine rest_seconds for the exercise when the workout came from that routine', () => {
    expect(restFor(routineWorkout as never, routines as never, 5)).toBe(120)
  })

  it('falls back to 90 when the workout is free (no routine)', () => {
    expect(restFor(freeWorkout as never, routines as never, 5)).toBe(90)
  })

  it('falls back to 90 when the exercise is not part of the matched routine', () => {
    expect(restFor(routineWorkout as never, routines as never, 999)).toBe(90)
  })
})

function mountCard(overrides: Partial<Record<string, unknown>> = {}) {
  return mount(WorkoutExerciseCard, {
    props: {
      workoutExercise: pushExercise as never,
      exercise: exercise as never,
      muscleGroups: muscleGroups as never,
      routines: [] as never,
      exerciseIds: [20],
      units: 'kg',
      locale: 'es',
      ...overrides,
    },
    global: { plugins: [createI18nInstance()] },
  })
}

describe('WorkoutExerciseCard', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.mocked(domain.logSet).mockClear()
    vi.mocked(domain.updateSet).mockClear()
    vi.mocked(domain.deleteSet).mockClear()
    vi.mocked(domain.removeWorkoutExercise).mockClear()
    vi.mocked(domain.reorderWorkoutExercises).mockClear()
  })

  it('renders the exercise name, its primary-group rune and the formatted sets', () => {
    const activeWorkout = useActiveWorkoutStore()
    activeWorkout.workout = freeWorkout as never
    const wrapper = mountCard()
    expect(wrapper.text()).toContain('Press banca')
    expect(wrapper.findComponent({ name: 'BkRune' }).props('name')).toBe('chest')
    expect(wrapper.text()).toContain('100 kg')
  })

  it('marks warmup sets as ink-faint', () => {
    const activeWorkout = useActiveWorkoutStore()
    activeWorkout.workout = freeWorkout as never
    const wrapper = mountCard()
    const rows = wrapper.findAll('[data-testid^="set-row-"]')
    expect(rows[0].classes()).not.toContain('text-ink-faint')
    expect(rows[1].classes()).toContain('text-ink-faint')
  })

  it('logs a set through activeWorkout.logSet and starts the rest timer with the default 90s for a free workout', async () => {
    const activeWorkout = useActiveWorkoutStore()
    activeWorkout.workout = freeWorkout as never
    const restTimer = useRestTimerStore()
    const startSpy = vi.spyOn(restTimer, 'start')

    const wrapper = mountCard({ routines: [] })
    await wrapper.find('form').trigger('submit')
    await flushPromises()

    expect(domain.logSet).toHaveBeenCalledWith(
      7,
      20,
      expect.objectContaining({ is_warmup: false, reps: expect.any(Number), weight_kg: expect.any(Number) }),
    )
    expect(startSpy).toHaveBeenCalledWith(90)
  })

  it('starts the rest timer with the routine rest_seconds when the workout came from a routine', async () => {
    const activeWorkout = useActiveWorkoutStore()
    activeWorkout.workout = routineWorkout as never
    vi.mocked(domain.getWorkout).mockResolvedValueOnce(routineWorkout as never)
    const restTimer = useRestTimerStore()
    const startSpy = vi.spyOn(restTimer, 'start')

    const wrapper = mountCard({ routines })
    await wrapper.find('form').trigger('submit')
    await flushPromises()

    expect(startSpy).toHaveBeenCalledWith(120)
  })

  it('deletes a set via activeWorkout.deleteSet after confirming with a real click', async () => {
    const activeWorkout = useActiveWorkoutStore()
    activeWorkout.workout = freeWorkout as never
    const wrapper = mountCard()

    await wrapper.find('[data-testid="delete-set-1"]').trigger('click')
    await flushPromises()
    expect(domain.deleteSet).not.toHaveBeenCalled()

    await wrapper.find('[data-testid="confirm-delete-set-1"]').trigger('click')
    await flushPromises()

    expect(domain.deleteSet).toHaveBeenCalledWith(7, 20, 1)
  })

  it('cancelling the delete-set confirm never calls activeWorkout.deleteSet', async () => {
    const activeWorkout = useActiveWorkoutStore()
    activeWorkout.workout = freeWorkout as never
    const wrapper = mountCard()

    await wrapper.find('[data-testid="delete-set-1"]').trigger('click')
    await flushPromises()

    await wrapper.find('[data-testid="cancel-delete-set-1"]').trigger('click')
    await flushPromises()

    expect(domain.deleteSet).not.toHaveBeenCalled()
    // el cancelar debe devolver el botón de borrar, no dejar la fila colgada en confirmación
    expect(wrapper.find('[data-testid="delete-set-1"]').exists()).toBe(true)
  })

  it('edits a set via activeWorkout.updateSet with the full SetIn payload after a real click-through (I5)', async () => {
    const activeWorkout = useActiveWorkoutStore()
    activeWorkout.workout = freeWorkout as never
    const wrapper = mountCard()

    await wrapper.find('[data-testid="edit-set-1"]').trigger('click')
    await flushPromises()

    // el set 1 del fixture: reps 5, weight_kg 100, is_warmup false, sin rpe
    const setRow = wrapper.find('[data-testid="set-row-1"]')
    const weightPlus = setRow.findAll('button[aria-label="Aumentar"]')[0]
    await weightPlus.trigger('click', { detail: 0 })
    await setRow.find('form').trigger('submit')
    await flushPromises()

    // payload COMPLETO (footgun del full-replace del backend): reps y
    // is_warmup viajan aunque solo se haya tocado el peso
    expect(domain.updateSet).toHaveBeenCalledWith(7, 20, 1, {
      is_warmup: false,
      reps: 5,
      weight_kg: 102.5,
    })
  })

  it('cancelling a set edit never calls activeWorkout.updateSet and restores the static row', async () => {
    const activeWorkout = useActiveWorkoutStore()
    activeWorkout.workout = freeWorkout as never
    const wrapper = mountCard()

    await wrapper.find('[data-testid="edit-set-1"]').trigger('click')
    await flushPromises()

    await wrapper.find('[data-testid="cancel-edit-set-1"]').trigger('click')
    await flushPromises()

    expect(domain.updateSet).not.toHaveBeenCalled()
    expect(wrapper.find('[data-testid="edit-set-1"]').exists()).toBe(true)
  })

  it('removes the exercise via activeWorkout.removeExercise after confirming with a real click', async () => {
    const activeWorkout = useActiveWorkoutStore()
    activeWorkout.workout = freeWorkout as never
    const wrapper = mountCard()

    await wrapper.find('[data-testid="remove-exercise-20"]').trigger('click')
    await flushPromises()
    expect(domain.removeWorkoutExercise).not.toHaveBeenCalled()

    await wrapper.find('[data-testid="confirm-remove-exercise-20"]').trigger('click')
    await flushPromises()

    expect(domain.removeWorkoutExercise).toHaveBeenCalledWith(7, 20)
  })

  it('reorders via activeWorkout.reorder with the full id list when moving down', async () => {
    const activeWorkout = useActiveWorkoutStore()
    activeWorkout.workout = freeWorkout as never
    const wrapper = mountCard({ exerciseIds: [20, 30] })

    await wrapper.find('[data-testid="move-down-20"]').trigger('click')
    await flushPromises()

    expect(domain.reorderWorkoutExercises).toHaveBeenCalledWith(7, [30, 20])
  })

  it('hides the move-up control on the first exercise', () => {
    const activeWorkout = useActiveWorkoutStore()
    activeWorkout.workout = freeWorkout as never
    const wrapper = mountCard({ exerciseIds: [20, 30] })
    expect(wrapper.find('[data-testid="move-up-20"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="move-down-20"]').exists()).toBe(true)
  })

  it('a rejected logSet surfaces a toast and leaves the form usable', async () => {
    const activeWorkout = useActiveWorkoutStore()
    activeWorkout.workout = freeWorkout as never
    const toast = useToastStore()
    vi.mocked(domain.logSet).mockRejectedValueOnce(new Error('network down'))

    const wrapper = mountCard()
    await wrapper.find('form').trigger('submit')
    await flushPromises()

    expect(toast.toasts.length).toBeGreaterThan(0)
    // no wedge: el formulario sigue montado y se puede reintentar el envío
    expect(wrapper.find('form').exists()).toBe(true)
    vi.mocked(domain.logSet).mockClear()
    await wrapper.find('form').trigger('submit')
    await flushPromises()
    expect(domain.logSet).toHaveBeenCalled()
  })

  it('a rejected reorder (move-down) surfaces a toast instead of failing silently', async () => {
    const activeWorkout = useActiveWorkoutStore()
    activeWorkout.workout = freeWorkout as never
    const toast = useToastStore()
    vi.mocked(domain.reorderWorkoutExercises).mockRejectedValueOnce(new Error('conflict'))

    const wrapper = mountCard({ exerciseIds: [20, 30] })
    await wrapper.find('[data-testid="move-down-20"]').trigger('click')
    await flushPromises()

    expect(toast.toasts.length).toBeGreaterThan(0)
  })
})

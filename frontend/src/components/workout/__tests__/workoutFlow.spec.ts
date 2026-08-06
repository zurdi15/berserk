import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'

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
  sets: [
    { id: 1, set_number: 1, reps: 5, weight_kg: 100, duration_seconds: null, distance_m: null, is_warmup: false, rpe: null, completed_at: 'x' },
    { id: 2, set_number: 2, reps: 5, weight_kg: 40, duration_seconds: null, distance_m: null, is_warmup: true, rpe: null, completed_at: 'x' },
  ],
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

const muscleGroups = [{ id: 1, slug: 'chest', name_es: 'Pecho', name_en: 'Chest', owner_id: null }]

describe('restFor', () => {
  it('picks the routine rest_seconds for the exercise when the workout came from that routine', () => {
    expect(restFor(1, routines as never, 5)).toBe(120)
  })

  it('falls back to 90 when the workout is free (no routine)', () => {
    expect(restFor(null, routines as never, 5)).toBe(90)
  })

  it('falls back to 90 when the exercise is not part of the matched routine', () => {
    expect(restFor(1, routines as never, 999)).toBe(90)
  })
})

// round 8: WorkoutExerciseCard dejó de leer un store propio (ver
// workoutActions.ts) — las 6 acciones de escritura llegan como prop
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
  })
}

describe('WorkoutExerciseCard', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('renders the exercise name, its primary-group rune and the formatted sets', () => {
    const wrapper = mountCard()
    expect(wrapper.text()).toContain('Press banca')
    expect(wrapper.findComponent({ name: 'BkRune' }).props('name')).toBe('chest')
    expect(wrapper.text()).toContain('100 kg')
  })

  it('marks warmup sets as ink-faint', () => {
    const wrapper = mountCard()
    const rows = wrapper.findAll('[data-testid^="set-row-"]')
    expect(rows[0].classes()).not.toContain('text-ink-faint')
    expect(rows[1].classes()).toContain('text-ink-faint')
  })

  it('logs a set through actions.logSet and starts the rest timer with the default 90s for a free workout', async () => {
    const actions = makeActions()
    const restTimer = useRestTimerStore()
    const startSpy = vi.spyOn(restTimer, 'start')

    const wrapper = mountCard({ actions, routines: [], routineId: null })
    await wrapper.find('form').trigger('submit')
    await flushPromises()

    expect(actions.logSet).toHaveBeenCalledWith(
      20,
      expect.objectContaining({ is_warmup: false, reps: expect.any(Number), weight_kg: expect.any(Number) }),
    )
    expect(startSpy).toHaveBeenCalledWith(90)
  })

  it('starts the rest timer with the routine rest_seconds when the workout came from a routine', async () => {
    const actions = makeActions()
    const restTimer = useRestTimerStore()
    const startSpy = vi.spyOn(restTimer, 'start')

    const wrapper = mountCard({ actions, routines, routineId: 1 })
    await wrapper.find('form').trigger('submit')
    await flushPromises()

    expect(startSpy).toHaveBeenCalledWith(120)
  })

  it('does not start the rest timer when restEnabled is false (retro editor)', async () => {
    const actions = makeActions()
    const restTimer = useRestTimerStore()
    const startSpy = vi.spyOn(restTimer, 'start')

    const wrapper = mountCard({ actions, restEnabled: false })
    await wrapper.find('form').trigger('submit')
    await flushPromises()

    expect(actions.logSet).toHaveBeenCalled()
    expect(startSpy).not.toHaveBeenCalled()
  })

  it('emits recorded with the new records so the retro editor can toast their count instead of celebrating', async () => {
    const actions = makeActions({
      logSet: vi.fn(async () => ({
        set: { id: 101, set_number: 1, reps: 8, weight_kg: 20, duration_seconds: null, distance_m: null, is_warmup: false, rpe: null, completed_at: 'x' },
        new_records: [{ id: 9, exercise_id: 5, kind: 'max_weight', value: 100, achieved_at: 'x' }],
      })),
    })
    const wrapper = mountCard({ actions, restEnabled: false })

    await wrapper.find('form').trigger('submit')
    await flushPromises()

    expect(wrapper.emitted('recorded')).toBeTruthy()
    expect(wrapper.emitted('recorded')![0][0]).toEqual([
      { id: 9, exercise_id: 5, kind: 'max_weight', value: 100, achieved_at: 'x' },
    ])
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

  it('edits a set via actions.updateSet with the full SetIn payload after a real click-through (I5)', async () => {
    const actions = makeActions()
    const wrapper = mountCard({ actions })

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
    expect(actions.updateSet).toHaveBeenCalledWith(20, 1, {
      is_warmup: false,
      reps: 5,
      weight_kg: 102.5,
    })
  })

  it('cancelling a set edit never calls actions.updateSet and restores the static row', async () => {
    const actions = makeActions()
    const wrapper = mountCard({ actions })

    await wrapper.find('[data-testid="edit-set-1"]').trigger('click')
    await flushPromises()

    await wrapper.find('[data-testid="cancel-edit-set-1"]').trigger('click')
    await flushPromises()

    expect(actions.updateSet).not.toHaveBeenCalled()
    expect(wrapper.find('[data-testid="edit-set-1"]').exists()).toBe(true)
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

  it('a rejected logSet surfaces a toast and leaves the form usable', async () => {
    const toast = useToastStore()
    const actions = makeActions({ logSet: vi.fn().mockRejectedValueOnce(new Error('network down')) })

    const wrapper = mountCard({ actions })
    await wrapper.find('form').trigger('submit')
    await flushPromises()

    expect(toast.toasts.length).toBeGreaterThan(0)
    // no wedge: el formulario sigue montado y se puede reintentar el envío
    expect(wrapper.find('form').exists()).toBe(true)
    actions.logSet = vi.fn(async () => ({ set: pushExercise.sets[0], new_records: [] }))
    await wrapper.find('form').trigger('submit')
    await flushPromises()
    expect(actions.logSet).toHaveBeenCalled()
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

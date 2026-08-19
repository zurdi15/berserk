import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const push = vi.fn()
const replace = vi.fn()
const routeParams: Record<string, string> = { routineId: '7' }
vi.mock('vue-router', () => ({
  useRouter: () => ({ push, replace, back: vi.fn() }),
  useRoute: () => ({ params: routeParams }),
}))

const routines = [
  {
    id: 7,
    name: 'Brazos – Cardio',
    description: 'Día de brazos',
    rune: 'biceps',
    color: null,
    exercises: [
      { id: 91, exercise_id: 1, position: 0, target_sets: 3, target_reps: 10, target_weight_kg: 26, rest_seconds: 90, superset_group: null, block_label: 'Calentamiento' },
      { id: 92, exercise_id: 2, position: 1, target_sets: 4, target_reps: 8, target_weight_kg: 40, rest_seconds: 120, superset_group: 1, block_label: 'Fuerza' },
      { id: 93, exercise_id: 3, position: 2, target_sets: 4, target_reps: 12, target_weight_kg: 20, rest_seconds: 120, superset_group: 1, block_label: 'Fuerza' },
    ],
  },
]
const catalog = [
  { id: 1, name_es: 'Plancha comando', name_en: 'Commando plank', measurement: 'strength', owner_id: null, has_image: false, muscle_groups: [] },
  { id: 2, name_es: 'Press banca', name_en: 'Bench press', measurement: 'strength', owner_id: null, has_image: true, muscle_groups: [] },
  { id: 3, name_es: 'Curl', name_en: 'Curl', measurement: 'strength', owner_id: null, has_image: false, muscle_groups: [] },
]

vi.mock('@/api/domain', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  listRoutines: vi.fn(async () => routines),
  listExercises: vi.fn(async () => catalog),
  listMuscleGroups: vi.fn(async () => []),
  getRotation: vi.fn(async () => ({ routines, next_position: 0 })),
}))

import { createI18nInstance } from '@/i18n'
import { useActiveWorkoutStore } from '@/stores/activeWorkout'
import WorkoutStartView from '@/views/WorkoutStartView.vue'

function build() {
  return mount(WorkoutStartView, { global: { plugins: [createI18nInstance()] } })
}

// facelift fase 3: la pantalla de PRE-INICIO — hero + resumen + bloques +
// "Empezar entrenamiento"
describe('WorkoutStartView', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    push.mockClear()
    replace.mockClear()
    routeParams.routineId = '7'
  })

  it('renders the routine name, the "{b} bloques · {n} ejercicios · ~{min} min" summary and the per-block sections', async () => {
    const wrapper = build()
    await flushPromises()

    expect(wrapper.text()).toContain('Brazos – Cardio')
    // 2 bloques, 3 ejercicios; estimación: bloque1 3×(45+90)=405s; bloque2
    // superserie: trabajo (4+4)×45=360 + 4 rondas ×120=480 → 840s; total
    // 1245s ≈ 20.75min → 25
    expect(wrapper.get('[data-testid="prestart-summary"]').text()).toBe('2 bloques · 3 ejercicios · ~25 min')
    expect(wrapper.text()).toContain('Calentamiento')
    expect(wrapper.text()).toContain('Fuerza')
    expect(wrapper.get('[data-testid="prestart-exercise-91"]').text()).toContain('3 × 10')
    // miembros de superserie llevan su chip
    expect(wrapper.get('[data-testid="prestart-exercise-92"]').text()).toContain('Superserie A')
  })

  it('shows the HOY chip when the routine is the rotation next', async () => {
    const wrapper = build()
    await flushPromises()
    expect(wrapper.find('[data-testid="prestart-today-chip"]').exists()).toBe(true)
  })

  it('the CTA starts the routine through the store and navigates to the player', async () => {
    const activeWorkout = useActiveWorkoutStore()
    const startSpy = vi.spyOn(activeWorkout, 'start').mockResolvedValue(undefined as never)

    const wrapper = build()
    await flushPromises()

    await wrapper.get('[data-testid="prestart-start-btn"]').trigger('click')
    await flushPromises()

    expect(startSpy).toHaveBeenCalledWith({ routine_id: 7 })
    expect(push).toHaveBeenCalledWith({ name: 'workout' })
  })

  it('with an active workout the CTA navigates to it without starting another', async () => {
    const activeWorkout = useActiveWorkoutStore()
    activeWorkout.workout = { id: 9 } as never
    const startSpy = vi.spyOn(activeWorkout, 'start')

    const wrapper = build()
    await flushPromises()

    await wrapper.get('[data-testid="prestart-start-btn"]').trigger('click')
    expect(startSpy).not.toHaveBeenCalled()
    expect(push).toHaveBeenCalledWith({ name: 'workout' })
  })

  it('an unknown routine id redirects back to the workout hub', async () => {
    routeParams.routineId = '999'
    build()
    await flushPromises()
    expect(replace).toHaveBeenCalledWith({ name: 'workout' })
  })
})

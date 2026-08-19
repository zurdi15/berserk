import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const push = vi.fn()
const back = vi.fn()
const mockRoute = { params: { exerciseId: '5' } }
vi.mock('vue-router', () => ({
  useRouter: () => ({ push, back, options: { history: { state: { back: null } } } }),
  useRoute: () => mockRoute,
}))

vi.mock('uplot', () => ({
  default: vi.fn(() => ({ destroy: vi.fn(), setSize: vi.fn(), setData: vi.fn() })),
  tzDate: vi.fn((date: Date) => date),
}))

const fixtures = vi.hoisted(() => ({
  exercises: [
    {
      id: 5,
      name_es: 'Press banca',
      name_en: 'Bench press',
      measurement: 'strength',
      owner_id: null,
      muscle_groups: [{ muscle_group_id: 1, is_primary: true }],
    },
  ],
  muscleGroups: [{ id: 1, slug: 'chest', name_es: 'Pecho', name_en: 'Chest', owner_id: null }],
  series: [
    { workout_id: 1, date: '2026-08-01', top_weight: 60, volume: 480, est_1rm: 70, top_level: 0 },
    { workout_id: 2, date: '2026-08-03', top_weight: 62.5, volume: 500, est_1rm: 72, top_level: 0 },
  ],
  records: [
    { id: 1, exercise_id: 5, kind: 'max_weight', value: 62.5, load_mode: 'weight', achieved_at: '2026-08-03T00:00:00Z' },
  ],
  sessions: [
    {
      workout_id: 2,
      date: '2026-08-03',
      sets: [
        { reps: 8, weight_kg: 62.5, duration_seconds: null, distance_m: null, is_warmup: false, load_mode: 'weight' },
        { reps: 6, weight_kg: 62.5, duration_seconds: null, distance_m: null, is_warmup: false, load_mode: 'weight' },
      ],
    },
    {
      workout_id: 1,
      date: '2026-08-01',
      sets: [
        { reps: 8, weight_kg: 60, duration_seconds: null, distance_m: null, is_warmup: false, load_mode: 'weight' },
      ],
    },
  ],
}))

vi.mock('@/api/domain', () => ({
  listExercises: vi.fn(async () => fixtures.exercises),
  listMuscleGroups: vi.fn(async () => fixtures.muscleGroups),
  getSeries: vi.fn(async () => ({ series: fixtures.series })),
  getRecords: vi.fn(async () => fixtures.records),
  getExerciseSessions: vi.fn(async () => fixtures.sessions),
  exerciseImageUrl: vi.fn((id: number) => `/api/v1/exercises/${id}/image`),
}))

import * as domain from '@/api/domain'
import { createI18nInstance } from '@/i18n'
import ExerciseDetailView from '@/views/ExerciseDetailView.vue'

function build() {
  return mount(ExerciseDetailView, { global: { plugins: [createI18nInstance()] } })
}

// v0.24.0 — vista detalle por ejercicio: foto grande + récords + chart con
// métrica/rango + historial completo de sesiones
describe('ExerciseDetailView', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    push.mockClear()
  })

  it('loads everything in parallel and renders name, record chip and the session history', async () => {
    const wrapper = build()
    await flushPromises()

    expect(domain.getExerciseSessions).toHaveBeenCalledWith(5, undefined)
    expect(wrapper.text()).toContain('Press banca')
    expect(wrapper.get('[data-testid="detail-max-weight"]').text()).toContain('62.5')

    // sesiones: la más reciente primero, con sus series formateadas
    const sessionCards = wrapper.findAll('[data-testid^="detail-session-"]')
    expect(sessionCards).toHaveLength(2)
    expect(sessionCards[0].text()).toContain('S1 · 8 × 62.5 kg')
    expect(sessionCards[0].text()).toContain('S2 · 6 × 62.5 kg')
    expect(sessionCards[1].text()).toContain('S1 · 8 × 60 kg')
  })

  it('renders the metric tabs and the range chips over the chart', async () => {
    const wrapper = build()
    await flushPromises()

    const tabs = wrapper.findAll('[role="tab"]').map((tab) => tab.text())
    expect(tabs).toEqual(['Peso', 'Volumen', 'Est. 1RM'])
    expect(wrapper.find('[data-testid="chart-range-3m"]').exists()).toBe(true)
    expect(wrapper.findComponent({ name: 'BkChart' }).props('suffix')).toBe(' kg')
  })

  // el nombre de view-transition del hero no se puede asertar por DOM en
  // happy-dom (descarta propiedades CSS que no conoce) — la utilidad de
  // navegación se cubre en utils/__tests__/viewTransition.spec.ts y el morph
  // real se verifica en Chromium (E2E)
  it('renders the hero media (morph target) next to the group chip', async () => {
    const wrapper = build()
    await flushPromises()

    expect(wrapper.find('[data-testid="exercise-detail-media"]').exists()).toBe(true)
    expect(wrapper.text()).toContain('Pecho')
  })

  it('back falls to the progress section when there is no in-app history', async () => {
    const wrapper = build()
    await flushPromises()

    await wrapper.get('[data-testid="exercise-detail-back"]').trigger('click')
    expect(push).toHaveBeenCalledWith({ name: 'progress' })
    expect(back).not.toHaveBeenCalled()
  })
})

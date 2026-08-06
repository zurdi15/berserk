import type { VueWrapper } from '@vue/test-utils'
import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// vi.mock se hoist-ea por encima de los imports: las fixtures que usan las
// factories deben declararse con vi.hoisted para no chocar con la TDZ
const fixtures = vi.hoisted(() => ({
  exercises: [
    {
      id: 1,
      name_es: 'Press banca',
      name_en: 'Bench press',
      measurement: 'strength',
      owner_id: null,
      muscle_groups: [{ muscle_group_id: 1, is_primary: true }],
    },
    {
      id: 2,
      name_es: 'Sentadilla',
      name_en: 'Squat',
      measurement: 'strength',
      owner_id: null,
      muscle_groups: [{ muscle_group_id: 2, is_primary: true }],
    },
  ],
  muscleGroups: [
    { id: 1, slug: 'chest', name_es: 'Pecho', name_en: 'Chest', owner_id: null },
    { id: 2, slug: 'legs', name_es: 'Piernas', name_en: 'Legs', owner_id: null },
  ],
  distribution: [
    { muscle_group_id: 1, sets: 20 },
    { muscle_group_id: 2, sets: 40 },
  ],
  records: [
    { id: 10, exercise_id: 1, kind: 'max_weight', value: 100, achieved_at: '2026-08-01T00:00:00Z' },
    { id: 11, exercise_id: 2, kind: 'max_volume', value: 1200, achieved_at: '2026-07-01T00:00:00Z' },
  ],
  series: [
    { workout_id: 1, date: '2026-07-01', top_weight: 80, volume: 800, est_1rm: 90 },
    { workout_id: 2, date: '2026-07-08', top_weight: 85, volume: 900, est_1rm: 95 },
  ],
  // solo el ejercicio 1 (Press banca) tiene series registradas (item 5)
  trainedExerciseIds: [1],
  bodyEntries: [
    { date: '2026-07-01', weight_kg: 84, waist_cm: 90, chest_cm: null, arm_cm: null, thigh_cm: null, hip_cm: null },
    { date: '2026-07-08', weight_kg: 83, waist_cm: null, chest_cm: null, arm_cm: null, thigh_cm: null, hip_cm: null },
  ],
  // números elegidos para que cada derivación caiga en un valor exacto y sin
  // ambigüedad de redondeo: 457200s = 127h en punto, 36000s = 10h en punto,
  // 52340m -> 52.3km (redondeo a 1 decimal), 5400s = 90min = "1h 30min"
  stats: {
    total_workouts: 12,
    total_gym_seconds: 457200,
    total_cardio_seconds: 36000,
    total_distance_m: 52340,
    total_volume_kg: 102345,
    total_sets: 480,
    total_reps: 3600,
    prs_count: 27,
    avg_session_seconds: 5400,
    longest_streak_weeks: 6,
  },
}))

vi.mock('uplot', () => ({
  default: vi.fn(() => ({ destroy: vi.fn(), setSize: vi.fn(), setData: vi.fn() })),
  tzDate: vi.fn((date: Date) => date),
}))

vi.mock('@/utils/apiErrors', () => ({
  toastApiError: vi.fn(),
}))

vi.mock('@/api/domain', () => ({
  listExercises: vi.fn(async () => fixtures.exercises),
  listMuscleGroups: vi.fn(async () => fixtures.muscleGroups),
  getDistribution: vi.fn(async () => fixtures.distribution),
  getRecords: vi.fn(async () => fixtures.records),
  getSeries: vi.fn(async () => ({ series: fixtures.series })),
  getTrainedExercises: vi.fn(async () => ({ exercise_ids: fixtures.trainedExerciseIds })),
  getStats: vi.fn(async () => fixtures.stats),
  listBody: vi.fn(async () => fixtures.bodyEntries),
  upsertBody: vi.fn(async () => fixtures.bodyEntries[0]),
  deleteBody: vi.fn(async () => undefined),
}))

import { barWidth } from '@/components/progress/distribution'
import { seriesFor } from '@/components/progress/series'
import BodySection from '@/components/progress/BodySection.vue'
import DistributionBars from '@/components/progress/DistributionBars.vue'
import ExercisePicker from '@/components/progress/ExercisePicker.vue'
import PrList from '@/components/progress/PrList.vue'
import StatsGrid from '@/components/progress/StatsGrid.vue'
import * as domain from '@/api/domain'
import { createI18nInstance } from '@/i18n'
import { useAthleteStore } from '@/stores/athlete'
import { useAuthStore } from '@/stores/auth'
import { core } from '@/tokens'
import { formatDateShort, todayIso } from '@/utils/dates'
import { kgToDisplay } from '@/utils/units'
import ProgressView from '@/views/ProgressView.vue'

function withI18n() {
  return { global: { plugins: [createI18nInstance()] } }
}

describe('seriesFor', () => {
  it('maps top_weight to raw kg values by default', () => {
    expect(seriesFor(fixtures.series as never, 'top_weight', 'kg')).toEqual([
      { date: '2026-07-01', value: 80 },
      { date: '2026-07-08', value: 85 },
    ])
  })

  it('switches to est_1rm values when the metric flips', () => {
    expect(seriesFor(fixtures.series as never, 'est_1rm', 'kg')).toEqual([
      { date: '2026-07-01', value: 90 },
      { date: '2026-07-08', value: 95 },
    ])
  })

  it('converts volume to lb display units via kgToDisplay', () => {
    expect(seriesFor(fixtures.series as never, 'volume', 'lb')).toEqual([
      { date: '2026-07-01', value: kgToDisplay(800, 'lb') },
      { date: '2026-07-08', value: kgToDisplay(900, 'lb') },
    ])
  })
})

describe('barWidth', () => {
  it('computes the percentage relative to the max', () => {
    expect(barWidth(31, 50)).toBe('62%')
  })

  it('rounds to the nearest integer percentage', () => {
    expect(barWidth(1, 3)).toBe('33%')
  })

  it('returns 0% when max is zero or negative', () => {
    expect(barWidth(5, 0)).toBe('0%')
  })
})

describe('DistributionBars', () => {
  // reduced-motion forzado: estos tests leen el número final sin avanzar rAF —
  // useAnimatedNumber (item 1) salta directo al objetivo en este modo
  beforeEach(() => vi.spyOn(window, 'matchMedia').mockReturnValue({ matches: true } as MediaQueryList))
  afterEach(() => vi.restoreAllMocks())

  it('renders bars sorted by sets desc, each with rune, name and bar width', () => {
    const wrapper = mount(DistributionBars, {
      props: { items: fixtures.distribution as never, groups: fixtures.muscleGroups as never },
      ...withI18n(),
    })
    const rows = wrapper.findAll('[data-testid^="distribution-row-"]')
    expect(rows).toHaveLength(2)

    // legs (40 sets) va primero: mayor barra arriba
    expect(rows[0].attributes('data-testid')).toBe('distribution-row-2')
    expect(rows[0].text()).toContain('Piernas')
    expect(rows[0].find('[data-testid="distribution-sets"]').text()).toBe('40')

    expect(rows[1].attributes('data-testid')).toBe('distribution-row-1')
    expect(rows[1].text()).toContain('Pecho')
    expect(rows[1].find('[data-testid="distribution-sets"]').text()).toBe('20')

    const runes = wrapper.findAllComponents({ name: 'BkRune' })
    expect(runes[0].props('name')).toBe('legs')
    expect(runes[1].props('name')).toBe('chest')
  })

  it('shows the empty state when there are no items', () => {
    const wrapper = mount(DistributionBars, { props: { items: [], groups: [] }, ...withI18n() })
    expect(wrapper.text()).toContain('Aún no hay datos de distribución')
  })

  it('item 6: bars carry the growth animation class with a per-bar --bar-dur proportional to the bar\'s magnitude (longer bar takes longer)', () => {
    const wrapper = mount(DistributionBars, {
      props: { items: fixtures.distribution as never, groups: fixtures.muscleGroups as never },
      ...withI18n(),
    })
    const rows = wrapper.findAll('[data-testid^="distribution-row-"]')
    // legs (40/40 sets = 100% del máximo) primero, pecho (20/40 = 50%) segundo
    // — mismo orden que el test de arriba
    const legsBar = rows[0].find('.bk-grow-x')
    const chestBar = rows[1].find('.bk-grow-x')
    expect(legsBar.exists()).toBe(true)
    expect(chestBar.exists()).toBe(true)

    const legsDur = parseInt((legsBar.element as HTMLElement).style.getPropertyValue('--bar-dur'), 10)
    const chestDur = parseInt((chestBar.element as HTMLElement).style.getPropertyValue('--bar-dur'), 10)

    // barra al 100% del máximo: la duración completa del token base (dur[5])
    expect(legsDur).toBe(parseInt(core.dur[5], 10))
    // barra al 50%: la mitad — y por tanto más corta que la de legs (100%)
    expect(chestDur).toBeLessThan(legsDur)
    expect(chestDur).toBe(Math.round(parseInt(core.dur[5], 10) * 0.5))
  })

  it('item 6: a tiny bar still gets a floor duration (dur[1]) instead of an instant/near-zero animation', () => {
    const tinyItems = [
      { muscle_group_id: 1, sets: 1 },
      { muscle_group_id: 2, sets: 1000 },
    ]
    const wrapper = mount(DistributionBars, {
      props: { items: tinyItems as never, groups: fixtures.muscleGroups as never },
      ...withI18n(),
    })
    const rows = wrapper.findAll('[data-testid^="distribution-row-"]')
    const tinyBar = rows[1].find('.bk-grow-x') // 1/1000 sets: la barra minúscula, ordenada al final (desc)
    const tinyDur = parseInt((tinyBar.element as HTMLElement).style.getPropertyValue('--bar-dur'), 10)
    expect(tinyDur).toBe(parseInt(core.dur[1], 10))
  })
})

describe('PrList', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    // reduced-motion forzado: mismo motivo que en DistributionBars arriba
    vi.spyOn(window, 'matchMedia').mockReturnValue({ matches: true } as MediaQueryList)
  })
  afterEach(() => vi.restoreAllMocks())

  it('renders each record with kind label, exercise name, ember value and date', () => {
    const wrapper = mount(PrList, {
      props: { records: fixtures.records as never, exercises: fixtures.exercises as never },
      ...withI18n(),
    })
    const rows = wrapper.findAll('[data-testid^="pr-row-"]')
    expect(rows).toHaveLength(2)
    expect(rows[0].text()).toContain('Press banca')
    expect(rows[0].text()).toContain('Peso Máx')
    expect(rows[0].find('[data-testid="pr-value"]').text()).toBe('100 kg')
  })

  it('renders max_volume through formatWeight too (kg-based, same as max_weight/est_1rm)', () => {
    const wrapper = mount(PrList, {
      props: { records: fixtures.records as never, exercises: fixtures.exercises as never },
      ...withI18n(),
    })
    const rows = wrapper.findAll('[data-testid^="pr-row-"]')
    expect(rows[1].find('[data-testid="pr-value"]').text()).toBe('1200 kg')
  })

  it('item 6: max_weight (real, logged) keeps its decimal; est_1rm/max_volume (derived) round to whole kg', () => {
    const fractionalRecords = [
      { id: 20, exercise_id: 1, kind: 'max_weight', value: 47.5, achieved_at: '2026-08-01T00:00:00Z' },
      { id: 21, exercise_id: 1, kind: 'est_1rm', value: 61.75, achieved_at: '2026-08-01T00:00:00Z' },
      { id: 22, exercise_id: 1, kind: 'max_volume', value: 1567.5, achieved_at: '2026-08-01T00:00:00Z' },
    ]
    const wrapper = mount(PrList, {
      props: { records: fractionalRecords as never, exercises: fixtures.exercises as never },
      ...withI18n(),
    })
    const rows = wrapper.findAll('[data-testid^="pr-row-"]')
    expect(rows[0].find('[data-testid="pr-value"]').text()).toBe('47.5 kg') // real: conserva el decimal
    expect(rows[1].find('[data-testid="pr-value"]').text()).toBe('62 kg') // derivado: 61.75 → 62
    expect(rows[2].find('[data-testid="pr-value"]').text()).toBe('1568 kg') // derivado: 1567.5 → 1568
  })

  it('shows the empty state when there are no records', () => {
    const wrapper = mount(PrList, { props: { records: [], exercises: [] }, ...withI18n() })
    expect(wrapper.text()).toContain('Sin récords aún')
  })
})

describe('StatsGrid', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    // reduced-motion forzado: mismo motivo que DistributionBars/PrList arriba
    // — useAnimatedNumber salta directo al valor final sin esperar el rAF
    vi.spyOn(window, 'matchMedia').mockReturnValue({ matches: true } as MediaQueryList)
  })
  afterEach(() => vi.restoreAllMocks())

  it('renders every stat card with the formatted value from the mock (round/derive rules per field)', () => {
    const wrapper = mount(StatsGrid, { props: { stats: fixtures.stats as never }, ...withI18n() })

    expect(wrapper.find('[data-testid="stat-workouts"]').text()).toBe('12')
    // 457200s = 127h en punto: horas enteras, sin desglose de minutos
    expect(wrapper.find('[data-testid="stat-gym-time"]').text()).toBe('127 h')
    expect(wrapper.find('[data-testid="stat-cardio-time"]').text()).toBe('10 h')
    // 52340m -> 52.34km, redondeado a 1 decimal
    expect(wrapper.find('[data-testid="stat-distance"]').text()).toBe('52.3 km')
    // volumen: mismo formatWeightInt que FinishSummary/PrList (derivado, sin decimales)
    expect(wrapper.find('[data-testid="stat-volume"]').text()).toBe('102345 kg')
    expect(wrapper.find('[data-testid="stat-sets"]').text()).toBe('480')
    expect(wrapper.find('[data-testid="stat-reps"]').text()).toBe('3600')
    expect(wrapper.find('[data-testid="stat-prs"]').text()).toBe('27')
    // 5400s = 90min = 1h 30min: misma pareja h/min que FinishSummary.durationLabel
    expect(wrapper.find('[data-testid="stat-avg-session"]').text()).toBe('1h 30min')
    expect(wrapper.find('[data-testid="stat-streak"]').text()).toBe('6')
  })

  it('shows the labels under each number', () => {
    const wrapper = mount(StatsGrid, { props: { stats: fixtures.stats as never }, ...withI18n() })
    expect(wrapper.text()).toContain('Entrenos')
    expect(wrapper.text()).toContain('Horas de gym')
    expect(wrapper.text()).toContain('Racha máxima')
  })

  it('renders every field at zero when stats is null (first paint before the fetch resolves)', () => {
    const wrapper = mount(StatsGrid, { props: { stats: null }, ...withI18n() })
    expect(wrapper.find('[data-testid="stat-workouts"]').text()).toBe('0')
    expect(wrapper.find('[data-testid="stat-gym-time"]').text()).toBe('0 h')
    expect(wrapper.find('[data-testid="stat-distance"]').text()).toBe('0.0 km')
    expect(wrapper.find('[data-testid="stat-avg-session"]').text()).toBe('0min')
  })

  it('respects the h-full flex scroll model: flex-1/min-h-0/overflow-y-auto on its own root', () => {
    const wrapper = mount(StatsGrid, { props: { stats: fixtures.stats as never }, ...withI18n() })
    expect(wrapper.classes()).toContain('flex-1')
    expect(wrapper.classes()).toContain('min-h-0')
    expect(wrapper.classes()).toContain('overflow-y-auto')
    expect(wrapper.classes()).toContain('grid-cols-2')
  })
})

describe('ExercisePicker', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.mocked(domain.listExercises).mockClear()
    vi.mocked(domain.getTrainedExercises).mockClear().mockResolvedValue({ exercise_ids: fixtures.trainedExerciseIds } as never)
  })

  it('loads the full catalog with athlete threading on mount', async () => {
    mount(ExercisePicker, { props: { modelValue: null }, ...withI18n() })
    await flushPromises()
    expect(domain.listExercises).toHaveBeenCalledWith({ userId: undefined })
  })

  it('item 5: loads the trained-exercise ids with the same athlete threading as the catalog', async () => {
    mount(ExercisePicker, { props: { modelValue: null }, ...withI18n() })
    await flushPromises()
    expect(domain.getTrainedExercises).toHaveBeenCalledWith(undefined)
  })

  it('item 5: shows the aurora dot next to an exercise with logged data, not next to one without', async () => {
    const wrapper = mount(ExercisePicker, { props: { modelValue: null }, ...withI18n() })
    await flushPromises()

    // ejercicio 1 (Press banca): tiene series → dot presente
    const trainedOption = wrapper.get('[data-testid="exercise-option-1"]')
    expect(trainedOption.find('[data-testid="trained-dot"]').exists()).toBe(true)

    // ejercicio 2 (Sentadilla): sin series → sin dot
    const untrainedOption = wrapper.get('[data-testid="exercise-option-2"]')
    expect(untrainedOption.find('[data-testid="trained-dot"]').exists()).toBe(false)
  })

  it('item 6: shows a rune+name tag for the primary muscle group of each option', async () => {
    const wrapper = mount(ExercisePicker, { props: { modelValue: null }, ...withI18n() })
    await flushPromises()

    const chestOption = wrapper.get('[data-testid="exercise-option-1"]') // Press banca -> chest
    const tag = chestOption.get('[data-testid="exercise-group-tag-1"]')
    expect(tag.text()).toContain('Pecho')
    expect(tag.findComponent({ name: 'BkRune' }).props('name')).toBe('chest')

    const legsOption = wrapper.get('[data-testid="exercise-option-2"]') // Sentadilla -> legs
    expect(legsOption.get('[data-testid="exercise-group-tag-2"]').text()).toContain('Piernas')
  })

  it("threads the viewed athlete's id into the catalog request", async () => {
    const athlete = useAthleteStore()
    athlete.view({ id: 7, username: 'other', is_admin: false, locale: 'es', units: 'kg', timezone: 'UTC' })

    mount(ExercisePicker, { props: { modelValue: null }, ...withI18n() })
    await flushPromises()

    expect(domain.listExercises).toHaveBeenCalledWith({ userId: 7 })
  })

  it('filters the catalog by search text', async () => {
    const wrapper = mount(ExercisePicker, { props: { modelValue: null }, ...withI18n() })
    await flushPromises()

    await wrapper.find('input').setValue('sent')
    await flushPromises()

    expect(wrapper.find('[data-testid="exercise-option-2"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="exercise-option-1"]').exists()).toBe(false)
  })

  it('emits the exercise id when an option is clicked', async () => {
    const wrapper = mount(ExercisePicker, { props: { modelValue: null }, ...withI18n() })
    await flushPromises()

    await wrapper.find('[data-testid="exercise-option-1"]').trigger('click')

    expect(wrapper.emitted('update:modelValue')!.at(-1)).toEqual([1])
  })

  it('emits null when "all exercises" is clicked', async () => {
    const wrapper = mount(ExercisePicker, { props: { modelValue: 1 }, ...withI18n() })
    await flushPromises()

    await wrapper.find('[data-testid="exercise-option-all"]').trigger('click')

    expect(wrapper.emitted('update:modelValue')!.at(-1)).toEqual([null])
  })

  it('item 3a: shows shimmer skeleton rows (not the real list) while listExercises is pending, swaps to the real list once resolved', async () => {
    let resolveExercises: (value: never) => void = () => {}
    vi.mocked(domain.listExercises).mockImplementationOnce(() => new Promise((resolve) => { resolveExercises = resolve }))

    const wrapper = mount(ExercisePicker, { props: { modelValue: null }, ...withI18n() })
    await wrapper.vm.$nextTick()

    const skeleton = wrapper.find('[data-testid="exercise-list-skeleton"]')
    expect(skeleton.exists()).toBe(true)
    expect(skeleton.findAll('.bk-shimmer').length).toBeGreaterThan(0)
    expect(wrapper.find('[data-testid="exercise-option-all"]').exists()).toBe(false)

    resolveExercises(fixtures.exercises as never)
    await flushPromises()

    expect(wrapper.find('[data-testid="exercise-list-skeleton"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="exercise-option-all"]').exists()).toBe(true)
  })
})

describe('BodySection', () => {
  // BkSheet teletransporta a document.body: si un test no desmonta el wrapper,
  // el siguiente hereda el sheet huérfano y document.querySelector puede
  // devolver un input de un test anterior en vez del propio (orden del DOM)
  let wrapper: VueWrapper | null = null

  function build(): VueWrapper {
    wrapper = mount(BodySection, withI18n())
    return wrapper
  }

  beforeEach(() => {
    setActivePinia(createPinia())
    vi.mocked(domain.listBody).mockClear().mockResolvedValue(fixtures.bodyEntries as never)
    vi.mocked(domain.upsertBody).mockClear()
    vi.mocked(domain.deleteBody).mockClear()
  })

  afterEach(() => {
    wrapper?.unmount()
    wrapper = null
  })

  it('loads entries with athlete threading on mount', async () => {
    build()
    await flushPromises()
    expect(domain.listBody).toHaveBeenCalledWith(undefined)
  })

  it('renders entries most-recent-first, with formatted weight and present measures', async () => {
    build()
    await flushPromises()

    const rows = wrapper!.findAll('[data-testid^="body-entry-"]')
    expect(rows).toHaveLength(2)
    expect(rows[0].attributes('data-testid')).toBe('body-entry-2026-07-08')
    expect(rows[1].attributes('data-testid')).toBe('body-entry-2026-07-01')
    expect(rows[1].text()).toContain('84 kg')
    expect(rows[1].text()).toContain('Cintura: 90 cm')
  })

  it('renders the weight-over-time chart from the weighed entries', async () => {
    build()
    await flushPromises()

    const chart = wrapper!.findComponent({ name: 'BkChart' })
    expect(chart.exists()).toBe(true)
    expect(chart.props('points')).toEqual([
      { date: '2026-07-01', value: 84 },
      { date: '2026-07-08', value: 83 },
    ])
    // item 2: el chart de Cuerpo revela su serie progresivamente (BkChart lo
    // resuelve internamente vía setData, no con una clase CSS de barrido) —
    // la propia lógica del tween/rango de escala vive y se prueba en BkChart,
    // no aquí; este componente solo verifica que le pasa los puntos correctos
    expect(chart.classes()).not.toContain('bk-reveal')
  })

  it('blocks submission and shows an error when every field is empty (mirrors backend empty_entry)', async () => {
    build()
    await flushPromises()

    await wrapper!.find('[data-testid="add-body-entry"]').trigger('click')
    await flushPromises()

    const saveButton = document.querySelector('[data-testid="save-body-entry"]') as HTMLElement
    saveButton.click()
    await flushPromises()

    expect(domain.upsertBody).not.toHaveBeenCalled()
    expect(document.querySelector('[data-testid="body-form-error"]')?.textContent).toBe(
      'Introduce al menos un valor',
    )
  })

  it('creates a brand-new entry for a date with no prior data, leaving untouched fields null', async () => {
    build()
    await flushPromises()

    await wrapper!.find('[data-testid="add-body-entry"]').trigger('click')
    await flushPromises()

    const weightInput = document.querySelectorAll('input[type="number"]')[0] as HTMLInputElement
    weightInput.value = '82.5'
    weightInput.dispatchEvent(new Event('input', { bubbles: true }))
    await flushPromises()

    const saveButton = document.querySelector('[data-testid="save-body-entry"]') as HTMLElement
    saveButton.click()
    await flushPromises()

    expect(domain.upsertBody).toHaveBeenCalledWith(todayIso(), {
      weight_kg: 82.5,
      waist_cm: null,
      chest_cm: null,
      arm_cm: null,
      thigh_cm: null,
      hip_cm: null,
    })
  })

  it("openAdd pre-fills from today's entry when one already exists (upsert-by-date is an edit in disguise)", async () => {
    const today = todayIso()
    vi.mocked(domain.listBody).mockResolvedValue([
      { date: today, weight_kg: 79, waist_cm: null, chest_cm: null, arm_cm: null, thigh_cm: null, hip_cm: null },
    ] as never)

    build()
    await flushPromises()

    await wrapper!.find('[data-testid="add-body-entry"]').trigger('click')
    await flushPromises()

    const weightInput = document.querySelectorAll('input[type="number"]')[0] as HTMLInputElement
    expect(weightInput.value).toBe('79')
  })

  it('clicking edit on a row pre-fills every field from that entry', async () => {
    build()
    await flushPromises()

    await wrapper!.find('[data-testid="edit-body-2026-07-01"]').trigger('click')
    await flushPromises()

    // BkDateField (round 7): ya no es un <input type="date">, sino un
    // trigger que muestra la fecha corta localizada
    const dateTrigger = document.querySelector('[role="combobox"]') as HTMLElement
    expect(dateTrigger.textContent).toContain(formatDateShort('2026-07-01', 'es'))
    const numberInputs = document.querySelectorAll('input[type="number"]')
    expect((numberInputs[0] as HTMLInputElement).value).toBe('84')
    expect((numberInputs[1] as HTMLInputElement).value).toBe('90')
  })

  it('saving after adding a waist value to an existing weight-only entry sends BOTH values (no data loss)', async () => {
    build()
    await flushPromises()

    // 2026-07-08 solo tiene weight_kg=83 en la fixture, sin cintura
    await wrapper!.find('[data-testid="edit-body-2026-07-08"]').trigger('click')
    await flushPromises()

    const waistInput = document.querySelectorAll('input[type="number"]')[1] as HTMLInputElement
    waistInput.value = '95'
    waistInput.dispatchEvent(new Event('input', { bubbles: true }))
    await flushPromises()

    const saveButton = document.querySelector('[data-testid="save-body-entry"]') as HTMLElement
    saveButton.click()
    await flushPromises()

    expect(domain.upsertBody).toHaveBeenCalledWith('2026-07-08', {
      weight_kg: 83,
      waist_cm: 95,
      chest_cm: null,
      arm_cm: null,
      thigh_cm: null,
      hip_cm: null,
    })
  })

  it('re-fills the form when the date field is changed to a date that already has an entry', async () => {
    // reloj pineado dentro de julio 2026 (mismo mes que la fixture que se va
    // a elegir): así el panel de BkDateField abre YA en el mes correcto y el
    // día 1 se puede clicar directamente, sin depender de a qué mes real
    // caiga "hoy" cuando corran los tests
    vi.useFakeTimers({ now: new Date(2026, 6, 15, 12), toFake: ['Date'] })
    build()
    await flushPromises()

    await wrapper!.find('[data-testid="add-body-entry"]').trigger('click')
    await flushPromises()

    const dateTrigger = document.querySelector('[role="combobox"]') as HTMLElement
    dateTrigger.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await flushPromises()

    const day1 = Array.from(document.querySelectorAll('[role="gridcell"]'))
      .find((c) => c.id.endsWith('2026-07-01')) as HTMLElement
    expect(day1).not.toBeUndefined()
    day1.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await flushPromises()

    const numberInputs = document.querySelectorAll('input[type="number"]')
    expect((numberInputs[0] as HTMLInputElement).value).toBe('84')
    expect((numberInputs[1] as HTMLInputElement).value).toBe('90')

    vi.useRealTimers()
  })

  it('deletes an entry after confirming', async () => {
    build()
    await flushPromises()

    await wrapper!.find('[data-testid="delete-body-2026-07-08"]').trigger('click')
    await wrapper!.find('[data-testid="confirm-delete-body-2026-07-08"]').trigger('click')
    await flushPromises()

    expect(domain.deleteBody).toHaveBeenCalledWith('2026-07-08')
  })

  it('does not delete when the confirmation is cancelled', async () => {
    build()
    await flushPromises()

    await wrapper!.find('[data-testid="delete-body-2026-07-08"]').trigger('click')
    await wrapper!.find('[data-testid="cancel-delete-body-2026-07-08"]').trigger('click')
    await flushPromises()

    expect(wrapper!.find('[data-testid="confirm-delete-body-2026-07-08"]').exists()).toBe(false)
    expect(domain.deleteBody).not.toHaveBeenCalled()
  })

  it('round-trip: editing an lb-mode entry without touching weight resends the original kg exactly (no drift)', async () => {
    // 80 kg → kgToDisplay → 176.4 lb (1dp) → displayToKg de vuelta drifts a
    // otro valor (ver utils/units.ts): si el campo no se tocó, debe reenviarse
    // el kg canónico precargado, no reconvertir la cadena mostrada
    useAuthStore().user = { units: 'lb' } as never
    vi.mocked(domain.listBody).mockResolvedValue([
      { date: '2026-07-01', weight_kg: 80, waist_cm: null, chest_cm: null, arm_cm: null, thigh_cm: null, hip_cm: null },
    ] as never)

    build()
    await flushPromises()

    await wrapper!.find('[data-testid="edit-body-2026-07-01"]').trigger('click')
    await flushPromises()

    const saveButton = document.querySelector('[data-testid="save-body-entry"]') as HTMLElement
    saveButton.click()
    await flushPromises()

    expect(domain.upsertBody).toHaveBeenCalledWith('2026-07-01', {
      weight_kg: 80,
      waist_cm: null,
      chest_cm: null,
      arm_cm: null,
      thigh_cm: null,
      hip_cm: null,
    })
  })

  it('hides the add button and per-entry delete controls in read-only athlete mode, while list and chart still render', async () => {
    const athlete = useAthleteStore()
    athlete.view({ id: 7, username: 'other', is_admin: false, locale: 'es', units: 'kg', timezone: 'UTC' })

    build()
    await flushPromises()

    expect(wrapper!.find('[data-testid="add-body-entry"]').exists()).toBe(false)
    expect(wrapper!.find('[data-testid="delete-body-2026-07-08"]').exists()).toBe(false)
    expect(wrapper!.find('[data-testid="body-entry-2026-07-08"]').exists()).toBe(true)
    expect(wrapper!.findComponent({ name: 'BkChart' }).exists()).toBe(true)
    expect(domain.listBody).toHaveBeenCalledWith(7)
  })
})

describe('ProgressView', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.mocked(domain.listExercises).mockClear().mockResolvedValue(fixtures.exercises as never)
    vi.mocked(domain.listMuscleGroups).mockClear().mockResolvedValue(fixtures.muscleGroups as never)
    vi.mocked(domain.getDistribution).mockClear().mockResolvedValue(fixtures.distribution as never)
    vi.mocked(domain.getRecords).mockClear().mockResolvedValue(fixtures.records as never)
    vi.mocked(domain.getSeries).mockClear().mockResolvedValue({ series: fixtures.series } as never)
    vi.mocked(domain.getStats).mockClear().mockResolvedValue(fixtures.stats as never)
    vi.mocked(domain.listBody).mockClear().mockResolvedValue(fixtures.bodyEntries as never)
    // item 8: ahora solo se llama al entrar en la pestaña Entrenos (no en el
    // montaje, Totales es la de arranque) — hay que limpiar las llamadas que
    // hayan quedado colgando del describe de ExercisePicker de más arriba
    vi.mocked(domain.getTrainedExercises).mockClear().mockResolvedValue({ exercise_ids: fixtures.trainedExerciseIds } as never)
  })

  it('loads catalog/distribution/records/stats data on mount regardless of the active tab', async () => {
    const wrapper = mount(ProgressView, withI18n())
    await flushPromises()

    expect(domain.listExercises).toHaveBeenCalledWith({ userId: undefined })
    expect(domain.listMuscleGroups).toHaveBeenCalledWith(undefined)
    expect(domain.getDistribution).toHaveBeenCalledWith(4, undefined)
    expect(domain.getRecords).toHaveBeenCalledWith({ exercise_id: undefined, userId: undefined })
    // round 8: getStats se pide de arranque igual que el resto de la vista,
    // no en diferido al abrir la pestaña Estadísticas (item 8: que además
    // ahora es la pestaña activa por defecto)
    expect(domain.getStats).toHaveBeenCalledWith(undefined)

    // item 5: ExercisePicker (montado dentro de la pestaña Entrenos) carga el
    // set de entrenados con el mismo hilo de atleta que el resto — pero solo
    // una vez esa pestaña está activa (item 8: Totales es la de arranque)
    expect(domain.getTrainedExercises).not.toHaveBeenCalled()
    const mainTablist = wrapper.findAll('[role="tablist"]')[0]
    await mainTablist.findAll('[role="tab"]')[2].trigger('click') // Entrenos
    await flushPromises()
    expect(domain.getTrainedExercises).toHaveBeenCalledWith(undefined)
  })

  it("round 8: threads the viewed athlete's id into getStats", async () => {
    const athlete = useAthleteStore()
    athlete.view({ id: 7, username: 'other', is_admin: false, locale: 'es', units: 'kg', timezone: 'UTC' })

    mount(ProgressView, withI18n())
    await flushPromises()

    expect(domain.getStats).toHaveBeenCalledWith(7)
  })

  it('item 8: tabs are ordered totales → cuerpo → entreno → récords, with Totales first', async () => {
    const wrapper = mount(ProgressView, withI18n())
    await flushPromises()

    const mainTablist = wrapper.findAll('[role="tablist"]')[0]
    const tabLabels = mainTablist.findAll('[role="tab"]').map((tab) => tab.text())
    expect(tabLabels).toEqual(['Totales', 'Cuerpo', 'Entrenos', 'Récords'])
  })

  it('round 8/item 8: gates the stats grid until getStats resolves, then renders it with the fetched data (Totales is now the default-active tab, no click needed)', async () => {
    // reduced-motion forzado solo en este test (mock local, restaurado al
    // final): así la aserción del dígito final no depende de que el tween
    // rAF real haya terminado, mismo motivo que en el describe de StatsGrid
    const matchMediaSpy = vi.spyOn(window, 'matchMedia').mockReturnValue({ matches: true } as MediaQueryList)
    let resolveStats: (value: never) => void = () => {}
    vi.mocked(domain.getStats).mockImplementationOnce(() => new Promise((resolve) => { resolveStats = resolve }))

    const wrapper = mount(ProgressView, withI18n())
    await flushPromises()

    expect(wrapper.findComponent({ name: 'StatsGrid' }).exists()).toBe(false)

    resolveStats(fixtures.stats as never)
    await flushPromises()

    const grid = wrapper.findComponent({ name: 'StatsGrid' })
    expect(grid.exists()).toBe(true)
    expect(grid.props('stats')).toEqual(fixtures.stats)
    // el dato real ya está montado de una: la card renderiza el número final,
    // no un 0 pendiente de un segundo repintado
    expect(wrapper.find('[data-testid="stat-workouts"]').text()).toBe('12')

    matchMediaSpy.mockRestore()
  })

  it('hides the metric switch and chart until an exercise is picked', async () => {
    const wrapper = mount(ProgressView, withI18n())
    await flushPromises()

    // item 8: Entrenos ya no es la pestaña activa por defecto (Totales lo
    // es), así que hay que entrar en ella para ver el picker/chart
    const mainTablist = wrapper.findAll('[role="tablist"]')[0]
    await mainTablist.findAll('[role="tab"]')[2].trigger('click')
    await flushPromises()

    expect(wrapper.findComponent({ name: 'BkChart' }).exists()).toBe(false)
    expect(wrapper.findAll('[role="tablist"]')).toHaveLength(1)
  })

  it('fetches the series and exercise-scoped records once an exercise is picked', async () => {
    const wrapper = mount(ProgressView, withI18n())
    await flushPromises()

    const mainTablist = wrapper.findAll('[role="tablist"]')[0]
    await mainTablist.findAll('[role="tab"]')[2].trigger('click') // Entrenos
    await flushPromises()

    await wrapper.find('[data-testid="exercise-option-1"]').trigger('click')
    await flushPromises()

    expect(domain.getSeries).toHaveBeenCalledWith(1, undefined)
    expect(domain.getRecords).toHaveBeenCalledWith({ exercise_id: 1, userId: undefined })
  })

  it('switches the BkChart points when the metric tab flips to est_1rm', async () => {
    const wrapper = mount(ProgressView, withI18n())
    await flushPromises()

    const mainTablist = wrapper.findAll('[role="tablist"]')[0]
    await mainTablist.findAll('[role="tab"]')[2].trigger('click') // Entrenos
    await flushPromises()

    await wrapper.find('[data-testid="exercise-option-1"]').trigger('click')
    await flushPromises()

    expect(wrapper.findComponent({ name: 'BkChart' }).props('points')).toEqual([
      { date: '2026-07-01', value: 80 },
      { date: '2026-07-08', value: 85 },
    ])

    const metricTablist = wrapper.findAll('[role="tablist"]')[1]
    await metricTablist.findAll('[role="tab"]')[2].trigger('click')
    await flushPromises()

    expect(wrapper.findComponent({ name: 'BkChart' }).props('points')).toEqual([
      { date: '2026-07-01', value: 90 },
      { date: '2026-07-08', value: 95 },
    ])
  })

  it('item 7 exception: flipping the metric tab (peso/volumen/est. 1RM) does NOT remount the chart block — same DOM node, no re-animation', async () => {
    const wrapper = mount(ProgressView, withI18n())
    await flushPromises()

    const mainTablist = wrapper.findAll('[role="tablist"]')[0]
    await mainTablist.findAll('[role="tab"]')[2].trigger('click') // Entrenos
    await flushPromises()

    await wrapper.find('[data-testid="exercise-option-1"]').trigger('click')
    await flushPromises()

    const chartWrapperBefore = wrapper.findAll('[style*="--bk-stagger-i: 1"]')[0].element
    const chartBefore = wrapper.findComponent({ name: 'BkChart' }).element

    const metricTablist = wrapper.findAll('[role="tablist"]')[1]
    await metricTablist.findAll('[role="tab"]')[2].trigger('click')
    await flushPromises()

    const chartWrapperAfter = wrapper.findAll('[style*="--bk-stagger-i: 1"]')[0].element
    // el metric switch es un cambio de dato, no de sección: el nodo que
    // dispara la animación de entrada (bk-stagger-i) es el MISMO antes y
    // después, así que la animación de montaje no se repite en cada tap
    expect(chartWrapperAfter).toBe(chartWrapperBefore)
    // item 2: tampoco el propio BkChart (:key="exerciseId", no lleva metric)
    expect(wrapper.findComponent({ name: 'BkChart' }).element).toBe(chartBefore)
  })

  it('item 2: selecting a DIFFERENT exercise DOES remount the chart (key=exerciseId) so the progressive reveal plays again', async () => {
    const wrapper = mount(ProgressView, withI18n())
    await flushPromises()

    const mainTablist = wrapper.findAll('[role="tablist"]')[0]
    await mainTablist.findAll('[role="tab"]')[2].trigger('click') // Entrenos
    await flushPromises()

    await wrapper.find('[data-testid="exercise-option-1"]').trigger('click')
    await flushPromises()
    const chartBefore = wrapper.findComponent({ name: 'BkChart' }).element

    await wrapper.find('[data-testid="exercise-option-2"]').trigger('click')
    await flushPromises()
    const chartAfter = wrapper.findComponent({ name: 'BkChart' }).element

    expect(chartAfter).not.toBe(chartBefore)
  })

  it('item 8: switches to the body tab (2nd tab in the totales→cuerpo→entreno→récords order) and hides the training-tab content', async () => {
    const wrapper = mount(ProgressView, withI18n())
    await flushPromises()

    // Totales es la pestaña activa por defecto: ni el picker ni Cuerpo
    // están montados todavía
    expect(wrapper.findComponent({ name: 'ExercisePicker' }).exists()).toBe(false)
    expect(wrapper.findComponent({ name: 'BodySection' }).exists()).toBe(false)

    const mainTablist = wrapper.findAll('[role="tablist"]')[0]
    await mainTablist.findAll('[role="tab"]')[1].trigger('click')
    await flushPromises()

    expect(wrapper.findComponent({ name: 'ExercisePicker' }).exists()).toBe(false)
    expect(wrapper.findComponent({ name: 'BodySection' }).exists()).toBe(true)
  })

  it('item 3b/item 8: Récords is its own tab (now last) with PrList and DistributionBars, hidden from the default totales tab', async () => {
    const wrapper = mount(ProgressView, withI18n())
    await flushPromises()

    // Totales (pestaña activa por defecto): ni PrList ni DistributionBars
    // están montados ahí
    expect(wrapper.findComponent({ name: 'PrList' }).exists()).toBe(false)
    expect(wrapper.findComponent({ name: 'DistributionBars' }).exists()).toBe(false)

    const mainTablist = wrapper.findAll('[role="tablist"]')[0]
    await mainTablist.findAll('[role="tab"]')[3].trigger('click') // Récords (ahora la última)
    await flushPromises()

    expect(wrapper.findComponent({ name: 'PrList' }).exists()).toBe(true)
    expect(wrapper.findComponent({ name: 'DistributionBars' }).exists()).toBe(true)
    expect(wrapper.text()).toContain('Press banca') // fila real de PrList
    expect(wrapper.text()).toContain('Piernas') // fila real de DistributionBars
    expect(wrapper.findComponent({ name: 'ExercisePicker' }).exists()).toBe(false)
  })

  it('item 8: records panel is a bounded flex column with PrList taking the remaining space and DistributionBars pinned at the bottom', async () => {
    const wrapper = mount(ProgressView, withI18n())
    await flushPromises()

    const mainTablist = wrapper.findAll('[role="tablist"]')[0]
    await mainTablist.findAll('[role="tab"]')[3].trigger('click') // Récords
    await flushPromises()

    // mismo patrón flex que la pestaña Entrenos (item 3c más abajo)
    const recordsPanel = wrapper.find('.bk-stagger')
    expect(recordsPanel.classes()).toContain('flex-1')
    expect(recordsPanel.classes()).toContain('min-h-0')
    expect(recordsPanel.classes()).toContain('flex-col')

    const recordsArea = recordsPanel.findAll('[style*="--bk-stagger-i: 0"]')[0]
    expect(recordsArea.classes()).toContain('flex-1')
    expect(recordsArea.classes()).toContain('min-h-0')

    const distributionArea = recordsPanel.findAll('[style*="--bk-stagger-i: 1"]')[0]
    expect(distributionArea.classes()).toContain('shrink-0')

    // PrList: sin tope max-h-72, se lleva el resto del alto con scroll interno
    const prList = wrapper.findComponent({ name: 'PrList' })
    expect(prList.classes()).toContain('flex-1')
    expect(prList.classes()).toContain('min-h-0')
    expect(prList.classes()).toContain('overflow-y-auto')
    expect(prList.classes()).not.toContain('max-h-72')
  })

  it('item 3c: training panel is a bounded flex column with the exercise-list area taking the remaining space', async () => {
    const wrapper = mount(ProgressView, withI18n())
    await flushPromises()

    // item 8: Totales (default) también usa bk-stagger, así que hay que
    // entrar en Entrenos explícitamente para probar SU panel
    const mainTablist = wrapper.findAll('[role="tablist"]')[0]
    await mainTablist.findAll('[role="tab"]')[2].trigger('click')
    await flushPromises()

    const trainingPanel = wrapper.find('.bk-stagger')
    expect(trainingPanel.classes()).toContain('flex-1')
    expect(trainingPanel.classes()).toContain('min-h-0')
    expect(trainingPanel.classes()).toContain('flex-col')

    const listArea = trainingPanel.findAll('[style*="--bk-stagger-i: 0"]')[0]
    expect(listArea.classes()).toContain('flex-1')
    expect(listArea.classes()).toContain('min-h-0')
  })

  it('round 6 items 3/4: has no view-level h1 (Hoy never had one) and no horizontal padding of its own on the root', async () => {
    const wrapper = mount(ProgressView, withI18n())
    await flushPromises()

    expect(wrapper.find('h1').exists()).toBe(false)
    // <main> del shell ya pone px-4: la raíz de la vista no debe duplicarlo
    expect(wrapper.classes().some((c) => c === 'p-4' || c.startsWith('px-'))).toBe(false)
    // el chain h-full/flex-col (item 3 del round 3) sigue intacto sin el h1
    expect(wrapper.classes()).toContain('h-full')
    expect(wrapper.classes()).toContain('flex-col')
  })

  it('item 7/item 8: switching tabs replays the entry animation (bk-stagger present per panel; body panel uses bk-rise)', async () => {
    const wrapper = mount(ProgressView, withI18n())
    await flushPromises()

    expect(wrapper.find('.bk-stagger').exists()).toBe(true) // panel de totales (default, item 8)

    const mainTablist = wrapper.findAll('[role="tablist"]')[0]
    await mainTablist.findAll('[role="tab"]')[2].trigger('click') // Entrenos
    await flushPromises()
    expect(wrapper.find('.bk-stagger').exists()).toBe(true) // panel de entrenos, re-montado

    await mainTablist.findAll('[role="tab"]')[3].trigger('click') // Récords
    await flushPromises()
    expect(wrapper.find('.bk-stagger').exists()).toBe(true) // panel de récords, re-montado

    // Cuerpo es la excepción: bk-rise en vez de bk-stagger (no hay hermanos
    // que escalonar), ver comentario en ProgressView.vue
    await mainTablist.findAll('[role="tab"]')[1].trigger('click') // Cuerpo
    await flushPromises()
    expect(wrapper.findComponent({ name: 'BodySection' }).classes()).toContain('flex-1')
  })
})

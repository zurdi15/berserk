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
  bodyEntries: [
    { date: '2026-07-01', weight_kg: 84, waist_cm: 90, chest_cm: null, arm_cm: null, thigh_cm: null, hip_cm: null },
    { date: '2026-07-08', weight_kg: 83, waist_cm: null, chest_cm: null, arm_cm: null, thigh_cm: null, hip_cm: null },
  ],
}))

vi.mock('uplot', () => ({
  default: vi.fn(() => ({ destroy: vi.fn(), setSize: vi.fn() })),
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
import * as domain from '@/api/domain'
import { createI18nInstance } from '@/i18n'
import { useAthleteStore } from '@/stores/athlete'
import { todayIso } from '@/utils/dates'
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
})

describe('PrList', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

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

  it('shows the empty state when there are no records', () => {
    const wrapper = mount(PrList, { props: { records: [], exercises: [] }, ...withI18n() })
    expect(wrapper.text()).toContain('Sin récords aún')
  })
})

describe('ExercisePicker', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.mocked(domain.listExercises).mockClear()
  })

  it('loads the full catalog with athlete threading on mount', async () => {
    mount(ExercisePicker, { props: { modelValue: null }, ...withI18n() })
    await flushPromises()
    expect(domain.listExercises).toHaveBeenCalledWith({ userId: undefined })
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

    const dateInput = document.querySelector('input[type="date"]') as HTMLInputElement
    const numberInputs = document.querySelectorAll('input[type="number"]')
    expect(dateInput.value).toBe('2026-07-01')
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
    build()
    await flushPromises()

    await wrapper!.find('[data-testid="add-body-entry"]').trigger('click')
    await flushPromises()

    const dateInput = document.querySelector('input[type="date"]') as HTMLInputElement
    dateInput.value = '2026-07-01'
    dateInput.dispatchEvent(new Event('input', { bubbles: true }))
    await flushPromises()

    const numberInputs = document.querySelectorAll('input[type="number"]')
    expect((numberInputs[0] as HTMLInputElement).value).toBe('84')
    expect((numberInputs[1] as HTMLInputElement).value).toBe('90')
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
    vi.mocked(domain.listBody).mockClear().mockResolvedValue(fixtures.bodyEntries as never)
  })

  it('loads training-tab data with athlete threading on mount', async () => {
    mount(ProgressView, withI18n())
    await flushPromises()

    expect(domain.listExercises).toHaveBeenCalledWith({ userId: undefined })
    expect(domain.listMuscleGroups).toHaveBeenCalledWith(undefined)
    expect(domain.getDistribution).toHaveBeenCalledWith(4, undefined)
    expect(domain.getRecords).toHaveBeenCalledWith({ exercise_id: undefined, userId: undefined })
  })

  it('hides the metric switch and chart until an exercise is picked', async () => {
    const wrapper = mount(ProgressView, withI18n())
    await flushPromises()

    expect(wrapper.findComponent({ name: 'BkChart' }).exists()).toBe(false)
    expect(wrapper.findAll('[role="tablist"]')).toHaveLength(1)
  })

  it('fetches the series and exercise-scoped records once an exercise is picked', async () => {
    const wrapper = mount(ProgressView, withI18n())
    await flushPromises()

    await wrapper.find('[data-testid="exercise-option-1"]').trigger('click')
    await flushPromises()

    expect(domain.getSeries).toHaveBeenCalledWith(1, undefined)
    expect(domain.getRecords).toHaveBeenCalledWith({ exercise_id: 1, userId: undefined })
  })

  it('switches the BkChart points when the metric tab flips to est_1rm', async () => {
    const wrapper = mount(ProgressView, withI18n())
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

  it('switches to the body tab and hides the training-tab content', async () => {
    const wrapper = mount(ProgressView, withI18n())
    await flushPromises()

    expect(wrapper.findComponent({ name: 'ExercisePicker' }).exists()).toBe(true)
    expect(wrapper.findComponent({ name: 'BodySection' }).exists()).toBe(false)

    const mainTablist = wrapper.findAll('[role="tablist"]')[0]
    await mainTablist.findAll('[role="tab"]')[1].trigger('click')
    await flushPromises()

    expect(wrapper.findComponent({ name: 'ExercisePicker' }).exists()).toBe(false)
    expect(wrapper.findComponent({ name: 'BodySection' }).exists()).toBe(true)
  })
})

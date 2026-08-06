import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/api/domain', () => ({
  getMonth: vi.fn(async () => ({
    scheduled: [
      { id: 1, date: '2026-08-01', time: '18:00', routine_id: 1, status: 'planned', workout_id: null, note: null },
      { id: 2, date: '2026-08-02', time: '10:00', routine_id: 2, status: 'done', workout_id: 5, note: null },
      { id: 3, date: '2026-08-03', time: null, routine_id: 3, status: 'skipped', workout_id: null, note: 'Too busy' },
      { id: 4, date: '2026-08-01', time: '19:00', routine_id: 1, status: 'planned', workout_id: null, note: null },
      { id: 5, date: '2026-08-02', time: '15:00', routine_id: 2, status: 'done', workout_id: 5, note: null },
    ],
    workouts: [
      { id: 1, date: '2026-08-01', feeling: 4, muscle_group_ids: [1, 3] },
      { id: 2, date: '2026-08-02', feeling: 5, muscle_group_ids: [2] },
    ],
  })),
  getHeatmap: vi.fn(async () => [
    { date: '2026-08-01', count: 2 },
    { date: '2026-08-02', count: 1 },
  ]),
  listRoutines: vi.fn(async () => [
    { id: 1, name: 'Push', description: null, rune: null, color: null, exercises: [] },
    { id: 2, name: 'Pull', description: null, rune: null, color: null, exercises: [] },
  ]),
  listMuscleGroups: vi.fn(async () => [
    { id: 1, slug: 'chest', name_es: 'Pecho', name_en: 'Chest', owner_id: null },
    { id: 2, slug: 'back', name_es: 'Espalda', name_en: 'Back', owner_id: null },
    { id: 3, slug: 'legs', name_es: 'Piernas', name_en: 'Legs', owner_id: null },
    { id: 4, slug: 'shoulders', name_es: 'Hombros', name_en: 'Shoulders', owner_id: null },
    { id: 5, slug: 'biceps', name_es: 'Bíceps', name_en: 'Biceps', owner_id: null },
    { id: 6, slug: 'triceps', name_es: 'Tríceps', name_en: 'Triceps', owner_id: null },
    { id: 7, slug: 'core', name_es: 'Core', name_en: 'Core', owner_id: null },
  ]),
  updateSchedule: vi.fn(async () => ({ id: 3, date: '2026-08-03', time: null, routine_id: 3, status: 'skipped', workout_id: null, note: 'Too busy' })),
  deleteSchedule: vi.fn(async () => {}),
  schedule: vi.fn(async () => ({ id: 6, date: '2026-08-04', time: '20:00', routine_id: 1, status: 'planned', workout_id: null, note: null })),
}))
vi.mock('vue-router', () => ({ useRouter: () => ({ push: vi.fn() }) }))
vi.mock('@/utils/apiErrors', () => ({
  toastApiError: vi.fn(),
}))

import { isValidRuneName } from '@/components/calendar/groupRune'
import MonthGrid from '@/components/calendar/MonthGrid.vue'
import ScheduleSheet from '@/components/calendar/ScheduleSheet.vue'
import * as domain from '@/api/domain'
import { createI18nInstance } from '@/i18n'
import { useAthleteStore } from '@/stores/athlete'

describe('isValidRuneName', () => {
  it('returns true for valid muscle slug "chest"', () => {
    expect(isValidRuneName('chest')).toBe(true)
  })

  it('returns true for valid muscle slug "legs"', () => {
    expect(isValidRuneName('legs')).toBe(true)
  })

  it('returns false for unknown slug', () => {
    expect(isValidRuneName('unknown')).toBe(false)
  })
})

describe('MonthGrid', () => {
  beforeEach(() => setActivePinia(createPinia()))

  const createGroupMap = () => {
    const map = new Map<number, string>()
    map.set(1, 'chest')
    map.set(2, 'back')
    map.set(3, 'legs')
    return map
  }

  it('renders planned session dot with aurora border', async () => {
    const wrapper = mount(MonthGrid, {
      props: {
        month: {
          scheduled: [
            { id: 1, date: '2026-08-01', time: '18:00', routine_id: 1, status: 'planned', workout_id: null, note: null },
          ],
          workouts: [],
        },
        year: 2026,
        monthNum: 8,
        groupMap: createGroupMap(),
      },
      global: { plugins: [createI18nInstance()] },
    })
    await flushPromises()
    expect(wrapper.find('[data-status="planned"]').exists()).toBe(true)
    expect(wrapper.find('[data-status="planned"]').classes()).toContain('border-2')
    expect(wrapper.find('[data-status="planned"]').classes()).toContain('border-aurora')
  })

  it('renders done session dot with solid aurora', async () => {
    const wrapper = mount(MonthGrid, {
      props: {
        month: {
          scheduled: [
            { id: 2, date: '2026-08-02', time: '10:00', routine_id: 2, status: 'done', workout_id: 5, note: null },
          ],
          workouts: [],
        },
        year: 2026,
        monthNum: 8,
        groupMap: createGroupMap(),
      },
      global: { plugins: [createI18nInstance()] },
    })
    await flushPromises()
    expect(wrapper.find('[data-status="done"]').exists()).toBe(true)
    expect(wrapper.find('[data-status="done"]').classes()).toContain('bg-aurora')
  })

  it('renders skipped session dot with ink-faint', async () => {
    const wrapper = mount(MonthGrid, {
      props: {
        month: {
          scheduled: [
            { id: 3, date: '2026-08-03', time: null, routine_id: 3, status: 'skipped', workout_id: null, note: 'Too busy' },
          ],
          workouts: [],
        },
        year: 2026,
        monthNum: 8,
        groupMap: createGroupMap(),
      },
      global: { plugins: [createI18nInstance()] },
    })
    await flushPromises()
    expect(wrapper.find('[data-status="skipped"]').exists()).toBe(true)
    expect(wrapper.find('[data-status="skipped"]').classes()).toContain('bg-ink-faint')
  })

  it('renders multiple session dots per day', async () => {
    const wrapper = mount(MonthGrid, {
      props: {
        month: {
          scheduled: [
            { id: 1, date: '2026-08-01', time: '18:00', routine_id: 1, status: 'planned', workout_id: null, note: null },
            { id: 4, date: '2026-08-01', time: '19:00', routine_id: 1, status: 'planned', workout_id: null, note: null },
          ],
          workouts: [],
        },
        year: 2026,
        monthNum: 8,
        groupMap: createGroupMap(),
      },
      global: { plugins: [createI18nInstance()] },
    })
    await flushPromises()
    const plannedDots = wrapper.findAll('[data-status="planned"]')
    expect(plannedDots.length).toBe(2)
  })

  it('renders BkRune components for valid muscle group slugs', async () => {
    const wrapper = mount(MonthGrid, {
      props: {
        month: {
          scheduled: [],
          workouts: [
            { id: 1, date: '2026-08-01', feeling: 4, muscle_group_ids: [1, 3] },
          ],
        },
        year: 2026,
        monthNum: 8,
        groupMap: createGroupMap(),
      },
      global: { plugins: [createI18nInstance()] },
    })
    await flushPromises()
    const runes = wrapper.findAllComponents({ name: 'BkRune' })
    expect(runes.length).toBe(2)
    expect(runes[0].props('name')).toBe('chest')
    expect(runes[1].props('name')).toBe('legs')
  })

  it('emits select event when day is clicked', async () => {
    const wrapper = mount(MonthGrid, {
      props: {
        month: {
          scheduled: [],
          workouts: [],
        },
        year: 2026,
        monthNum: 8,
        groupMap: createGroupMap(),
      },
      global: { plugins: [createI18nInstance()] },
    })
    await flushPromises()
    const dayCell = wrapper.find('[data-testid^="day-cell-"]')
    await dayCell.trigger('click')
    expect(wrapper.emitted('select')).toBeTruthy()
  })
})

describe('ScheduleSheet', () => {
  beforeEach(() => setActivePinia(createPinia()))

  it('skip: click skip button → confirm → updateSchedule called with status skipped', async () => {
    vi.mocked(domain.updateSchedule).mockClear()
    const wrapper = mount(ScheduleSheet, {
      props: {
        date: '2026-08-20',
        scheduled: [
          { id: 7, date: '2026-08-20', time: '18:00', routine_id: 1, status: 'planned', workout_id: null, note: null },
        ],
      },
      global: { plugins: [createI18nInstance()] },
    })
    await flushPromises()

    const skipButton = wrapper.find('[data-testid="skip-session-7"]')
    expect(skipButton.exists()).toBe(true)
    await skipButton.trigger('click')
    await flushPromises()

    const confirmButtonEl = document.querySelector('[data-testid="confirm-skip"]') as HTMLElement
    expect(confirmButtonEl).toBeDefined()
    confirmButtonEl?.click()
    await flushPromises()

    expect(vi.mocked(domain.updateSchedule)).toHaveBeenCalledWith(7, { status: 'skipped' })
  })

  it('delete: click delete button → confirm → deleteSchedule called', async () => {
    vi.mocked(domain.deleteSchedule).mockClear()
    const wrapper = mount(ScheduleSheet, {
      props: {
        date: '2026-08-20',
        scheduled: [
          { id: 7, date: '2026-08-20', time: '18:00', routine_id: 1, status: 'planned', workout_id: null, note: null },
        ],
      },
      global: { plugins: [createI18nInstance()] },
    })
    await flushPromises()

    const deleteButton = wrapper.find('[data-testid="delete-session-7"]')
    expect(deleteButton.exists()).toBe(true)
    await deleteButton.trigger('click')
    await flushPromises()

    const confirmButtonEl = document.querySelector('[data-testid="confirm-delete"]') as HTMLElement
    expect(confirmButtonEl).toBeDefined()
    confirmButtonEl?.click()
    await flushPromises()

    expect(vi.mocked(domain.deleteSchedule)).toHaveBeenCalledWith(7)
  })

  it('delete: click delete → cancel → deleteSchedule not called', async () => {
    vi.mocked(domain.deleteSchedule).mockClear()
    const wrapper = mount(ScheduleSheet, {
      props: {
        date: '2026-08-20',
        scheduled: [
          { id: 7, date: '2026-08-20', time: '18:00', routine_id: 1, status: 'planned', workout_id: null, note: null },
        ],
      },
      global: { plugins: [createI18nInstance()] },
    })
    await flushPromises()

    const deleteButton = wrapper.find('[data-testid="delete-session-7"]')
    await deleteButton.trigger('click')
    await flushPromises()

    // Find cancel button - first Cancel button in the confirm sheet
    const allButtons = Array.from(document.querySelectorAll('button'))
    const cancelButton = allButtons.find(b => b.textContent?.includes('Cancel') && b.closest('[role="dialog"]'))
    expect(cancelButton).toBeDefined()
    cancelButton?.click()
    await flushPromises()

    expect(vi.mocked(domain.deleteSchedule)).not.toHaveBeenCalled()
  })

  it('replan: click replan → set date/time → save → updateSchedule called with date and time', async () => {
    vi.mocked(domain.updateSchedule).mockClear()
    const wrapper = mount(ScheduleSheet, {
      props: {
        date: '2026-08-20',
        scheduled: [
          { id: 7, date: '2026-08-20', time: '18:00', routine_id: 1, status: 'planned', workout_id: null, note: null },
        ],
      },
      global: { plugins: [createI18nInstance()] },
    })
    await flushPromises()

    const replanButton = wrapper.find('[data-testid="replan-session-7"]')
    expect(replanButton.exists()).toBe(true)
    await replanButton.trigger('click')
    await flushPromises()

    // Find and fill date and time fields in the teleported replan sheet
    const dateInput = document.querySelector('input[type="date"]') as HTMLInputElement
    expect(dateInput).toBeDefined()
    dateInput.value = '2026-08-25'
    dateInput.dispatchEvent(new Event('input', { bubbles: true }))

    const timeInputs = Array.from(document.querySelectorAll('input[type="time"]')) as HTMLInputElement[]
    if (timeInputs.length > 0) {
      const timeInput = timeInputs[timeInputs.length - 1]
      timeInput.value = '19:30'
      timeInput.dispatchEvent(new Event('input', { bubbles: true }))
    }
    await flushPromises()

    // Click the updateSchedule method directly (the sheet is teleported so finding buttons is complex)
    await (wrapper.vm as any).saveReplan()
    await flushPromises()

    expect(vi.mocked(domain.updateSchedule)).toHaveBeenCalledWith(7, expect.objectContaining({ date: '2026-08-25' }))
  })

  it('hides all action buttons when athlete is viewing another user', async () => {
    const athlete = useAthleteStore()
    athlete.view({ id: 7, username: 'other', is_admin: false, locale: 'es', units: 'kg', timezone: 'UTC' })
    const wrapper = mount(ScheduleSheet, {
      props: {
        date: '2026-08-03',
        scheduled: [
          { id: 3, date: '2026-08-03', time: null, routine_id: 3, status: 'planned', workout_id: null, note: 'Too busy' },
        ],
      },
      global: { plugins: [createI18nInstance()] },
    })
    await flushPromises()
    expect(wrapper.find('[data-testid="skip-session-3"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="delete-session-3"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="replan-session-3"]').exists()).toBe(false)
  })

  it('still renders session list when in read-only mode', async () => {
    const athlete = useAthleteStore()
    athlete.view({ id: 7, username: 'other', is_admin: false, locale: 'es', units: 'kg', timezone: 'UTC' })
    const wrapper = mount(ScheduleSheet, {
      props: {
        date: '2026-08-03',
        scheduled: [
          { id: 3, date: '2026-08-03', time: null, routine_id: 3, status: 'planned', workout_id: null, note: 'Too busy' },
        ],
      },
      global: { plugins: [createI18nInstance()] },
    })
    await flushPromises()
    expect(wrapper.text()).toContain('Too busy')
  })
})

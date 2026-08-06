import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

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
  startWorkout: vi.fn(async () => ({ id: 77, date: '2026-08-01', started_at: null, ended_at: null, routine_id: null, note: null, feeling: null, exercises: [], muscle_tag_ids: [] })),
  // item 2 (round 10): ScheduleSheet ya no recibe un resumen por prop, hace
  // su propio fetch de detalle al abrir el día — por defecto vacío, cada
  // test que necesite datos concretos usa mockResolvedValueOnce
  listWorkouts: vi.fn(async () => []),
  getRecords: vi.fn(async () => []),
  listExercises: vi.fn(async () => []),
  deleteWorkout: vi.fn(async () => {}),
}))
// push compartido (no un vi.fn() nuevo por llamada a useRouter): así los
// tests de navegación (ScheduleSheet → editor) pueden aserir sobre él
const push = vi.fn()
vi.mock('vue-router', () => ({ useRouter: () => ({ push }) }))
vi.mock('@/utils/apiErrors', () => ({
  toastApiError: vi.fn(),
}))

import { isValidRuneName, primaryRune } from '@/lib/runeResolve'
import MonthGrid from '@/components/calendar/MonthGrid.vue'
import ScheduleSheet from '@/components/calendar/ScheduleSheet.vue'
import * as domain from '@/api/domain'
import { createI18nInstance } from '@/i18n'
import { useAthleteStore } from '@/stores/athlete'
import CalendarView from '@/views/CalendarView.vue'

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

describe('primaryRune', () => {
  const muscleGroups = [
    { id: 1, slug: 'chest', name_es: 'Pecho', name_en: 'Chest', owner_id: null },
    { id: 2, slug: 'back', name_es: 'Espalda', name_en: 'Back', owner_id: null },
  ]

  it('resolves the rune of the exercise primary muscle group', () => {
    const exercise = {
      id: 5,
      name_es: 'Press banca',
      name_en: 'Bench press',
      measurement: 'strength' as const,
      owner_id: null,
      muscle_groups: [{ muscle_group_id: 1, is_primary: true }],
    }
    expect(primaryRune(exercise as never, muscleGroups as never)).toBe('chest')
  })

  it('returns null when the exercise has no primary muscle group', () => {
    const exercise = {
      id: 5,
      name_es: 'Press banca',
      name_en: 'Bench press',
      measurement: 'strength' as const,
      owner_id: null,
      muscle_groups: [{ muscle_group_id: 1, is_primary: false }],
    }
    expect(primaryRune(exercise as never, muscleGroups as never)).toBeNull()
  })

  it('returns null when the exercise is undefined', () => {
    expect(primaryRune(undefined, muscleGroups as never)).toBeNull()
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

  it('gives a day cell with runes the same sizing classes as an empty day cell (uniform squares)', async () => {
    // reloj pineado a un día distinto de los dos comparados: si "hoy" cayera
    // en 2026-08-01 o 2026-08-10, el borde especial de "hoy" rompería la
    // comparación de clases entre ambas celdas
    vi.useFakeTimers({ now: new Date('2026-08-15T12:00:00Z'), toFake: ['Date'] })
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

    const cellWithRunes = wrapper.get('[data-testid="day-cell-2026-08-01"]')
    const emptyCell = wrapper.get('[data-testid="day-cell-2026-08-10"]')

    expect(cellWithRunes.classes()).toContain('aspect-square')
    expect(cellWithRunes.classes().sort()).toEqual(emptyCell.classes().sort())

    vi.useRealTimers()
  })

  it('item 6: status dot sits at the top of the cell and runes at the bottom (independent overlays, no shared footer to collide with the day number)', async () => {
    const wrapper = mount(MonthGrid, {
      props: {
        month: {
          scheduled: [
            { id: 1, date: '2026-08-01', time: '18:00', routine_id: 1, status: 'planned', workout_id: null, note: null },
          ],
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

    const cell = wrapper.get('[data-testid="day-cell-2026-08-01"]')
    const dotContainer = cell.get('[data-status="planned"]').element.parentElement as HTMLElement
    const runeContainer = cell.findComponent({ name: 'BkRune' }).element.parentElement as HTMLElement

    expect(dotContainer.className).toContain('top-1')
    expect(runeContainer.className).toContain('bottom-1')
    // el número del día sigue presente, sin ser desplazado por ninguno de los dos overlays
    expect(cell.find('.text-xs.font-semibold').exists()).toBe(true)
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

  it('renders duplicate-group runes on a double-session day without a Vue duplicate-key warning and caps at 3', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    // arranca con un solo rune ('back') para que el update de abajo NO pueda
    // resolverse por el fast-path de sync delantero/trasero de Vue (que se
    // salta la detección de duplicados cuando las claves ya encajaban); así
    // se fuerza el diff completo donde Vue sí compara claves repetidas
    const wrapper = mount(MonthGrid, {
      props: {
        month: {
          scheduled: [],
          workouts: [{ id: 9, date: '2026-08-05', feeling: 3, muscle_group_ids: [2] }],
        },
        year: 2026,
        monthNum: 8,
        groupMap: createGroupMap(),
      },
      global: { plugins: [createI18nInstance()] },
    })
    await flushPromises()

    // dos entrenamientos del mismo día comparten el grupo "chest": la lista
    // combinada de runas trae un duplicado real (chest, back, chest)
    await wrapper.setProps({
      month: {
        scheduled: [],
        workouts: [
          { id: 1, date: '2026-08-05', feeling: 4, muscle_group_ids: [1, 2] },
          { id: 2, date: '2026-08-05', feeling: 3, muscle_group_ids: [1, 3] },
        ],
      },
    })
    await flushPromises()

    const duplicateKeyWarning = warnSpy.mock.calls.some((call) =>
      call.some((arg) => typeof arg === 'string' && arg.includes('Duplicate keys')),
    )
    expect(duplicateKeyWarning).toBe(false)

    const runes = wrapper.findAllComponents({ name: 'BkRune' })
    expect(runes.length).toBe(3)

    warnSpy.mockRestore()
  })
})

describe('ScheduleSheet', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    push.mockClear()
  })

  it('create: picking a time and scheduling calls the API with it, then the trigger resets to the placeholder (I2: null, not the old "" that rendered blank)', async () => {
    vi.mocked(domain.schedule).mockClear()
    const wrapper = mount(ScheduleSheet, {
      props: { date: '2026-08-20', scheduled: [] },
      global: { plugins: [createI18nInstance()] },
    })
    await flushPromises()

    // BkTimeField (hora) va antes que BkSelect (rutina) en "Nueva sesión":
    // el primer role=combobox del formulario es el de hora
    const timeTrigger = wrapper.findAll('[role="combobox"]')[0]
    expect(timeTrigger.text()).toContain('--:--')

    await timeTrigger.trigger('click')
    await flushPromises()
    const [hourList, minuteList] = document.querySelectorAll('[role="listbox"]')
    const hour9 = Array.from(hourList.querySelectorAll('[role="option"]')).find((o) => o.textContent === '09')!
    const minute15 = Array.from(minuteList.querySelectorAll('[role="option"]')).find((o) => o.textContent === '15')!
    hour9.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    minute15.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    const applyBtn = document.querySelector('[data-testid="time-field-apply"]') as HTMLElement
    applyBtn.click()
    await flushPromises()
    expect(timeTrigger.text()).toContain('09:15')

    const scheduleBtn = wrapper.findAll('button').find((b) => b.text() === 'Programar')!
    await scheduleBtn.trigger('click')
    await flushPromises()

    expect(vi.mocked(domain.schedule)).toHaveBeenCalledWith(expect.objectContaining({ time: '09:15' }))
    // I2: tras crear, newTime vuelve a null (no '' — con el '' antiguo el
    // trigger se quedaba en blanco en vez de mostrar el placeholder)
    expect(timeTrigger.text()).toContain('--:--')
  })

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
    expect(confirmButtonEl).not.toBeNull()
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
    expect(confirmButtonEl).not.toBeNull()
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
    expect(cancelButton).not.toBeUndefined()
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
          // I1: pydantic serializa con segundos de verdad ("18:00:00") — la
          // fixture usa el formato REAL de la API, no el "18:00" cómodo
          { id: 7, date: '2026-08-20', time: '18:00:00', routine_id: 1, status: 'planned', workout_id: null, note: null },
        ],
      },
      global: { plugins: [createI18nInstance()] },
    })
    await flushPromises()

    const replanButton = wrapper.find('[data-testid="replan-session-7"]')
    expect(replanButton.exists()).toBe(true)
    await replanButton.trigger('click')
    await flushPromises()

    // BkDateField/BkTimeField (round 7): ya no son <input type="date|time">
    // nativos. El sheet de replan monta BkDateField (fecha) antes que
    // BkTimeField (hora) — mismo orden que en el template.
    const dialog = document.querySelector('[role="dialog"]') as HTMLElement
    const [dateTrigger, timeTrigger] = dialog.querySelectorAll('[role="combobox"]')

    // I1: el trigger de hora precargado muestra "18:00", nunca los segundos
    // crudos de la API ("18:00:00") — startReplan() pasa por formatTimeShort
    expect(timeTrigger.textContent).toContain('18:00')
    expect(timeTrigger.textContent).not.toContain('18:00:00')

    // sesión original del 2026-08-20: el panel de fecha abre ya en agosto,
    // así que el día 25 se puede clicar directamente sin navegar de mes
    dateTrigger.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await flushPromises()
    const day25 = Array.from(document.querySelectorAll('[role="gridcell"]'))
      .find((c) => c.id.endsWith('2026-08-25')) as HTMLElement
    expect(day25).not.toBeUndefined()
    day25.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await flushPromises()

    timeTrigger.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await flushPromises()
    const [hourList, minuteList] = document.querySelectorAll('[role="listbox"]')
    const hour19 = Array.from(hourList.querySelectorAll('[role="option"]')).find((o) => o.textContent === '19')!
    const minute30 = Array.from(minuteList.querySelectorAll('[role="option"]')).find((o) => o.textContent === '30')!
    hour19.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    minute30.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    const applyBtn = document.querySelector('[data-testid="time-field-apply"]') as HTMLElement
    applyBtn.click()
    await flushPromises()

    // Find and click the Save button in the teleported replan sheet
    const allButtons = Array.from(document.querySelectorAll('button'))
    const saveButton = allButtons.find(b => b.textContent?.includes('Guardar') && b.closest('[role="dialog"]'))
    expect(saveButton).not.toBeUndefined()
    saveButton?.click()
    await flushPromises()

    expect(vi.mocked(domain.updateSchedule)).toHaveBeenCalledWith(
      7,
      expect.objectContaining({ date: '2026-08-25', time: '19:30' }),
    )
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

  it('renders a localized day label in the header, not the raw ISO date', async () => {
    const wrapper = mount(ScheduleSheet, {
      props: { date: '2026-08-25', scheduled: [] },
      global: { plugins: [createI18nInstance()] },
    })
    await flushPromises()
    expect(wrapper.text()).toContain('agosto')
    expect(wrapper.text()).not.toContain('2026-08-25')
  })

  it('renders a session time without seconds', async () => {
    const wrapper = mount(ScheduleSheet, {
      props: {
        date: '2026-08-20',
        scheduled: [
          { id: 7, date: '2026-08-20', time: '19:30:00', routine_id: 1, status: 'planned', workout_id: null, note: null },
        ],
      },
      global: { plugins: [createI18nInstance()] },
    })
    await flushPromises()
    expect(wrapper.text()).toContain('19:30')
    expect(wrapper.text()).not.toContain('19:30:00')
  })

  describe('round 8: retro workout entry points', () => {
    afterEach(() => vi.useRealTimers())

    it('edit button on a logged workout navigates to its editor', async () => {
      // item 2 (round 10): ScheduleSheet ya no recibe un resumen por prop —
      // hace su propio fetch de detalle (listWorkouts) al abrir el día
      vi.mocked(domain.listWorkouts).mockResolvedValueOnce([
        {
          id: 42, date: '2026-08-01', started_at: null, ended_at: null,
          routine_id: null, note: null, feeling: 4, exercises: [], muscle_tag_ids: [],
        },
      ] as never)

      const wrapper = mount(ScheduleSheet, {
        props: { date: '2026-08-01', scheduled: [] },
        global: { plugins: [createI18nInstance()] },
      })
      await flushPromises()

      await wrapper.find('[data-testid="edit-workout-42"]').trigger('click')

      expect(push).toHaveBeenCalledWith({ name: 'workout-edit', params: { id: 42 } })
    })

    it('"Registrar entreno" on a past day creates a finished workout via startWorkout({date, finished:true}) and navigates to its editor', async () => {
      vi.useFakeTimers({ now: new Date('2026-08-06T12:00:00Z'), toFake: ['Date'] })
      vi.mocked(domain.startWorkout).mockResolvedValueOnce({
        id: 88, date: '2026-08-01', started_at: '2026-08-01T12:00:00', ended_at: '2026-08-01T12:00:00',
        routine_id: null, note: null, feeling: null, exercises: [], muscle_tag_ids: [],
      } as never)

      const wrapper = mount(ScheduleSheet, {
        props: { date: '2026-08-01', scheduled: [] },
        global: { plugins: [createI18nInstance()] },
      })
      await flushPromises()

      const button = wrapper.find('[data-testid="log-past-workout"]')
      expect(button.exists()).toBe(true)
      await button.trigger('click')
      await flushPromises()

      expect(domain.startWorkout).toHaveBeenCalledWith({ date: '2026-08-01', finished: true })
      expect(push).toHaveBeenCalledWith({ name: 'workout-edit', params: { id: 88 } })
    })

    it('"Registrar entreno" is present for today', async () => {
      vi.useFakeTimers({ now: new Date('2026-08-06T12:00:00Z'), toFake: ['Date'] })
      const wrapper = mount(ScheduleSheet, {
        props: { date: '2026-08-06', scheduled: [] },
        global: { plugins: [createI18nInstance()] },
      })
      await flushPromises()

      expect(wrapper.find('[data-testid="log-past-workout"]').exists()).toBe(true)
    })

    it('"Registrar entreno" is absent on a future day', async () => {
      vi.useFakeTimers({ now: new Date('2026-08-06T12:00:00Z'), toFake: ['Date'] })
      const wrapper = mount(ScheduleSheet, {
        props: { date: '2026-08-20', scheduled: [] },
        global: { plugins: [createI18nInstance()] },
      })
      await flushPromises()

      expect(wrapper.find('[data-testid="log-past-workout"]').exists()).toBe(false)
    })
  })

  describe('item 1 (round 10): "programar rutina" date/time guards', () => {
    afterEach(() => vi.useRealTimers())

    it('a past day shows no "programar rutina" form (retro-log/edit already cover it)', async () => {
      vi.useFakeTimers({ now: new Date('2026-08-06T12:00:00Z'), toFake: ['Date'] })
      const wrapper = mount(ScheduleSheet, {
        props: { date: '2026-08-01', scheduled: [] },
        global: { plugins: [createI18nInstance()] },
      })
      await flushPromises()

      expect(wrapper.text()).not.toContain('Nueva sesión')
    })

    it('today shows the form, with hours before "now" disabled in its time field', async () => {
      // Europe/Madrid en agosto es CEST (UTC+2): 12:30 UTC -> 14:30 locales
      vi.useFakeTimers({ now: new Date('2026-08-06T12:30:00Z'), toFake: ['Date'] })
      const wrapper = mount(ScheduleSheet, {
        props: { date: '2026-08-06', scheduled: [] },
        global: { plugins: [createI18nInstance()] },
      })
      await flushPromises()

      expect(wrapper.text()).toContain('Nueva sesión')

      // BkTimeField (hora) va antes que BkSelect (rutina): primer combobox
      const timeTrigger = wrapper.findAll('[role="combobox"]')[0]
      await timeTrigger.trigger('click')
      await flushPromises()

      const hourList = document.querySelectorAll('[role="listbox"]')[0]
      const hour13 = Array.from(hourList.querySelectorAll('[role="option"]')).find((o) => o.textContent === '13')!
      const hour15 = Array.from(hourList.querySelectorAll('[role="option"]')).find((o) => o.textContent === '15')!
      expect(hour13.getAttribute('aria-disabled')).toBe('true')
      expect(hour15.getAttribute('aria-disabled')).toBeNull()

      // limpieza: cierra el panel (Escape) para no dejar un listbox huérfano
      // en document.body que confunda al siguiente test
      document.activeElement!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }))
      await flushPromises()
    })

    it('a future day shows the form with no disabled hour at all (no floor applies)', async () => {
      vi.useFakeTimers({ now: new Date('2026-08-06T12:00:00Z'), toFake: ['Date'] })
      const wrapper = mount(ScheduleSheet, {
        props: { date: '2026-08-20', scheduled: [] },
        global: { plugins: [createI18nInstance()] },
      })
      await flushPromises()

      const timeTrigger = wrapper.findAll('[role="combobox"]')[0]
      await timeTrigger.trigger('click')
      await flushPromises()

      const hourList = document.querySelectorAll('[role="listbox"]')[0]
      expect(hourList.querySelector('[aria-disabled="true"]')).toBeNull()

      document.activeElement!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }))
      await flushPromises()
    })
  })

  describe('item 2 (round 10): day info card', () => {
    it('shows the routine name, per-exercise lines, total sets/volume and the feeling for a logged workout', async () => {
      vi.mocked(domain.listWorkouts).mockResolvedValueOnce([
        {
          id: 42,
          date: '2026-08-01',
          started_at: '2026-08-01T18:00:00',
          ended_at: '2026-08-01T19:05:00',
          routine_id: 1, // 'Push' en el mock de listRoutines
          note: 'Buen entreno',
          feeling: 4,
          exercises: [
            {
              id: 1, exercise_id: 10, position: 0, note: null,
              sets: [
                { id: 1, set_number: 1, reps: 8, weight_kg: 80, duration_seconds: null, distance_m: null, is_warmup: false, rpe: null, completed_at: '2026-08-01T18:10:00' },
                { id: 2, set_number: 2, reps: 8, weight_kg: 80, duration_seconds: null, distance_m: null, is_warmup: false, rpe: null, completed_at: '2026-08-01T18:15:00' },
              ],
            },
          ],
          muscle_tag_ids: [],
        },
      ] as never)
      vi.mocked(domain.listExercises).mockResolvedValueOnce([
        { id: 10, name_es: 'Press de banca', name_en: 'Bench Press', measurement: 'strength', owner_id: null, muscle_groups: [] },
      ] as never)

      const wrapper = mount(ScheduleSheet, {
        props: { date: '2026-08-01', scheduled: [] },
        global: { plugins: [createI18nInstance()] },
      })
      await flushPromises()

      expect(wrapper.text()).toContain('Push')
      expect(wrapper.text()).toContain('Press de banca')
      expect(wrapper.get('[data-testid="workout-card-sets"]').text()).toBe('2')
      expect(wrapper.get('[data-testid="workout-card-volume"]').text()).toContain('1280')
    })

    it('shows "Entreno libre" when the workout has no routine_id', async () => {
      vi.mocked(domain.listWorkouts).mockResolvedValueOnce([
        { id: 43, date: '2026-08-01', started_at: null, ended_at: null, routine_id: null, note: null, feeling: null, exercises: [], muscle_tag_ids: [] },
      ] as never)

      const wrapper = mount(ScheduleSheet, {
        props: { date: '2026-08-01', scheduled: [] },
        global: { plugins: [createI18nInstance()] },
      })
      await flushPromises()

      expect(wrapper.text()).toContain('Entreno libre')
    })

    it('"PRs of the day" only lists records achieved on the selected date, not on other dates', async () => {
      vi.mocked(domain.getRecords).mockResolvedValueOnce([
        { id: 1, exercise_id: 10, kind: 'max_weight', value: 100, achieved_at: '2026-08-01T18:20:00' },
        { id: 2, exercise_id: 10, kind: 'max_weight', value: 90, achieved_at: '2026-08-02T10:00:00' },
      ] as never)

      const wrapper = mount(ScheduleSheet, {
        props: { date: '2026-08-01', scheduled: [] },
        global: { plugins: [createI18nInstance()] },
      })
      await flushPromises()

      expect(wrapper.find('[data-testid="pr-of-day-1"]').exists()).toBe(true)
      expect(wrapper.find('[data-testid="pr-of-day-2"]').exists()).toBe(false)
      expect(wrapper.get('[data-testid="pr-of-day-1"]').text()).toContain('100')
    })

    it('athlete mode: the day-info card renders, but its edit/delete controls do not (mutations are own-only)', async () => {
      const athlete = useAthleteStore()
      athlete.view({ id: 7, username: 'other', is_admin: false, locale: 'es', units: 'kg', timezone: 'UTC' })
      vi.mocked(domain.listWorkouts).mockResolvedValueOnce([
        { id: 42, date: '2026-08-01', started_at: null, ended_at: null, routine_id: 1, note: null, feeling: null, exercises: [], muscle_tag_ids: [] },
      ] as never)

      const wrapper = mount(ScheduleSheet, {
        props: { date: '2026-08-01', scheduled: [] },
        global: { plugins: [createI18nInstance()] },
      })
      await flushPromises()

      expect(wrapper.text()).toContain('Push')
      expect(wrapper.find('[data-testid="edit-workout-42"]').exists()).toBe(false)
      expect(wrapper.find('[data-testid="delete-workout-42"]').exists()).toBe(false)
    })
  })

  describe('amendment A (round 10): unified session + workout card', () => {
    it('a done session with a linked workout renders as ONE card (edit + delete together), not a separate session row', async () => {
      vi.mocked(domain.listWorkouts).mockResolvedValueOnce([
        { id: 42, date: '2026-08-02', started_at: '2026-08-02T10:00:00', ended_at: '2026-08-02T10:45:00', routine_id: 2, note: null, feeling: null, exercises: [], muscle_tag_ids: [] },
      ] as never)

      const wrapper = mount(ScheduleSheet, {
        props: {
          date: '2026-08-02',
          scheduled: [
            { id: 5, date: '2026-08-02', time: '10:00:00', routine_id: 2, status: 'done', workout_id: 42, note: null },
          ],
        },
        global: { plugins: [createI18nInstance()] },
      })
      await flushPromises()

      // sin fila de sesión "completada" aparte
      expect(wrapper.find('[data-status="done"]').exists()).toBe(false)
      // una única tarjeta con editar Y borrar
      expect(wrapper.find('[data-testid="edit-workout-42"]').exists()).toBe(true)
      expect(wrapper.find('[data-testid="delete-workout-42"]').exists()).toBe(true)
    })

    it('deleting the unified card calls deleteWorkout (not deleteSchedule), confirmed with the workout-discard copy', async () => {
      vi.mocked(domain.deleteWorkout).mockClear()
      vi.mocked(domain.deleteSchedule).mockClear()
      vi.mocked(domain.listWorkouts).mockResolvedValueOnce([
        { id: 42, date: '2026-08-02', started_at: null, ended_at: null, routine_id: null, note: null, feeling: null, exercises: [], muscle_tag_ids: [] },
      ] as never)

      const wrapper = mount(ScheduleSheet, {
        props: { date: '2026-08-02', scheduled: [] },
        global: { plugins: [createI18nInstance()] },
      })
      await flushPromises()

      await wrapper.find('[data-testid="delete-workout-42"]').trigger('click')
      await flushPromises()

      const dialogTitle = document.querySelector('[role="dialog"] h2') as HTMLElement
      expect(dialogTitle).not.toBeNull()
      expect(dialogTitle.textContent).toContain('¿Descartar el entreno?')

      const confirmBtn = document.querySelector('[data-testid="confirm-delete"]') as HTMLElement
      confirmBtn.click()
      await flushPromises()

      expect(domain.deleteWorkout).toHaveBeenCalledWith(42)
      expect(domain.deleteSchedule).not.toHaveBeenCalled()
    })
  })

  describe('amendment B (round 10): "Registrar entreno" is a primary action', () => {
    afterEach(() => vi.useRealTimers())

    it('renders with the primary (aurora) variant, like other add-affordances in the sheet', async () => {
      vi.useFakeTimers({ now: new Date('2026-08-06T12:00:00Z'), toFake: ['Date'] })
      const wrapper = mount(ScheduleSheet, {
        props: { date: '2026-08-06', scheduled: [] },
        global: { plugins: [createI18nInstance()] },
      })
      await flushPromises()

      expect(wrapper.get('[data-testid="log-past-workout"]').classes()).toContain('bg-aurora-deep')
    })
  })

  describe('amendment D (round 10): lighter "Planificado" eyebrow, no umbrella title', () => {
    it('shows the eyebrow above a planned session', async () => {
      const wrapper = mount(ScheduleSheet, {
        props: {
          date: '2026-08-01',
          scheduled: [
            { id: 1, date: '2026-08-01', time: '18:00', routine_id: 1, status: 'planned', workout_id: null, note: null },
          ],
        },
        global: { plugins: [createI18nInstance()] },
      })
      await flushPromises()

      expect(wrapper.text()).toContain('Planificado')
    })

    it('does not show the eyebrow when the day only has skipped sessions', async () => {
      const wrapper = mount(ScheduleSheet, {
        props: {
          date: '2026-08-03',
          scheduled: [
            { id: 3, date: '2026-08-03', time: null, routine_id: 3, status: 'skipped', workout_id: null, note: 'Too busy' },
          ],
        },
        global: { plugins: [createI18nInstance()] },
      })
      await flushPromises()

      expect(wrapper.text()).not.toContain('Planificado')
    })
  })
})

describe('CalendarView schedule sheet (amendment D, round 10)', () => {
  beforeEach(() => setActivePinia(createPinia()))

  it('opening the day sheet shows no generic umbrella title', async () => {
    const wrapper = mount(CalendarView, {
      global: { plugins: [createI18nInstance()] },
      attachTo: document.body,
    })
    await flushPromises()

    const dayCell = wrapper.find('[data-testid^="day-cell-"]')
    await dayCell.trigger('click')
    await flushPromises()

    const dialog = document.querySelector('[role="dialog"]') as HTMLElement
    expect(dialog).not.toBeNull()
    expect(dialog.querySelector('h2')).toBeNull()

    wrapper.unmount()
  })
})

describe('CalendarView locale (I2)', () => {
  beforeEach(() => setActivePinia(createPinia()))
  afterEach(() => vi.useRealTimers())

  it('renders the month label and weekday headers in the VIEWER locale, not the viewed athlete\'s', async () => {
    // reloj fijado: la vista deriva el mes del reloj real y la aserción
    // sobre "August" solo es estable con fecha pineada
    vi.useFakeTimers({ now: new Date('2026-08-15T12:00:00Z'), toFake: ['Date'] })
    const athlete = useAthleteStore()
    // el atleta visto es hispanohablante; el viewer (esta sesión) está en inglés
    athlete.view({ id: 9, username: 'other', is_admin: false, locale: 'es', units: 'kg', timezone: 'UTC' })

    const wrapper = mount(CalendarView, {
      global: { plugins: [createI18nInstance('en')] },
    })
    await flushPromises()

    // label del mes: "August 2026", no "agosto de 2026"
    expect(wrapper.text()).toContain('August')
    expect(wrapper.text()).not.toContain('agosto')

    // headers de días de la semana (narrow) en inglés: miércoles es "W", nunca
    // la "X" que usa el formateador en español
    const headers = wrapper.findAll('.grid.grid-cols-7 > div').map((h) => h.text())
    expect(headers).toContain('W')
    expect(headers).not.toContain('X')
  })
})

describe('CalendarView heatmap empty state', () => {
  beforeEach(() => setActivePinia(createPinia()))

  it('still renders the heatmap section heading when getHeatmap resolves an empty array', async () => {
    vi.mocked(domain.getHeatmap).mockResolvedValueOnce([])
    const wrapper = mount(CalendarView, {
      global: { plugins: [createI18nInstance()] },
    })
    await flushPromises()

    expect(wrapper.text()).toContain('Actividad del año')
    expect(wrapper.findComponent({ name: 'BkHeatmap' }).exists()).toBe(true)
  })

  it('item 3: centers the "Actividad del año" heading', async () => {
    const wrapper = mount(CalendarView, {
      global: { plugins: [createI18nInstance()] },
    })
    await flushPromises()

    // único h3 de la vista: si dejara de serlo, .get() falla ruidosamente
    // en vez de colar un undefined silencioso
    const heading = wrapper.get('h3')
    expect(heading.text()).toBe('Actividad del año')
    expect(heading.classes()).toContain('text-center')
  })
})

describe('CalendarView layout (round 6, items 3/4)', () => {
  beforeEach(() => setActivePinia(createPinia()))

  it('has no view-level h1 (Hoy never had one) and no horizontal padding of its own on the root', async () => {
    const wrapper = mount(CalendarView, {
      global: { plugins: [createI18nInstance()] },
    })
    await flushPromises()

    expect(wrapper.find('h1').exists()).toBe(false)
    // <main> del shell ya pone px-4: la raíz de la vista no debe duplicarlo
    expect(wrapper.classes().some((c) => c === 'p-4' || c.startsWith('px-'))).toBe(false)
  })

  it('keeps the rune-legend button in the month-navigation row, next to the chevrons', async () => {
    const wrapper = mount(CalendarView, {
      global: { plugins: [createI18nInstance()] },
    })
    await flushPromises()

    const infoButton = wrapper.get('[data-testid="rune-legend-btn"]')
    const monthNavRow = infoButton.element.parentElement as HTMLElement
    // el mismo row contiene los botones de mes anterior/siguiente + la leyenda
    expect(monthNavRow.querySelectorAll('button').length).toBeGreaterThanOrEqual(3)
  })
})

describe('CalendarView rune legend (item 7)', () => {
  // BkSheet teletransporta a document.body: cada test desmonta el suyo o el
  // siguiente hereda un sheet huérfano (mismo motivo que en BodySection)
  let wrapper: VueWrapper | null = null

  beforeEach(() => setActivePinia(createPinia()))
  afterEach(() => {
    wrapper?.unmount()
    wrapper = null
  })

  it('clicking the info button opens a sheet listing a muscle group name with its rune', async () => {
    wrapper = mount(CalendarView, {
      global: { plugins: [createI18nInstance()] },
      attachTo: document.body,
    })
    await flushPromises()

    const infoButton = document.querySelector('[data-testid="rune-legend-btn"]') as HTMLElement
    expect(infoButton).not.toBeNull()
    infoButton.click()
    await flushPromises()

    const sheet = document.querySelector('[role="dialog"]') as HTMLElement
    expect(sheet).not.toBeNull()
    expect(sheet.textContent).toContain('Pecho')
    expect(sheet.querySelector('svg')).not.toBeNull()
  })
})

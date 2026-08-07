import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { reactive } from 'vue'
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
// push/replace compartidos (no un vi.fn() nuevo por llamada a useRouter):
// así los tests de navegación (ScheduleSheet → editor, item 8 → replace de
// la query) pueden aserir sobre ellos
const push = vi.fn()
const replace = vi.fn()
// route reactiva: item 8 lee route.query.day con un watch inmediato —
// reactive() (no un objeto plano) para poder probar también el caso de
// cambio de query en caliente, no solo el de montaje. `let` + REASIGNAR (no
// mutar) un objeto nuevo en cada test, ver más abajo: este fichero tiene
// muchos CalendarView montados en otros describes que nunca se desmontan
// (deuda de tests previa a este ítem), así que siguen "vivos" con su propio
// watch sobre route.query.day — si currentRoute fuera un único objeto
// reactive() mutado en sitio, escribir en su .query dispararía TAMBIÉN el
// watcher de esos zombies (comparten la misma referencia), abriendo su
// propio day-sheet y contaminando document.body con diálogos ajenos. Con
// reasignación, cada test tiene su propio objeto: los zombies de otros
// tests se quedan enganchados al suyo, ya huérfano, y no reaccionan.
let currentRoute = reactive<{ query: Record<string, string> }>({ query: {} })
vi.mock('vue-router', () => ({ useRouter: () => ({ push, replace }), useRoute: () => currentRoute }))
vi.mock('@/utils/apiErrors', () => ({
  toastApiError: vi.fn(),
}))

// reset compartido: sin esto, la query de un test (p.ej. item 8) se filtra
// al siguiente CalendarView montado en otro describe
beforeEach(() => {
  currentRoute = reactive({ query: {} })
  push.mockClear()
  replace.mockClear()
})

import { isValidRuneName, primaryRune } from '@/lib/runeResolve'
import MonthGrid from '@/components/calendar/MonthGrid.vue'
import ScheduleSheet from '@/components/calendar/ScheduleSheet.vue'
import BkUser from '@/lib/BkUser.vue'
import * as domain from '@/api/domain'
import type { SharedUserOut } from '@/api/domain'
import { createI18nInstance } from '@/i18n'
import { useAthleteStore } from '@/stores/athlete'
import { useAuthStore } from '@/stores/auth'
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

  it('renders planned session dot as a hollow ring (border, no fill) colored by --bk-day-dot', async () => {
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
    const dot = wrapper.get('[data-status="planned"]')
    expect(dot.classes()).toContain('border-2')
    expect(dot.classes()).toContain('border-[var(--bk-day-dot)]')
    expect(dot.classes()).not.toContain('bg-[var(--bk-day-dot)]')
  })

  it('v0.3.0 item 3 (bug fix): a workout dot ("done") comes from workouts[], not from a scheduled session status — a standalone workout (no schedule behind it) still gets a filled dot', async () => {
    const wrapper = mount(MonthGrid, {
      props: {
        month: {
          scheduled: [],
          workouts: [
            { id: 5, date: '2026-08-02', feeling: null, muscle_group_ids: [] },
          ],
        },
        year: 2026,
        monthNum: 8,
        groupMap: createGroupMap(),
      },
      global: { plugins: [createI18nInstance()] },
    })
    await flushPromises()
    const dot = wrapper.get('[data-status="done"]')
    expect(dot.classes()).toContain('bg-[var(--bk-day-dot)]')
    expect(dot.classes()).not.toContain('border-2')
  })

  it('v0.3.0 item 3 (bug fix): a workout with zero exercises/muscle groups still gets identified by a top dot (dots derive from workouts[], not from muscle groups)', async () => {
    const wrapper = mount(MonthGrid, {
      props: {
        month: {
          scheduled: [],
          workouts: [
            { id: 9, date: '2026-08-09', feeling: null, muscle_group_ids: [] },
          ],
        },
        year: 2026,
        monthNum: 8,
        groupMap: createGroupMap(),
      },
      global: { plugins: [createI18nInstance()] },
    })
    await flushPromises()
    // sin runa (sin grupos musculares), pero SÍ con dot arriba
    const cell = wrapper.get('[data-testid="day-cell-2026-08-09"]')
    expect(cell.find('[data-status="done"]').exists()).toBe(true)
    expect(cell.findComponent({ name: 'BkRune' }).exists()).toBe(false)
  })

  it('v0.3.0 item 3 (bug fix): a skipped session leaves no top dot (it is neither a workout nor still pending)', async () => {
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
    const cell = wrapper.get('[data-testid="day-cell-2026-08-03"]')
    expect(cell.find('[data-status]').exists()).toBe(false)
  })

  it('renders multiple planned-session dots per day', async () => {
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

  it('v0.3.0 item 3: "si hay más de un entreno, más de un dot en línea horizontal" — one dot per workout, in a horizontal row', async () => {
    const wrapper = mount(MonthGrid, {
      props: {
        month: {
          scheduled: [],
          workouts: [
            { id: 1, date: '2026-08-01', feeling: 4, muscle_group_ids: [] },
            { id: 2, date: '2026-08-01', feeling: 3, muscle_group_ids: [] },
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
    const dots = cell.findAll('[data-status="done"]')
    expect(dots).toHaveLength(2)
    const row = dots[0].element.parentElement as HTMLElement
    expect(row.className).toContain('flex')
    expect(dots[1].element.parentElement).toBe(row)
  })

  it('v0.3.0 item 3: caps the top dot row at 3, even with more workouts that day', async () => {
    const wrapper = mount(MonthGrid, {
      props: {
        month: {
          scheduled: [],
          workouts: [
            { id: 1, date: '2026-08-01', feeling: null, muscle_group_ids: [] },
            { id: 2, date: '2026-08-01', feeling: null, muscle_group_ids: [] },
            { id: 3, date: '2026-08-01', feeling: null, muscle_group_ids: [] },
            { id: 4, date: '2026-08-01', feeling: null, muscle_group_ids: [] },
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
    expect(cell.findAll('[data-status="done"]')).toHaveLength(3)
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

  it('v0.3.0 item 3: wires --bk-day-dot on the grid container, defaulting to the aurora token (so a future wave can recolor per athlete)', async () => {
    const wrapper = mount(MonthGrid, {
      props: {
        month: { scheduled: [], workouts: [] },
        year: 2026,
        monthNum: 8,
        groupMap: createGroupMap(),
      },
      global: { plugins: [createI18nInstance()] },
    })
    await flushPromises()
    const grid = wrapper.get('[data-testid="month-grid"]')
    expect(grid.attributes('style')).toContain('--bk-day-dot: var(--color-aurora)')
  })

  it('polish wave item 1: today\'s cell glows on the BORDER only — the day number stays in normal ink', async () => {
    vi.useFakeTimers({ now: new Date('2026-08-15T12:00:00Z'), toFake: ['Date'] })
    const wrapper = mount(MonthGrid, {
      props: {
        month: { scheduled: [], workouts: [] },
        year: 2026,
        monthNum: 8,
        groupMap: createGroupMap(),
      },
      global: { plugins: [createI18nInstance()] },
    })
    await flushPromises()

    const todayCell = wrapper.get('[data-testid="day-cell-2026-08-15"]')
    expect(todayCell.classes()).toContain('border-aurora')
    expect(todayCell.classes()).toContain('border-2')
    const dayNumber = todayCell.get('.text-xs.font-semibold')
    expect(dayNumber.classes()).not.toContain('text-aurora')

    const otherCell = wrapper.get('[data-testid="day-cell-2026-08-16"]')
    expect(otherCell.classes()).not.toContain('border-aurora')
    expect(otherCell.get('.text-xs.font-semibold').classes()).not.toContain('text-aurora')

    vi.useRealTimers()
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

  // SHARED-DOTS OVERLAY (v0.4.1, pivote de producto de zurdi): "quiero que
  // EN MI PROPIO calendario salgan los puntitos de los otros users". Estos
  // tests cubren la composición en MonthGrid: month.shared es undefined en
  // modo atleta (el backend omite la clave, ver api/domain.ts), así que
  // "sin overlay" se prueba simplemente NO pasando `shared` en month.
  describe('SHARED-DOTS OVERLAY (v0.4.1)', () => {
    it('renders a shared dot with inline backgroundColor from the sharer\'s color and a title with their username', async () => {
      const wrapper = mount(MonthGrid, {
        props: {
          month: {
            scheduled: [],
            workouts: [],
            shared: [
              { user_id: 7, username: 'freyja', color: '#3b82f6', dates: ['2026-08-05'] },
            ],
          },
          year: 2026,
          monthNum: 8,
          groupMap: createGroupMap(),
        },
        global: { plugins: [createI18nInstance()] },
      })
      await flushPromises()

      const dot = wrapper.get('[data-shared-user="freyja"]')
      expect(dot.attributes('style')).toContain('background-color: #3b82f6')
      expect(dot.attributes('title')).toBe('freyja')
      expect(dot.attributes('data-status')).toBe('done')
    })

    it('falls back to the aurora token when the sharer has no color of their own', async () => {
      const wrapper = mount(MonthGrid, {
        props: {
          month: {
            scheduled: [],
            workouts: [],
            shared: [{ user_id: 7, username: 'freyja', color: null, dates: ['2026-08-05'] }],
          },
          year: 2026,
          monthNum: 8,
          groupMap: createGroupMap(),
        },
        global: { plugins: [createI18nInstance()] },
      })
      await flushPromises()

      const dot = wrapper.get('[data-shared-user="freyja"]')
      expect(dot.attributes('style')).toContain('background-color: var(--color-aurora)')
    })

    it('composes own dots with shared dots on the same day, mine first', async () => {
      const wrapper = mount(MonthGrid, {
        props: {
          month: {
            scheduled: [],
            workouts: [{ id: 1, date: '2026-08-05', feeling: null, muscle_group_ids: [] }],
            shared: [
              { user_id: 7, username: 'freyja', color: '#3b82f6', dates: ['2026-08-05'] },
            ],
          },
          year: 2026,
          monthNum: 8,
          groupMap: createGroupMap(),
        },
        global: { plugins: [createI18nInstance()] },
      })
      await flushPromises()

      const cell = wrapper.get('[data-testid="day-cell-2026-08-05"]')
      const dots = cell.findAll('[data-status="done"]')
      expect(dots).toHaveLength(2)
      // mía primero: sin backgroundColor inline (se pinta vía --bk-day-dot)
      expect(dots[0].attributes('style')).toBeUndefined()
      expect(dots[1].attributes('data-shared-user')).toBe('freyja')
    })

    it('caps the composed row at 3, prioritizing own dots over shared ones', async () => {
      const wrapper = mount(MonthGrid, {
        props: {
          month: {
            scheduled: [],
            workouts: [
              { id: 1, date: '2026-08-05', feeling: null, muscle_group_ids: [] },
              { id: 2, date: '2026-08-05', feeling: null, muscle_group_ids: [] },
              { id: 3, date: '2026-08-05', feeling: null, muscle_group_ids: [] },
            ],
            shared: [
              { user_id: 7, username: 'freyja', color: '#3b82f6', dates: ['2026-08-05'] },
            ],
          },
          year: 2026,
          monthNum: 8,
          groupMap: createGroupMap(),
        },
        global: { plugins: [createI18nInstance()] },
      })
      await flushPromises()

      const cell = wrapper.get('[data-testid="day-cell-2026-08-05"]')
      const dots = cell.findAll('[data-status="done"]')
      expect(dots).toHaveLength(3)
      expect(cell.find('[data-shared-user="freyja"]').exists()).toBe(false)
    })

    it('one dot per shared user with a workout that day, each in their own color', async () => {
      const wrapper = mount(MonthGrid, {
        props: {
          month: {
            scheduled: [],
            workouts: [],
            shared: [
              { user_id: 7, username: 'freyja', color: '#3b82f6', dates: ['2026-08-05'] },
              { user_id: 9, username: 'loki', color: '#f97316', dates: ['2026-08-05'] },
            ],
          },
          year: 2026,
          monthNum: 8,
          groupMap: createGroupMap(),
        },
        global: { plugins: [createI18nInstance()] },
      })
      await flushPromises()

      const cell = wrapper.get('[data-testid="day-cell-2026-08-05"]')
      const freyjaDot = cell.get('[data-shared-user="freyja"]')
      const lokiDot = cell.get('[data-shared-user="loki"]')
      expect(freyjaDot.attributes('style')).toContain('#3b82f6')
      expect(lokiDot.attributes('style')).toContain('#f97316')
    })

    it('does not add a shared dot on a day absent from the sharer\'s dates', async () => {
      const wrapper = mount(MonthGrid, {
        props: {
          month: {
            scheduled: [],
            workouts: [],
            shared: [{ user_id: 7, username: 'freyja', color: '#3b82f6', dates: ['2026-08-05'] }],
          },
          year: 2026,
          monthNum: 8,
          groupMap: createGroupMap(),
        },
        global: { plugins: [createI18nInstance()] },
      })
      await flushPromises()

      const otherCell = wrapper.get('[data-testid="day-cell-2026-08-06"]')
      expect(otherCell.find('[data-status]').exists()).toBe(false)
    })

    it('athlete mode: month.shared is undefined (the backend omits the key), so no shared dots render at all', async () => {
      const wrapper = mount(MonthGrid, {
        props: {
          month: {
            scheduled: [],
            workouts: [{ id: 1, date: '2026-08-05', feeling: null, muscle_group_ids: [] }],
            // sin `shared`: exactamente lo que envía el backend en modo atleta
          },
          year: 2026,
          monthNum: 8,
          groupMap: createGroupMap(),
        },
        global: { plugins: [createI18nInstance()] },
      })
      await flushPromises()

      expect(wrapper.find('[data-shared-user]').exists()).toBe(false)
      // el propio dot sigue intacto (.get() ya lanza si no existe)
      wrapper.get('[data-testid="day-cell-2026-08-05"] [data-status="done"]')
    })
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

  it('v0.3.0 item 5: planned-session actions are icon-only (BkActionBtn), with an accessible aria-label instead of visible text', async () => {
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

    const replanBtn = wrapper.get('[data-testid="replan-session-7"]')
    const skipBtn = wrapper.get('[data-testid="skip-session-7"]')
    const deleteBtn = wrapper.get('[data-testid="delete-session-7"]')

    expect(replanBtn.element.tagName).toBe('BUTTON')
    expect(replanBtn.find('svg').exists()).toBe(true)
    expect(replanBtn.text()).toBe('')
    expect(replanBtn.attributes('aria-label')).toBe('Replanificar')

    expect(skipBtn.find('svg').exists()).toBe(true)
    expect(skipBtn.text()).toBe('')
    expect(skipBtn.attributes('aria-label')).toBe('Omitir')

    expect(deleteBtn.find('svg').exists()).toBe(true)
    expect(deleteBtn.text()).toBe('')
    expect(deleteBtn.attributes('aria-label')).toBe('Borrar')
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

    it('"Registrar entreno" opens a picker (free workout + own routines) instead of logging directly', async () => {
      vi.useFakeTimers({ now: new Date('2026-08-06T12:00:00Z'), toFake: ['Date'] })
      const wrapper = mount(ScheduleSheet, {
        props: { date: '2026-08-01', scheduled: [] },
        global: { plugins: [createI18nInstance()] },
        attachTo: document.body,
      })
      await flushPromises()

      expect(document.querySelector('[data-testid="log-past-workout-free"]')).toBeNull()
      await wrapper.find('[data-testid="log-past-workout"]').trigger('click')
      await flushPromises()

      expect(domain.startWorkout).not.toHaveBeenCalled()
      expect(document.querySelector('[data-testid="log-past-workout-free"]')).not.toBeNull()
      // item 3: mock module-level de listRoutines trae 'Push' (id 1) y 'Pull' (id 2)
      expect(document.querySelector('[data-testid="log-past-workout-routine-1"]')).not.toBeNull()
      expect(document.querySelector('[data-testid="log-past-workout-routine-2"]')).not.toBeNull()

      wrapper.unmount()
    })

    it('picking "Entreno libre" in the picker calls startWorkout({date, finished:true}) without routine_id and navigates to the editor', async () => {
      vi.useFakeTimers({ now: new Date('2026-08-06T12:00:00Z'), toFake: ['Date'] })
      vi.mocked(domain.startWorkout).mockResolvedValueOnce({
        id: 88, date: '2026-08-01', started_at: '2026-08-01T12:00:00', ended_at: '2026-08-01T12:00:00',
        routine_id: null, note: null, feeling: null, exercises: [], muscle_tag_ids: [],
      } as never)

      const wrapper = mount(ScheduleSheet, {
        props: { date: '2026-08-01', scheduled: [] },
        global: { plugins: [createI18nInstance()] },
        attachTo: document.body,
      })
      await flushPromises()
      await wrapper.find('[data-testid="log-past-workout"]').trigger('click')
      await flushPromises()

      const freeBtn = document.querySelector<HTMLElement>('[data-testid="log-past-workout-free"]')!
      freeBtn.click()
      await flushPromises()

      expect(domain.startWorkout).toHaveBeenCalledWith({ date: '2026-08-01', finished: true, routine_id: undefined })
      expect(push).toHaveBeenCalledWith({ name: 'workout-edit', params: { id: 88 } })
      // el picker se cierra tras elegir
      expect(document.querySelector('[data-testid="log-past-workout-free"]')).toBeNull()

      wrapper.unmount()
    })

    it('picking a routine in the picker calls startWorkout with its routine_id, showing its rune when it has one', async () => {
      vi.useFakeTimers({ now: new Date('2026-08-06T12:00:00Z'), toFake: ['Date'] })
      vi.mocked(domain.listRoutines).mockResolvedValueOnce([
        { id: 1, name: 'Push', description: null, rune: 'core', color: null, exercises: [] },
      ] as never)
      vi.mocked(domain.startWorkout).mockResolvedValueOnce({
        id: 89, date: '2026-08-01', started_at: '2026-08-01T12:00:00', ended_at: '2026-08-01T12:00:00',
        routine_id: 1, note: null, feeling: null, exercises: [], muscle_tag_ids: [],
      } as never)

      const wrapper = mount(ScheduleSheet, {
        props: { date: '2026-08-01', scheduled: [] },
        global: { plugins: [createI18nInstance()] },
        attachTo: document.body,
      })
      await flushPromises()
      await wrapper.find('[data-testid="log-past-workout"]').trigger('click')
      await flushPromises()

      const routineBtn = document.querySelector<HTMLElement>('[data-testid="log-past-workout-routine-1"]')!
      expect(routineBtn.querySelector('svg')).not.toBeNull() // BkRune de 'core'
      routineBtn.click()
      await flushPromises()

      expect(domain.startWorkout).toHaveBeenCalledWith({ date: '2026-08-01', finished: true, routine_id: 1 })
      expect(push).toHaveBeenCalledWith({ name: 'workout-edit', params: { id: 89 } })

      wrapper.unmount()
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

    it('athlete mode: "Registrar entreno" (and its picker) stays hidden — unchanged by item 3', async () => {
      vi.useFakeTimers({ now: new Date('2026-08-06T12:00:00Z'), toFake: ['Date'] })
      const athlete = useAthleteStore()
      athlete.view({ id: 7, username: 'other', is_admin: false, locale: 'es', units: 'kg', timezone: 'UTC' })

      const wrapper = mount(ScheduleSheet, {
        props: { date: '2026-08-01', scheduled: [] },
        global: { plugins: [createI18nInstance()] },
      })
      await flushPromises()

      expect(wrapper.find('[data-testid="log-past-workout"]').exists()).toBe(false)
      expect(document.querySelector('[data-testid="log-past-workout-free"]')).toBeNull()
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

    it('shows the stretched indicator when the workout was marked as stretched', async () => {
      vi.mocked(domain.listWorkouts).mockResolvedValueOnce([
        {
          id: 43,
          date: '2026-08-01',
          started_at: '2026-08-01T18:00:00',
          ended_at: '2026-08-01T18:40:00',
          routine_id: null,
          note: null,
          feeling: null,
          stretched: true,
          exercises: [],
          muscle_tag_ids: [],
        },
      ] as never)
      vi.mocked(domain.listExercises).mockResolvedValueOnce([] as never)

      const wrapper = mount(ScheduleSheet, {
        props: { date: '2026-08-01', scheduled: [] },
        global: { plugins: [createI18nInstance()] },
      })
      await flushPromises()

      expect(wrapper.get('[data-testid="day-info-stretched"]').text()).toContain('He estirado')
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

  // item 1b (v0.4.2): zurdi: "cuando abro un día, aparte de ver mi
  // entrenamiento molaría que hubiese una pestaña en ese drawer POR USUARIO
  // para poder ver sus entrenamientos también". Solo en MI PROPIO calendario
  // (nunca en modo atleta) y solo usuarios con un entreno ESE día.
  describe('item 1b (v0.4.2): per-user day tabs', () => {
    const sharedUsers: SharedUserOut[] = [
      { user_id: 7, username: 'freyja', color: '#3b82f6', dates: ['2026-08-05'] },
    ]

    // item 9 (v0.4.3): la chip propia ahora renderiza vía BkUser (mi propio
    // username+color) — hace falta un auth.user para que el botón exista en
    // absoluto (v-if="auth.user" en ScheduleSheet.vue)
    beforeEach(() => {
      const auth = useAuthStore()
      auth.user = { id: 1, username: 'romm', is_admin: false, locale: 'es', units: 'kg', timezone: 'UTC', color: '#ff6600' }
    })

    afterEach(() => {
      // limpia las mockImplementation condicionales por userId de este bloque
      // para no filtrarse a otros describes del fichero
      vi.mocked(domain.listWorkouts).mockReset().mockImplementation(async () => [])
      vi.mocked(domain.getRecords).mockReset().mockImplementation(async () => [])
      vi.mocked(domain.listExercises).mockReset().mockImplementation(async () => [])
    })

    it('item 9: renders a tab per shared user alongside a uniform, same-shaped self tab (own username+color via BkUser)', async () => {
      const wrapper = mount(ScheduleSheet, {
        props: { date: '2026-08-05', scheduled: [], shared: sharedUsers },
        global: { plugins: [createI18nInstance()] },
      })
      await flushPromises()

      const selfTab = wrapper.get('[data-testid="day-tab-self"]')
      const userTab = wrapper.get('[data-testid="day-tab-7"]')
      // misma forma: idénticas clases de padding/tamaño en ambas chips (las
      // clases de estado activo/inactivo difieren a propósito — 'self' es
      // la pestaña activa por defecto, freyja no lo es — así que se compara
      // solo el subconjunto ESTÁTICO de forma, no la lista completa)
      const shapeClasses = ['rounded-full', 'border', 'px-2.5', 'py-1', 'transition-colors']
      for (const cls of shapeClasses) {
        expect(selfTab.classes()).toContain(cls)
        expect(userTab.classes()).toContain(cls)
      }
      // el propio username+color, no el literal "Tú"
      expect(selfTab.text()).not.toBe('Tú')
      expect(selfTab.findComponent(BkUser).props('user')).toEqual({ username: 'romm', color: '#ff6600' })
      // aria-label distingue "tu pestaña" para lectores de pantalla
      expect(selfTab.attributes('aria-label')).toContain('romm')
      const userBkUser = userTab.findComponent(BkUser)
      expect(userBkUser.props('user')).toEqual({ username: 'freyja', color: '#3b82f6' })
      expect(userBkUser.props('size')).toBe(selfTab.findComponent(BkUser).props('size'))
    })

    it('no tab strip when there are no shared users at all', async () => {
      const wrapper = mount(ScheduleSheet, {
        props: { date: '2026-08-05', scheduled: [], shared: [] },
        global: { plugins: [createI18nInstance()] },
      })
      await flushPromises()

      expect(wrapper.find('[data-testid="day-tabs"]').exists()).toBe(false)
    })

    it('no tab strip when a shared user has no workout on THIS day (date absent from their `dates`)', async () => {
      const wrapper = mount(ScheduleSheet, {
        props: { date: '2026-08-06', scheduled: [], shared: sharedUsers },
        global: { plugins: [createI18nInstance()] },
      })
      await flushPromises()

      expect(wrapper.find('[data-testid="day-tabs"]').exists()).toBe(false)
    })

    it('athlete mode: no tab strip even with a `shared` prop present (self-view only, defensive)', async () => {
      const athlete = useAthleteStore()
      athlete.view({ id: 7, username: 'other', is_admin: false, locale: 'es', units: 'kg', timezone: 'UTC' })
      const wrapper = mount(ScheduleSheet, {
        props: { date: '2026-08-05', scheduled: [], shared: sharedUsers },
        global: { plugins: [createI18nInstance()] },
      })
      await flushPromises()

      expect(wrapper.find('[data-testid="day-tabs"]').exists()).toBe(false)
    })

    it('picking a user tab fetches THEIR day detail (threaded with their userId), renders read-only cards and PRs, and hides the self carril entirely', async () => {
      vi.mocked(domain.listWorkouts).mockImplementation(async (params) => {
        if ((params as { userId?: number })?.userId === 7) {
          return [
            { id: 99, date: '2026-08-05', started_at: null, ended_at: null, routine_id: null, note: null, feeling: null, exercises: [], muscle_tag_ids: [] },
          ] as never
        }
        return [] as never
      })
      vi.mocked(domain.getRecords).mockImplementation(async (params) => {
        if ((params as { userId?: number })?.userId === 7) {
          return [{ id: 501, exercise_id: 1, kind: 'max_weight', value: 100, achieved_at: '2026-08-05T10:00:00' }] as never
        }
        return [] as never
      })
      vi.mocked(domain.listExercises).mockImplementation(async (params) => {
        if ((params as { userId?: number })?.userId === 7) {
          return [{ id: 1, name_es: 'Sentadilla', name_en: 'Squat', measurement: 'strength', owner_id: null, muscle_groups: [] }] as never
        }
        return [] as never
      })

      const wrapper = mount(ScheduleSheet, {
        props: { date: '2026-08-05', scheduled: [], shared: sharedUsers },
        global: { plugins: [createI18nInstance()] },
      })
      await flushPromises()

      await wrapper.get('[data-testid="day-tab-7"]').trigger('click')
      await flushPromises()

      expect(domain.listWorkouts).toHaveBeenCalledWith({ from_date: '2026-08-05', to_date: '2026-08-05', userId: 7 })
      expect(domain.getRecords).toHaveBeenCalledWith({ userId: 7 })
      expect(domain.listExercises).toHaveBeenCalledWith({ userId: 7 })

      // .get() ya lanza si no existe: no hace falta (ni tipa) .exists() encima
      wrapper.get('[data-testid="workout-card-99"]')
      expect(wrapper.text()).toContain('Sentadilla')
      // read-only: ni editar/borrar en la tarjeta ni ningún control del carril propio
      expect(wrapper.find('[data-testid="edit-workout-99"]').exists()).toBe(false)
      expect(wrapper.find('[data-testid="delete-workout-99"]').exists()).toBe(false)
      expect(wrapper.find('[data-testid="log-past-workout"]').exists()).toBe(false)
      expect(wrapper.find('[data-testid="pr-of-day-501"]').exists()).toBe(true)
    })

    it('gates the tab content on the fetch resolving (readiness), no partial render', async () => {
      let resolveWorkouts!: (value: domain.WorkoutOut[]) => void
      vi.mocked(domain.listWorkouts).mockImplementation((params) =>
        (params as { userId?: number })?.userId === 7
          ? new Promise((resolve) => { resolveWorkouts = resolve })
          : Promise.resolve([] as never),
      )

      const wrapper = mount(ScheduleSheet, {
        props: { date: '2026-08-05', scheduled: [], shared: sharedUsers },
        global: { plugins: [createI18nInstance()] },
      })
      await flushPromises()

      await wrapper.get('[data-testid="day-tab-7"]').trigger('click')
      await flushPromises()
      expect(wrapper.find('[data-testid="shared-day-workouts"]').exists()).toBe(false)

      resolveWorkouts([
        { id: 5, date: '2026-08-05', started_at: null, ended_at: null, routine_id: null, note: null, feeling: null, exercises: [], muscle_tag_ids: [] },
      ] as never)
      await flushPromises()

      expect(wrapper.find('[data-testid="shared-day-workouts"]').exists()).toBe(true)
    })

    it('flipping back to an already-loaded user tab does not refetch (cache per user per open)', async () => {
      const wrapper = mount(ScheduleSheet, {
        props: { date: '2026-08-05', scheduled: [], shared: sharedUsers },
        global: { plugins: [createI18nInstance()] },
      })
      await flushPromises()
      const callsAfterMount = vi.mocked(domain.listWorkouts).mock.calls.length

      await wrapper.get('[data-testid="day-tab-7"]').trigger('click')
      await flushPromises()
      expect(vi.mocked(domain.listWorkouts).mock.calls.length).toBe(callsAfterMount + 1)

      await wrapper.get('[data-testid="day-tab-self"]').trigger('click')
      await flushPromises()
      await wrapper.get('[data-testid="day-tab-7"]').trigger('click')
      await flushPromises()

      // el segundo flip a la pestaña 7 NO repite el fetch
      expect(vi.mocked(domain.listWorkouts).mock.calls.length).toBe(callsAfterMount + 1)
    })

    it('switching to a different day resets the active tab to "Tú" and clears the per-user cache (a fresh day refetches, not the stale cache)', async () => {
      // dos días con datos del mismo compartido, para poder comparar la
      // tira en AMBOS días sin depender del reloj real
      const twoDaysShared: SharedUserOut[] = [
        { user_id: 7, username: 'freyja', color: '#3b82f6', dates: ['2026-08-05', '2026-08-06'] },
      ]
      const wrapper = mount(ScheduleSheet, {
        props: { date: '2026-08-05', scheduled: [], shared: twoDaysShared },
        global: { plugins: [createI18nInstance()] },
      })
      await flushPromises()

      await wrapper.get('[data-testid="day-tab-7"]').trigger('click')
      await flushPromises()
      expect(wrapper.get('[data-testid="day-tab-self"]').attributes('aria-pressed')).toBe('false')

      await wrapper.setProps({ date: '2026-08-06' })
      await flushPromises()

      // el nuevo día vuelve a arrancar en 'Tú', no se queda en la pestaña 7
      expect(wrapper.get('[data-testid="day-tab-self"]').attributes('aria-pressed')).toBe('true')
      // el cambio de día ya dispara su propio reload de 'self' (loadDayInfo);
      // lo que importa aquí es lo que pasa DESDE este punto en adelante
      const callsAfterDayChange = vi.mocked(domain.listWorkouts).mock.calls.length

      await wrapper.get('[data-testid="day-tab-7"]').trigger('click')
      await flushPromises()

      // la cache del día anterior no vale para el día nuevo: vuelve a pedir datos
      expect(vi.mocked(domain.listWorkouts).mock.calls.length).toBe(callsAfterDayChange + 1)
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

describe('CalendarView heatmap refetch on mutation (v0.3.0 item 2)', () => {
  beforeEach(() => setActivePinia(createPinia()))
  afterEach(() => vi.useRealTimers())

  it('deleting a scheduled session from the day sheet refetches the heatmap, not just the month (bug: "Actividad del año no parece actualizarse")', async () => {
    vi.useFakeTimers({ now: new Date('2026-08-15T12:00:00Z'), toFake: ['Date'] })
    vi.mocked(domain.getHeatmap).mockClear()
    vi.mocked(domain.getMonth).mockClear()
    vi.mocked(domain.deleteSchedule).mockClear()

    const wrapper = mount(CalendarView, {
      global: { plugins: [createI18nInstance()] },
      attachTo: document.body,
    })
    await flushPromises()
    expect(domain.getHeatmap).toHaveBeenCalledTimes(1)
    expect(domain.getMonth).toHaveBeenCalledTimes(1)

    const dayCell = wrapper.get('[data-testid="day-cell-2026-08-01"]')
    await dayCell.trigger('click')
    await flushPromises()

    const deleteButton = document.querySelector('[data-testid="delete-session-1"]') as HTMLElement
    expect(deleteButton).not.toBeNull()
    deleteButton.click()
    await flushPromises()

    const confirmButtonEl = document.querySelector('[data-testid="confirm-delete"]') as HTMLElement
    expect(confirmButtonEl).not.toBeNull()
    confirmButtonEl.click()
    await flushPromises()

    expect(domain.deleteSchedule).toHaveBeenCalledWith(1)
    // el bug: solo se recargaba el mes, el heatmap se quedaba con los datos
    // con los que se montó la vista
    expect(domain.getHeatmap).toHaveBeenCalledTimes(2)
    expect(domain.getMonth).toHaveBeenCalledTimes(2)

    wrapper.unmount()
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

  // item 14 (v0.4.3, zurdi): modelo de scroll interno — la cabecera de mes
  // queda fija (shrink-0), TODO lo demás (grid/leyenda/heatmap) scrollea
  // dentro de un único contenedor propio, nunca contra <main>
  it('item 14: root is a bounded h-full flex-col chain, month-nav header is shrink-0, everything else scrolls in ONE flex-1 min-h-0 overflow-y-auto region', async () => {
    const wrapper = mount(CalendarView, {
      global: { plugins: [createI18nInstance()] },
    })
    await flushPromises()

    expect(wrapper.classes()).toEqual(expect.arrayContaining(['h-full', 'flex', 'flex-col']))

    const monthNavRow = wrapper.get('.flex.items-center.gap-2')
    expect(monthNavRow.classes()).toContain('shrink-0')

    const scrollRegion = wrapper.get('.flex-1.min-h-0.overflow-y-auto')
    // la región de scroll contiene el grid del mes Y el heatmap del año —
    // UNA sola región, no dos contenedores anidados
    expect(scrollRegion.findComponent({ name: 'MonthGrid' }).exists()).toBe(true)
    expect(scrollRegion.find('[data-testid="rune-legend-btn"]').exists()).toBe(true)
  })

  it('polish wave item 13: the rune-legend trigger is NOT in the month-navigation row anymore (only prev/next live there)', async () => {
    const wrapper = mount(CalendarView, {
      global: { plugins: [createI18nInstance()] },
    })
    await flushPromises()

    const infoButton = wrapper.get('[data-testid="rune-legend-btn"]')
    const monthNavRow = wrapper.get('.flex.items-center.gap-2')
    expect(monthNavRow.element.contains(infoButton.element)).toBe(false)
    // el nav row solo tiene los dos chevrons
    expect(monthNavRow.findAll('button').length).toBe(2)
  })

  it('polish wave item 13: places the rune-legend trigger between the month grid and "Actividad del año"', async () => {
    const wrapper = mount(CalendarView, {
      global: { plugins: [createI18nInstance()] },
    })
    await flushPromises()

    const monthGrid = wrapper.getComponent({ name: 'MonthGrid' })
    const infoButton = wrapper.get('[data-testid="rune-legend-btn"]')
    const heading = wrapper.get('h3')

    // orden en el DOM: rejilla del mes → botón de leyenda → "Actividad del año"
    const position = monthGrid.element.compareDocumentPosition(infoButton.element)
    expect(position & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    const headingPosition = infoButton.element.compareDocumentPosition(heading.element)
    expect(headingPosition & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('polish wave item 13: the rune-legend trigger is a small text button (ghost/subtle), not an icon circle', async () => {
    const wrapper = mount(CalendarView, {
      global: { plugins: [createI18nInstance()] },
    })
    await flushPromises()

    const infoButton = wrapper.get('[data-testid="rune-legend-btn"]')
    // item 7 (v0.4.2): el botón ahora lleva también el span-icono ⓘ, así que
    // el texto ya no es EXACTAMENTE la etiqueta — pero sigue siendo un botón
    // de texto (no un círculo), el aserto de forma sigue siendo el mismo
    expect(infoButton.text()).toContain('Leyenda de runas')
    expect(infoButton.classes()).not.toContain('rounded-full')
  })

  // item 7 (v0.4.2): "gana un pequeño icono ⓘ" junto al texto del trigger —
  // recupera el idiom de circulito-i bordeado que existía ANTES de la item 13
  // (ver git show 60bd285: el botón entero era ese círculo), pero ahora solo
  // como refuerzo visual DENTRO del botón de texto, no como el trigger entero
  it('item 7 (v0.4.2): the rune-legend trigger carries a small bordered-i info icon next to its text', async () => {
    const wrapper = mount(CalendarView, {
      global: { plugins: [createI18nInstance()] },
    })
    await flushPromises()

    const infoButton = wrapper.get('[data-testid="rune-legend-btn"]')
    const icon = infoButton.get('[data-testid="rune-legend-info-icon"]')
    expect(icon.text()).toBe('i')
    expect(icon.classes()).toContain('rounded-full')
    expect(icon.classes()).toContain('border')
    // decorativo: el texto visible del botón ya es su nombre accesible
    expect(icon.attributes('aria-hidden')).toBe('true')
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

    // BkSheet teletransporta con <Teleport to="body">: wrapper.find() no ve
    // ese contenido (VTU no lo resuelve de vuelta al árbol del wrapper), así
    // que la aserción va sobre el document real, como en el resto del fichero
    const sheet = document.querySelector('[role="dialog"]') as HTMLElement
    expect(sheet).not.toBeNull()
    expect(sheet.textContent).toContain('Pecho')
    expect(sheet.querySelector('svg')).not.toBeNull()
  })

  it('polish wave item 13: the legend sheet no longer shows the explanatory hint, just the rune+name list', async () => {
    wrapper = mount(CalendarView, {
      global: { plugins: [createI18nInstance()] },
      attachTo: document.body,
    })
    await flushPromises()

    const infoButton = document.querySelector('[data-testid="rune-legend-btn"]') as HTMLElement
    infoButton.click()
    await flushPromises()

    const sheet = document.querySelector('[role="dialog"]') as HTMLElement
    expect(sheet).not.toBeNull()
    expect(sheet.textContent).not.toContain('Cada runa marca el grupo muscular principal trabajado ese día.')
    expect(sheet.querySelectorAll('li').length).toBeGreaterThan(0)
  })
})

describe('CalendarView item 8: opens today\'s day sheet from a ?day= query', () => {
  beforeEach(() => setActivePinia(createPinia()))
  afterEach(() => vi.useRealTimers())

  it('mounting with a valid ?day= query opens the day sheet for that date and clears the query', async () => {
    currentRoute.query = { day: '2026-08-01' }

    // BkSheet teletransporta a document.body: wrapper.find() no ve ese
    // contenido, así que se comprueba sobre el document real, igual que el
    // resto del fichero (ver "CalendarView rune legend" arriba)
    const wrapper = mount(CalendarView, {
      global: { plugins: [createI18nInstance()] },
      attachTo: document.body,
    })
    await flushPromises()

    expect(document.querySelector('[role="dialog"]')).not.toBeNull()
    expect(replace).toHaveBeenCalledWith({ query: {} })

    wrapper.unmount()
  })

  it('ignores a junk day value: no sheet opens and the query is left untouched', async () => {
    currentRoute.query = { day: 'not-a-date' }

    const wrapper = mount(CalendarView, {
      global: { plugins: [createI18nInstance()] },
      attachTo: document.body,
    })
    await flushPromises()

    expect(document.querySelector('[role="dialog"]')).toBeNull()
    expect(replace).not.toHaveBeenCalled()

    wrapper.unmount()
  })

  it('reacts to the query changing after mount (not just on the initial mount)', async () => {
    const wrapper = mount(CalendarView, {
      global: { plugins: [createI18nInstance()] },
      attachTo: document.body,
    })
    await flushPromises()
    expect(document.querySelector('[role="dialog"]')).toBeNull()

    currentRoute.query = { day: '2026-08-02' }
    await flushPromises()

    expect(document.querySelector('[role="dialog"]')).not.toBeNull()
    expect(replace).toHaveBeenCalledWith({ query: {} })

    wrapper.unmount()
  })
})

// item 4 (v0.4.0, ROOT CAUSE del bug real de zurdi: "en el calendario no
// veo los dots de otro user al que le he compartido y me ha compartido").
// athleteThreading.spec.ts ya prueba que getMonth se LLAMA con el userId
// correcto, pero con un mock que siempre resuelve {scheduled:[],workouts:[]}
// — nunca comprueba que, dado un payload real con datos, el CalendarView
// completo (no solo MonthGrid montado a mano) los PINTA. La causa real
// terminó siendo que athlete.viewing no sobrevivía a una recarga (ver
// stores/athlete.ts), pero este test cierra el hueco de cobertura real que
// hizo falta abrir para descartar esta capa durante el diagnóstico.
describe('CalendarView athlete mode (item 4): renders dots from the target athlete\'s data', () => {
  beforeEach(() => setActivePinia(createPinia()))

  it('mounts already viewing an athlete and paints dots from the workouts/scheduled the API returns for them', async () => {
    vi.mocked(domain.getMonth).mockResolvedValueOnce({
      scheduled: [
        { id: 9, date: '2026-08-11', time: null, routine_id: null, status: 'planned', workout_id: null, note: null },
      ],
      workouts: [
        { id: 42, date: '2026-08-05', feeling: 4, muscle_group_ids: [] },
      ],
    })

    useAthleteStore().view({ id: 7, username: 'other', is_admin: false, locale: 'es', units: 'kg', timezone: 'UTC' })
    const wrapper = mount(CalendarView, { global: { plugins: [createI18nInstance()] } })
    await flushPromises()

    expect(domain.getMonth).toHaveBeenCalledWith(expect.any(Number), expect.any(Number), 7)
    const doneDot = wrapper.get('[data-testid="day-cell-2026-08-05"] [data-status="done"]')
    expect(doneDot.classes()).toContain('bg-[var(--bk-day-dot)]')
    const plannedDot = wrapper.get('[data-testid="day-cell-2026-08-11"] [data-status="planned"]')
    expect(plannedDot.classes()).toContain('border-[var(--bk-day-dot)]')
  })
})

// SHARED-DOTS OVERLAY (v0.4.1): la leyenda bajo la rejilla (BkUser por cada
// usuario compartido) solo cuando monthData.shared trae algo — nunca en modo
// atleta, donde el backend omite la clave entera del JSON (ver
// api/domain.ts::CalendarMonthOut).
describe('CalendarView shared legend (v0.4.1)', () => {
  beforeEach(() => setActivePinia(createPinia()))

  it('renders a BkUser dot per shared user, with their color and username, when shared is non-empty', async () => {
    vi.mocked(domain.getMonth).mockResolvedValueOnce({
      scheduled: [],
      workouts: [],
      shared: [
        { user_id: 7, username: 'freyja', color: '#3b82f6', dates: ['2026-08-05'] },
        { user_id: 9, username: 'loki', color: null, dates: [] },
      ],
    })

    const wrapper = mount(CalendarView, { global: { plugins: [createI18nInstance()] } })
    await flushPromises()

    const legend = wrapper.get('[data-testid="shared-legend"]')
    const users = legend.findAllComponents(BkUser)
    expect(users).toHaveLength(2)
    expect(users[0].props('user')).toEqual({ username: 'freyja', color: '#3b82f6' })
    expect(users[1].props('user')).toEqual({ username: 'loki', color: null })
  })

  // item 1a (v0.4.2): la etiqueta "Compartido contigo:" se quita — la fila
  // de dots (BkUser ya lleva color+nombre) queda sola, sin muletilla de texto
  it('item 1a: drops the "shared with you" label text, leaving only the BkUser dots', async () => {
    vi.mocked(domain.getMonth).mockResolvedValueOnce({
      scheduled: [],
      workouts: [],
      shared: [{ user_id: 7, username: 'freyja', color: '#3b82f6', dates: ['2026-08-05'] }],
    })

    const wrapper = mount(CalendarView, { global: { plugins: [createI18nInstance()] } })
    await flushPromises()

    const legend = wrapper.get('[data-testid="shared-legend"]')
    // el único texto de la leyenda es el username del BkUser, nada más
    expect(legend.text()).toBe('freyja')
  })

  it('does not render the legend when shared is an empty array (no one has shared with me)', async () => {
    vi.mocked(domain.getMonth).mockResolvedValueOnce({ scheduled: [], workouts: [], shared: [] })

    const wrapper = mount(CalendarView, { global: { plugins: [createI18nInstance()] } })
    await flushPromises()

    expect(wrapper.find('[data-testid="shared-legend"]').exists()).toBe(false)
  })

  it('does not render the legend when shared is absent (athlete mode: the field is omitted, not sent empty)', async () => {
    useAthleteStore().view({ id: 7, username: 'other', is_admin: false, locale: 'es', units: 'kg', timezone: 'UTC' })
    vi.mocked(domain.getMonth).mockResolvedValueOnce({ scheduled: [], workouts: [] })

    const wrapper = mount(CalendarView, { global: { plugins: [createI18nInstance()] } })
    await flushPromises()

    expect(wrapper.find('[data-testid="shared-legend"]').exists()).toBe(false)
  })
})

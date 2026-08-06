import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/api/domain', () => ({
  getStreak: vi.fn(async () => ({ weeks: 3 })),
  getMonth: vi.fn(async () => ({ scheduled: [
    { id: 1, date: '2026-08-06', time: '18:00', routine_id: 1, status: 'planned', workout_id: null, note: null },
    { id: 2, date: '2026-08-06', time: '10:00', routine_id: 2, status: 'done', workout_id: 5, note: null },
    { id: 3, date: '2026-08-06', time: null, routine_id: 3, status: 'skipped', workout_id: null, note: 'Too busy' },
  ], workouts: [] })),
  listWorkouts: vi.fn(async () => []),
  getRecords: vi.fn(async () => []),
  listExercises: vi.fn(async () => []),
  listMuscleGroups: vi.fn(async () => []),
}))
// push compartido (no un vi.fn() nuevo por llamada a useRouter): item 8
// necesita aserir con qué se llamó router.push desde TodaySessionCard
const push = vi.fn()
vi.mock('vue-router', () => ({ useRouter: () => ({ push }) }))

import type { ScheduledOut } from '@/api/domain'
import * as domain from '@/api/domain'
import { createI18nInstance } from '@/i18n'
import { useAthleteStore } from '@/stores/athlete'
import TodayView from '@/views/TodayView.vue'
import TodaySessionCard from '@/components/today/TodaySessionCard.vue'

describe('TodayView', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    // reduced-motion forzado: estos tests leen el valor FINAL nada más
    // flush-ear promesas, sin avanzar rAF — useAnimatedNumber (item 1) salta
    // directo al objetivo en este modo, igual que en producción
    vi.spyOn(window, 'matchMedia').mockReturnValue({ matches: true } as MediaQueryList)
  })
  afterEach(() => vi.restoreAllMocks())

  it('threads athlete user_id through every read', async () => {
    useAthleteStore().view({ id: 7, username: 'freyja', is_admin: false, locale: 'es', units: 'kg', timezone: 'UTC' })
    mount(TodayView, { global: { plugins: [createI18nInstance()] } })
    await flushPromises()
    expect(vi.mocked(domain.getStreak)).toHaveBeenCalledWith(7)
    expect(vi.mocked(domain.getRecords)).toHaveBeenCalledWith({ userId: 7 })
  })

  it('renders the streak in ember when alive', async () => {
    const wrapper = mount(TodayView, { global: { plugins: [createI18nInstance()] } })
    await flushPromises()
    expect(wrapper.find('[data-testid="streak-card"]').classes().join(' ')).toContain('text-ember')
    expect(wrapper.text()).toContain('3')
  })

  it('gates card mount on readiness: cards are absent while data is pending, present once it resolves', async () => {
    let resolveStreak: (value: { weeks: number }) => void = () => {}
    vi.mocked(domain.getStreak).mockImplementationOnce(
      () => new Promise((resolve) => { resolveStreak = resolve }),
    )

    const wrapper = mount(TodayView, { global: { plugins: [createI18nInstance()] } })
    await flushPromises()
    expect(wrapper.find('[data-testid="streak-card"]').exists()).toBe(false)

    resolveStreak({ weeks: 3 })
    await flushPromises()
    expect(wrapper.find('[data-testid="streak-card"]').exists()).toBe(true)
  })

  it('still shows the cards (ready) when a load fails, instead of leaving a blank view', async () => {
    vi.mocked(domain.getStreak).mockRejectedValueOnce(new Error('boom'))

    const wrapper = mount(TodayView, { global: { plugins: [createI18nInstance()] } })
    await flushPromises()

    expect(wrapper.find('[data-testid="streak-card"]').exists()).toBe(true)
  })
})

describe('TodaySessionCard status dots', () => {
  // reloj pineado: todaySessions filtra props.schedules por fecha === HOY, y
  // las fixtures de este bloque usan '2026-08-06' — sin pinear, estos tests
  // se vuelven fecha-dependientes del reloj real (ya han roto así antes)
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.useFakeTimers({ now: new Date('2026-08-06T12:00:00Z'), toFake: ['Date'] })
    push.mockClear()
  })
  afterEach(() => vi.useRealTimers())

  it('renders planned session with aurora border dot', async () => {
    const schedules: ScheduledOut[] = [
      { id: 1, date: '2026-08-06', time: '18:00', routine_id: 1, status: 'planned', workout_id: null, note: null },
    ]
    const wrapper = mount(TodaySessionCard, {
      props: { schedules },
      global: { plugins: [createI18nInstance()] },
    })
    const plannedDot = wrapper.find('[data-testid="session-planned"]').find('span')
    expect(plannedDot.classes()).toContain('border-2')
    expect(plannedDot.classes()).toContain('border-aurora')
  })

  it('renders done session with solid aurora dot', async () => {
    const schedules: ScheduledOut[] = [
      { id: 2, date: '2026-08-06', time: '10:00', routine_id: 2, status: 'done', workout_id: 5, note: null },
    ]
    const wrapper = mount(TodaySessionCard, {
      props: { schedules },
      global: { plugins: [createI18nInstance()] },
    })
    const doneDot = wrapper.find('[data-testid="session-done"]').find('span')
    expect(doneDot.classes()).toContain('bg-aurora')
    expect(doneDot.classes()).not.toContain('border-2')
  })

  it('renders skipped session with faint dot', async () => {
    const schedules: ScheduledOut[] = [
      { id: 3, date: '2026-08-06', time: null, routine_id: 3, status: 'skipped', workout_id: null, note: 'Too busy' },
    ]
    const wrapper = mount(TodaySessionCard, {
      props: { schedules },
      global: { plugins: [createI18nInstance()] },
    })
    const skippedDot = wrapper.find('[data-testid="session-skipped"]').find('span')
    expect(skippedDot.classes()).toContain('bg-ink-faint')
    expect(skippedDot.classes()).not.toContain('bg-aurora')
  })

  it('renders the session time without seconds', async () => {
    const schedules: ScheduledOut[] = [
      { id: 1, date: '2026-08-06', time: '18:00:00', routine_id: 1, status: 'planned', workout_id: null, note: null },
    ]
    const wrapper = mount(TodaySessionCard, {
      props: { schedules },
      global: { plugins: [createI18nInstance()] },
    })
    expect(wrapper.text()).toContain('18:00')
    expect(wrapper.text()).not.toContain('18:00:00')
  })

  it('polish wave item 9: omits the time line entirely when the session has no time (no em-dash placeholder)', async () => {
    const schedules: ScheduledOut[] = [
      { id: 3, date: '2026-08-06', time: null, routine_id: 3, status: 'skipped', workout_id: null, note: 'Too busy' },
    ]
    const wrapper = mount(TodaySessionCard, {
      props: { schedules },
      global: { plugins: [createI18nInstance()] },
    })
    expect(wrapper.text()).not.toContain('–')
    expect(wrapper.text()).not.toContain('—')
    expect(wrapper.text()).toContain('Too busy')
  })

  it('polish wave item 8: "Programar Sesión" pushes to the calendar with today\'s date as a query (so it auto-opens the day sheet)', async () => {
    const wrapper = mount(TodaySessionCard, {
      props: { schedules: [] },
      global: { plugins: [createI18nInstance()] },
    })
    await flushPromises()

    const scheduleBtn = wrapper.findAll('button').find((b) => b.text() === 'Programar Sesión')!
    expect(scheduleBtn).not.toBeUndefined()
    await scheduleBtn.trigger('click')

    expect(push).toHaveBeenCalledWith({ name: 'calendar', query: { day: '2026-08-06' } })
  })
})

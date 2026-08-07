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
  // item 4 (v0.4.2): Distribución muscular se mudó aquí desde ProgressView —
  // sin este mock, cada montaje de TodayView revienta la construcción del
  // Promise.all (getDistribution undefined) y ninguna card llega a pintarse
  getDistribution: vi.fn(async () => []),
}))
// push compartido (no un vi.fn() nuevo por llamada a useRouter): item 8
// necesita aserir con qué se llamó router.push desde TodaySessionCard
const push = vi.fn()
vi.mock('vue-router', () => ({ useRouter: () => ({ push }) }))

import type { ScheduledOut } from '@/api/domain'
import * as domain from '@/api/domain'
import { createI18nInstance } from '@/i18n'
import { useAthleteStore } from '@/stores/athlete'
import { core } from '@/tokens'
import TodayView from '@/views/TodayView.vue'
import TodaySessionCard from '@/components/today/TodaySessionCard.vue'
import DistributionBars from '@/components/today/DistributionBars.vue'
import { barWidth } from '@/components/today/distribution'

function withI18n() {
  return { global: { plugins: [createI18nInstance()] } }
}

// item 4 (v0.4.2): fixtures para DistributionBars, mudado aquí desde
// progress.spec.ts junto con el propio componente (ver DistributionBars.vue)
const distributionMuscleGroups = [
  { id: 1, slug: 'chest', name_es: 'Pecho', name_en: 'Chest', owner_id: null },
  { id: 2, slug: 'legs', name_es: 'Piernas', name_en: 'Legs', owner_id: null },
]
const distributionItems = [
  { muscle_group_id: 1, sets: 20 },
  { muscle_group_id: 2, sets: 40 },
]

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

  // item 14 (v0.4.3, zurdi): el modelo de scroll interno (antes solo
  // Perfil/Progresión) se generaliza a TODAS las vistas — Hoy scrollea
  // v0.5.0 (modelo de scroll único): la raíz FLUYE contra <main>
  it('v0.5.0: the root flows against <main> (no bounded-scroll classes)', async () => {
    const wrapper = mount(TodayView, { global: { plugins: [createI18nInstance()] } })
    await flushPromises()
    expect(wrapper.classes()).not.toContain('h-full')
    expect(wrapper.classes()).not.toContain('overflow-y-auto')
    expect(wrapper.classes()).toContain('bk-stagger')
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

  it('item 4 (v0.4.2): renders "Distribución muscular" directly below "Esta Semana", wired from getDistribution(4, athlete)', async () => {
    vi.mocked(domain.getDistribution).mockResolvedValueOnce(distributionItems as never)
    vi.mocked(domain.listMuscleGroups).mockResolvedValueOnce(distributionMuscleGroups as never)

    const wrapper = mount(TodayView, withI18n())
    await flushPromises()

    expect(domain.getDistribution).toHaveBeenCalledWith(4, undefined)

    // orden: el título de Distribución debe ser el h2 INMEDIATAMENTE
    // siguiente al de Esta Semana (item 4: "directamente debajo")
    const cardTitles = wrapper.findAll('h2').map((h) => h.text())
    const weekIdx = cardTitles.indexOf('Esta Semana')
    expect(weekIdx).toBeGreaterThanOrEqual(0)
    expect(cardTitles[weekIdx + 1]).toBe('Distribución muscular')

    const distribution = wrapper.findComponent({ name: 'DistributionBars' })
    expect(distribution.exists()).toBe(true)
    expect(distribution.props('items')).toEqual(distributionItems)
    expect(distribution.props('groups')).toEqual(distributionMuscleGroups)
    expect(wrapper.text()).toContain('Piernas') // fila real de DistributionBars
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

// item 4 (v0.4.2): barWidth y DistributionBars, mudados aquí desde
// progress.spec.ts junto con el propio componente/helper (relocation de
// components/progress/DistributionBars.vue + distribution.ts a
// components/today/) — contenido de los tests SIN CAMBIOS, solo la ruta de
// import y el archivo que los aloja
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
      props: { items: distributionItems as never, groups: distributionMuscleGroups as never },
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

  // STATS-CLARITY: la fuente (services/progress.py muscle_distribution +
  // routers/progress.py) confirma que el rango es fijo a 4 semanas
  // (TodayView llama getDistribution(4, ...)) y solo cuenta el grupo
  // PRIMARIO de cada ejercicio — el subtítulo debe decir exactamente eso, no
  // "total histórico"
  it('STATS-CLARITY: shows a subtitle stating the metric is effective sets by primary group over the last 4 weeks', () => {
    const wrapper = mount(DistributionBars, {
      props: { items: distributionItems as never, groups: distributionMuscleGroups as never },
      ...withI18n(),
    })
    const subtitle = wrapper.find('[data-testid="distribution-subtitle"]')
    expect(subtitle.exists()).toBe(true)
    // item 9: sin em-dash — coma en su lugar
    expect(subtitle.text()).toBe('Series efectivas por grupo principal, últimas 4 semanas')
  })

  it('STATS-CLARITY: the subtitle is shown even in the empty state, so the empty message reads in context', () => {
    const wrapper = mount(DistributionBars, { props: { items: [], groups: [] }, ...withI18n() })
    expect(wrapper.find('[data-testid="distribution-subtitle"]').exists()).toBe(true)
  })

  it('STATS-CLARITY: each per-bar number carries a title attr spelling out the unit (count + "series")', () => {
    const wrapper = mount(DistributionBars, {
      props: { items: distributionItems as never, groups: distributionMuscleGroups as never },
      ...withI18n(),
    })
    const rows = wrapper.findAll('[data-testid^="distribution-row-"]')
    // legs primero (40 sets), ver el test de orden de arriba
    expect(rows[0].find('[data-testid="distribution-sets"]').attributes('title')).toBe('40 series efectivas')
    expect(rows[1].find('[data-testid="distribution-sets"]').attributes('title')).toBe('20 series efectivas')
  })

  it('shows the empty state when there are no items', () => {
    const wrapper = mount(DistributionBars, { props: { items: [], groups: [] }, ...withI18n() })
    expect(wrapper.text()).toContain('Aún no hay datos de distribución')
  })

  it('item 14(c): a bar\'s rune icon uses the group\'s dedicated rune, overriding the slug-derived one', () => {
    const groups = [
      { id: 1, slug: 'chest', name_es: 'Pecho', name_en: 'Chest', owner_id: null, rune: 'ansuz' },
      { id: 2, slug: 'legs', name_es: 'Piernas', name_en: 'Legs', owner_id: null },
    ]
    const wrapper = mount(DistributionBars, {
      props: { items: distributionItems as never, groups: groups as never },
      ...withI18n(),
    })
    const runes = wrapper.findAllComponents({ name: 'BkRune' })
    // legs primero (40 sets, sin override -> cae al slug), pecho segundo (override)
    expect(runes[0].props('name')).toBe('legs')
    expect(runes[1].props('name')).toBe('ansuz')
  })

  it('item 6: bars carry the growth animation class with a per-bar --bar-dur proportional to the bar\'s magnitude (longer bar takes longer)', () => {
    const wrapper = mount(DistributionBars, {
      props: { items: distributionItems as never, groups: distributionMuscleGroups as never },
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
      props: { items: tinyItems as never, groups: distributionMuscleGroups as never },
      ...withI18n(),
    })
    const rows = wrapper.findAll('[data-testid^="distribution-row-"]')
    const tinyBar = rows[1].find('.bk-grow-x') // 1/1000 sets: la barra minúscula, ordenada al final (desc)
    const tinyDur = parseInt((tinyBar.element as HTMLElement).style.getPropertyValue('--bar-dur'), 10)
    expect(tinyDur).toBe(parseInt(core.dur[1], 10))
  })
})

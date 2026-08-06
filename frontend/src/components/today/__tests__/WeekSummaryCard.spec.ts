import { mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { createI18nInstance } from '@/i18n'
import type { MuscleGroupOut, WorkoutOut } from '@/api/domain'
import WeekSummaryCard from '../WeekSummaryCard.vue'

const chest: MuscleGroupOut = { id: 1, slug: 'chest', name_es: 'Pecho', name_en: 'Chest', owner_id: null }
const legs: MuscleGroupOut = { id: 2, slug: 'legs', name_es: 'Piernas', name_en: 'Legs', owner_id: null }

const workouts: WorkoutOut[] = [
  {
    id: 1,
    date: '2026-08-03',
    started_at: null,
    ended_at: null,
    routine_id: null,
    note: null,
    feeling: null,
    exercises: [],
    muscle_tag_ids: [1, 2],
  },
]

function build(locale: 'es' | 'en' = 'es') {
  return mount(WeekSummaryCard, {
    props: { workouts, exercises: [], muscleGroups: [chest, legs] },
    global: { plugins: [createI18nInstance(locale)] },
    attachTo: document.body, // BkTooltip mide el trigger real y su pointerdown-fuera compara contra el DOM
  })
}

describe('WeekSummaryCard — item 3: tooltip de nombre de grupo en las runas de la semana', () => {
  beforeEach(() => {
    // useAnimatedNumber lee matchMedia una sola vez al montar: en reduced-motion
    // salta directo al valor final, igual que el resto de specs de "today"
    vi.spyOn(window, 'matchMedia').mockReturnValue({ matches: true } as MediaQueryList)
  })
  afterEach(() => {
    vi.restoreAllMocks()
    document.body.innerHTML = ''
  })

  it('wraps each muscle-group rune in a tooltip trigger with the localized name as accessible label', () => {
    const wrapper = build('es')
    const buttons = wrapper.findAll('button[aria-label]')
    const labels = buttons.map((b) => b.attributes('aria-label')).sort()
    expect(labels).toEqual(['Pecho', 'Piernas'].sort())
  })

  it('tapping a rune shows a role=tooltip bubble with the group name (ES)', async () => {
    const wrapper = build('es')
    const chestButton = wrapper.findAll('button[aria-label]').find((b) => b.attributes('aria-label') === 'Pecho')!
    await chestButton.trigger('click')

    const bubble = document.querySelector('[role="tooltip"]')
    expect(bubble?.textContent?.trim()).toBe('Pecho')

    wrapper.unmount()
  })

  it('the tooltip text follows the viewer UI locale, not a fixed language (EN)', async () => {
    const wrapper = build('en')
    const legsButton = wrapper.findAll('button[aria-label]').find((b) => b.attributes('aria-label') === 'Legs')!
    await legsButton.trigger('click')

    const bubble = document.querySelector('[role="tooltip"]')
    expect(bubble?.textContent?.trim()).toBe('Legs')

    wrapper.unmount()
  })

  it('a second tap on the same rune dismisses its tooltip', async () => {
    const wrapper = build('es')
    const chestButton = wrapper.findAll('button[aria-label]').find((b) => b.attributes('aria-label') === 'Pecho')!
    await chestButton.trigger('click')
    expect(document.querySelector('[role="tooltip"]')).not.toBeNull()

    await chestButton.trigger('click')
    expect(document.querySelector('[role="tooltip"]')).toBeNull()

    wrapper.unmount()
  })
})

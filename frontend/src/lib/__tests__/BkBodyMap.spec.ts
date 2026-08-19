import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'

import { createI18nInstance } from '@/i18n'
import BkBodyMap from '../BkBodyMap.vue'

// v0.24.0 — mapa muscular: zonas encendidas por volumen relativo
const groups = [
  { id: 1, slug: 'chest', name_es: 'Pecho', name_en: 'Chest', owner_id: null },
  { id: 2, slug: 'legs', name_es: 'Piernas', name_en: 'Legs', owner_id: null },
  { id: 3, slug: 'back', name_es: 'Espalda', name_en: 'Back', owner_id: null },
]

function build(items: { muscle_group_id: number; sets: number }[]) {
  return mount(BkBodyMap, {
    props: { items: items as never, groups: groups as never },
    global: { plugins: [createI18nInstance()] },
  })
}

describe('BkBodyMap', () => {
  it('paints the busiest group at full intensity and a zero group at the faint baseline', () => {
    const wrapper = build([
      { muscle_group_id: 1, sets: 20 },
      { muscle_group_id: 2, sets: 10 },
    ])
    const chest = wrapper.get('[data-testid="body-map-chest"]')
    const legs = wrapper.get('[data-testid="body-map-legs"]')
    const back = wrapper.get('[data-testid="body-map-back"]')
    const opacity = (el: typeof chest) => Number((el.element as SVGElement).style.fillOpacity)
    expect(opacity(chest)).toBeCloseTo(0.8, 5)
    expect(opacity(legs)).toBeCloseTo(0.18 + 0.31, 5)
    // sin series: baseline tenue, el cuerpo se sigue leyendo
    expect(opacity(back)).toBeCloseTo(0.06, 5)
  })

  it('labels each region with the group name and its set count', () => {
    const wrapper = build([{ muscle_group_id: 1, sets: 12 }])
    expect(wrapper.get('[data-testid="body-map-chest"] title').text()).toBe('Pecho · 12 series')
  })

  it('renders front and back figures (legs appear on both) inside a single svg', () => {
    const wrapper = build([])
    expect(wrapper.findAll('[data-testid="body-map-legs"]').length).toBe(4)
    expect(wrapper.findAll('svg').length).toBe(1)
  })
})

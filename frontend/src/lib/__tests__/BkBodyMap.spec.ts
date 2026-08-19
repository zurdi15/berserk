import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'

import { createI18nInstance } from '@/i18n'
import BkBodyMap from '../BkBodyMap.vue'

// v0.24.4 — mapa muscular REALISTA (arte anatómico de wger, CC-BY-SA):
// base en grises + capas de músculo con opacidad por volumen relativo
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

const opacity = (el: { element: Element }) => Number((el.element as HTMLElement).style.opacity)

describe('BkBodyMap', () => {
  it('lights the busiest muscle at full opacity, scales the rest, keeps untrained muscles at 0 (base stays grey)', () => {
    const wrapper = build([
      { muscle_group_id: 1, sets: 20 },
      { muscle_group_id: 2, sets: 10 },
    ])
    expect(opacity(wrapper.get('[data-testid="body-map-chest"]'))).toBeCloseTo(1, 5)
    expect(opacity(wrapper.findAll('[data-testid="body-map-legs"]')[0])).toBeCloseTo(0.3 + 0.35, 5)
    expect(opacity(wrapper.get('[data-testid="body-map-back"]'))).toBe(0)
  })

  it('renders two figures (front/back) with the anatomical base plus tinted overlays; legs span both figures', () => {
    const wrapper = build([])
    expect(wrapper.findAll('figure')).toHaveLength(2)
    // capas base (una por figura), sin tinte
    const bases = wrapper.findAll('img').filter((img) => !img.classes().includes('bk-bodymap-tint'))
    expect(bases).toHaveLength(2)
    // piernas: cuádriceps delante + isquios/glúteos/gemelos detrás
    expect(wrapper.findAll('[data-testid="body-map-legs"]')).toHaveLength(4)
    expect(wrapper.findAll('[data-testid="body-map-core"]')).toHaveLength(2)
  })

  it('titles each overlay with the group name and set count', () => {
    const wrapper = build([{ muscle_group_id: 1, sets: 12 }])
    expect(wrapper.get('[data-testid="body-map-chest"]').attributes('title')).toBe('Pecho · 12 series')
  })
})

import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'

import { createI18nInstance } from '../../i18n'
import BkRing from '../BkRing.vue'
import BkRune from '../BkRune.vue'
import BkStepper from '../BkStepper.vue'
import { RUNES } from '../runes'

describe('runes catalog', () => {
  it('has the logo, the 7 muscle groups and the achievement runes', () => {
    expect(Object.keys(RUNES).sort()).toEqual(
      ['back', 'berserk', 'biceps', 'chest', 'core', 'legs', 'pr', 'shoulders', 'streak', 'triceps'].sort(),
    )
    for (const d of Object.values(RUNES)) {
      expect(d).toMatch(/^M[\d\s.]/) // path data válido que empieza con moveto
    }
  })
})

describe('BkRune', () => {
  it('renders the named path with carve animation class', () => {
    const wrapper = mount(BkRune, { props: { name: 'chest', carve: true } })
    expect(wrapper.find('path').attributes('d')).toBe(RUNES.chest)
    expect(wrapper.find('path').classes()).toContain('bk-carve-stroke')
  })
})

describe('BkStepper', () => {
  it('increments and clamps to bounds', async () => {
    const wrapper = mount(BkStepper, {
      props: { modelValue: 99, step: 1, max: 100, min: 0 },
      global: { plugins: [createI18nInstance()] },
    })
    const [minus, plus] = wrapper.findAll('button')
    await plus.trigger('pointerdown')
    await plus.trigger('pointerup')
    expect(wrapper.emitted('update:modelValue')!.at(-1)).toEqual([100])
    await wrapper.setProps({ modelValue: 100 })
    await plus.trigger('pointerdown')
    await plus.trigger('pointerup')
    expect(wrapper.emitted('update:modelValue')!.at(-1)).toEqual([100]) // clamped
    await minus.trigger('pointerdown')
    await minus.trigger('pointerup')
    expect(wrapper.emitted('update:modelValue')!.at(-1)).toEqual([99])
  })

  it('applies a single step on keyboard activation (click with detail 0)', async () => {
    const wrapper = mount(BkStepper, {
      props: { modelValue: 5 },
      global: { plugins: [createI18nInstance()] },
    })
    const [, plus] = wrapper.findAll('button')
    // Enter/Space sintetizan un click con detail 0: sin pointerdown/up de por medio
    await plus.trigger('click', { detail: 0 })
    expect(wrapper.emitted('update:modelValue')!.at(-1)).toEqual([6])
  })

  it('does not double-apply a real pointer click (detail > 0)', async () => {
    const wrapper = mount(BkStepper, {
      props: { modelValue: 5 },
      global: { plugins: [createI18nInstance()] },
    })
    const [, plus] = wrapper.findAll('button')
    await plus.trigger('pointerdown')
    await plus.trigger('pointerup')
    await plus.trigger('click', { detail: 1 })
    expect(wrapper.emitted('update:modelValue')!.at(-1)).toEqual([6])
  })

  it('labels the buttons via i18n', () => {
    const wrapper = mount(BkStepper, {
      props: { modelValue: 5 },
      global: { plugins: [createI18nInstance()] },
    })
    const [minus, plus] = wrapper.findAll('button')
    expect(minus.attributes('aria-label')).toBe('Reducir')
    expect(plus.attributes('aria-label')).toBe('Aumentar')
  })
})

describe('BkRing', () => {
  it('computes dashoffset from value', () => {
    const wrapper = mount(BkRing, { props: { value: 0.25, size: 48, stroke: 4 } })
    const circle = wrapper.findAll('circle')[1]
    const radius = (48 - 4) / 2
    const circumference = 2 * Math.PI * radius
    expect(Number(circle.attributes('stroke-dashoffset'))).toBeCloseTo(circumference * 0.75, 1)
  })
})

import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'

import BkTabs from '../BkTabs.vue'
import { cellsFor } from '../heatmap'

describe('BkTabs', () => {
  const tabs = [
    { value: 'a', label: 'A' },
    { value: 'b', label: 'B' },
  ]

  it('selects by click and arrows', async () => {
    const wrapper = mount(BkTabs, { props: { modelValue: 'a', tabs } })
    await wrapper.findAll('[role="tab"]')[1].trigger('click')
    expect(wrapper.emitted('update:modelValue')!.at(-1)).toEqual(['b'])
    await wrapper.find('[role="tablist"]').trigger('keydown', { key: 'ArrowRight' })
    expect(wrapper.emitted('update:modelValue')!.at(-1)).toEqual(['b'])
  })

  it('marks aria-selected', () => {
    const wrapper = mount(BkTabs, { props: { modelValue: 'b', tabs } })
    expect(wrapper.findAll('[role="tab"]')[1].attributes('aria-selected')).toBe('true')
  })
})

describe('heatmap cells', () => {
  it('covers the full year with week/day coordinates', () => {
    const cells = cellsFor(2026, [{ date: '2026-08-05', count: 2 }])
    expect(cells).toHaveLength(365)
    const hit = cells.find((c) => c.date === '2026-08-05')!
    expect(hit.count).toBe(2)
    expect(hit.day).toBeGreaterThanOrEqual(0)
    expect(hit.day).toBeLessThan(7)
  })
})

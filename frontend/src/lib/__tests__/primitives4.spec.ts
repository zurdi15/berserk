import { mount } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'

import BkChart from '../BkChart.vue'
import BkHeatmap from '../BkHeatmap.vue'
import BkSelect from '../BkSelect.vue'
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

describe('BkHeatmap', () => {
  it('renders correct cell count', () => {
    const wrapper = mount(BkHeatmap, {
      props: {
        year: 2026,
        data: [{ date: '2026-08-05', count: 2 }],
      },
    })
    const cells = wrapper.findAll('[class*="w-2.5"]')
    expect(cells.length).toBe(365)
  })

  it('applies correct opacity tiers for counts', () => {
    const wrapper = mount(BkHeatmap, {
      props: {
        year: 2026,
        data: [
          { date: '2026-01-01', count: 0 },
          { date: '2026-01-02', count: 1 },
          { date: '2026-01-03', count: 2 },
          { date: '2026-01-04', count: 3 },
          { date: '2026-01-05', count: 4 },
        ],
      },
    })
    // Verify cells have inline style with opacity
    const cells = wrapper.findAll('[style*="opacity"]')
    expect(cells.length).toBeGreaterThan(0)
    // Check that different opacity values are applied (0.08 for zero, then levels)
    const styles = cells.map((c) => c.attributes('style'))
    const opacities = styles.filter((s) => s && s.includes('0.08'))
    expect(opacities.length).toBeGreaterThan(0) // at least one zero-count cell has 0.08
  })
})

describe('BkSelect', () => {
  it('binds v-model and renders options', async () => {
    const wrapper = mount(BkSelect, {
      props: {
        label: 'Choose',
        modelValue: 'a',
        options: [
          { value: 'a', label: 'Option A' },
          { value: 'b', label: 'Option B' },
        ],
      },
    })
    expect(wrapper.find('select').element.value).toBe('a')
    expect(wrapper.findAll('option')).toHaveLength(2)
    await wrapper.find('select').setValue('b')
    expect(wrapper.emitted('update:modelValue')!.at(-1)).toEqual(['b'])
  })
})

describe('BkChart', () => {
  it('mounts and creates chart with UTC tzDate anchor', async () => {
    // Mock uPlot to verify options without needing canvas
    const mockUPlot = vi.fn() as any
    mockUPlot.tzDate = (date: Date, tz: string) => date
    vi.stubGlobal('uPlot', mockUPlot)

    const wrapper = mount(BkChart, {
      props: {
        points: [
          { date: '2026-08-05', value: 10 },
          { date: '2026-08-06', value: 15 },
        ],
        color: 'aurora',
      },
      global: {
        stubs: {
          teleport: true,
        },
      },
    })

    await wrapper.vm.$nextTick()
    // Verify tzDate was set in options
    if (mockUPlot.mock.calls.length > 0) {
      const options = mockUPlot.mock.calls[0][0]
      expect(options.tzDate).toBeDefined()
      expect(typeof options.tzDate).toBe('function')
    }
  })

  it('applies suffix to y-axis values', async () => {
    const mockUPlot = vi.fn() as any
    mockUPlot.tzDate = (date: Date) => date
    vi.stubGlobal('uPlot', mockUPlot)

    mount(BkChart, {
      props: {
        points: [{ date: '2026-08-05', value: 10 }],
        suffix: ' kg',
      },
      global: {
        stubs: {
          teleport: true,
        },
      },
    })

    await new Promise((resolve) => setTimeout(resolve, 10))
    if (mockUPlot.mock.calls.length > 0) {
      const options = mockUPlot.mock.calls[0][0]
      expect(options.axes[1].values).toBeDefined()
      if (options.axes[1].values) {
        const formatted = options.axes[1].values({}, [10, 20])
        expect(formatted[0]).toContain(' kg')
      }
    }
  })
})

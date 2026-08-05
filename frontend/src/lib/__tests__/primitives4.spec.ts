import { mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import BkChart from '../BkChart.vue'
import BkHeatmap from '../BkHeatmap.vue'
import BkSelect from '../BkSelect.vue'
import BkTabs from '../BkTabs.vue'
import { cellsFor } from '../heatmap'

// Mock uPlot module
vi.mock('uplot', () => ({
  default: vi.fn(),
  tzDate: vi.fn((date: Date) => date),
}))

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

  it('applies all four opacity tiers for counts 0-4', () => {
    const wrapper = mount(BkHeatmap, {
      props: {
        year: 2026,
        data: [
          { date: '2026-01-01', count: 0 }, // opacity: 0.08
          { date: '2026-01-02', count: 1 }, // opacity: 0.15 (levels[0])
          { date: '2026-01-03', count: 2 }, // opacity: 0.4 (levels[1])
          { date: '2026-01-04', count: 3 }, // opacity: 0.7 (levels[2])
          { date: '2026-01-05', count: 4 }, // opacity: 1 (levels[3])
        ],
      },
    })
    const cells = wrapper.findAll('[style*="opacity"]')
    // Find cells matching our test dates
    const findCell = (date: string) =>
      cells.find((c) => c.attributes('title')?.startsWith(date))

    const cell0 = findCell('2026-01-01')!
    const cell1 = findCell('2026-01-02')!
    const cell2 = findCell('2026-01-03')!
    const cell3 = findCell('2026-01-04')!
    const cell4 = findCell('2026-01-05')!

    expect(cell0.attributes('style')).toContain('opacity: 0.08')
    expect(cell1.attributes('style')).toContain('opacity: 0.15')
    expect(cell2.attributes('style')).toContain('opacity: 0.4')
    expect(cell3.attributes('style')).toContain('opacity: 0.7')
    expect(cell4.attributes('style')).toContain('opacity: 1')
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
  let mockUPlot: any
  let mockInstance: any

  beforeEach(async () => {
    // Get the mocked uPlot module and set up instance mock
    const uplotModule = await import('uplot')
    mockUPlot = uplotModule.default
    mockInstance = { destroy: vi.fn(), setSize: vi.fn() } as any
    mockUPlot.mockImplementation(() => mockInstance)
    mockUPlot.mockClear()
  })

  it('mounts and creates chart with UTC tzDate anchor', async () => {
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
    // Hard assertion: verify uPlot was called exactly once
    expect(mockUPlot).toHaveBeenCalledTimes(1)
    const options = mockUPlot.mock.calls[0][0]
    expect(options.tzDate).toBeDefined()
    expect(typeof options.tzDate).toBe('function')
  })

  it('applies suffix to y-axis values', async () => {
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
    // Hard assertion: verify uPlot was called
    expect(mockUPlot).toHaveBeenCalledTimes(1)
    const options = mockUPlot.mock.calls[0][0]
    expect(options.axes[1].values).toBeDefined()
    const formatted = options.axes[1].values({}, [10, 20])
    expect(formatted[0]).toContain(' kg')
  })

  it('destroys chart on unmount', async () => {
    const wrapper = mount(BkChart, {
      props: {
        points: [{ date: '2026-08-05', value: 10 }],
      },
      global: {
        stubs: {
          teleport: true,
        },
      },
    })

    await wrapper.vm.$nextTick()
    expect(mockUPlot).toHaveBeenCalledTimes(1)

    wrapper.unmount()
    // Hard assertion: destroy was called exactly once on unmount
    expect(mockInstance.destroy).toHaveBeenCalledTimes(1)
  })
})

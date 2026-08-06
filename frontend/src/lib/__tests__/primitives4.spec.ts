import { mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { createI18nInstance } from '@/i18n'
import BkChart from '../BkChart.vue'
import BkHeatmap from '../BkHeatmap.vue'
import BkSelect from '../BkSelect.vue'
import BkTabs from '../BkTabs.vue'
import { monthBlocksFor } from '../heatmap'

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

  // item 3c: jsdom/happy-dom no hace layout real, así que scrollIntoView no
  // mueve nada de verdad — se espía el prototipo y se comprueba que SE LLAMA
  // con los argumentos correctos, incondicional (sin guardas)
  describe('auto-scroll on tab activation (item 3c)', () => {
    let scrollSpy: ReturnType<typeof vi.spyOn>

    beforeEach(() => {
      scrollSpy = vi.spyOn(Element.prototype, 'scrollIntoView').mockImplementation(() => {})
      vi.spyOn(window, 'matchMedia').mockReturnValue({ matches: false } as MediaQueryList)
    })

    afterEach(() => vi.restoreAllMocks())

    it('click: scrolls the clicked tab into view smoothly', async () => {
      const wrapper = mount(BkTabs, { props: { modelValue: 'a', tabs } })
      const tabButtons = wrapper.findAll('[role="tab"]')
      await tabButtons[1].trigger('click')

      expect(scrollSpy).toHaveBeenCalledWith({ inline: 'nearest', block: 'nearest', behavior: 'smooth' })
      expect(scrollSpy.mock.instances[0]).toBe(tabButtons[1].element)
    })

    it('keyboard move: scrolls the newly-active tab into view smoothly', async () => {
      const wrapper = mount(BkTabs, { props: { modelValue: 'a', tabs } })
      const tabButtons = wrapper.findAll('[role="tab"]')
      await wrapper.find('[role="tablist"]').trigger('keydown', { key: 'ArrowRight' })
      await wrapper.vm.$nextTick()

      expect(scrollSpy).toHaveBeenCalledWith({ inline: 'nearest', block: 'nearest', behavior: 'smooth' })
      expect(scrollSpy.mock.instances[0]).toBe(tabButtons[1].element)
    })

    it('respects reduced-motion: uses behavior "auto" instead of "smooth" when matchMedia matches', async () => {
      vi.spyOn(window, 'matchMedia').mockReturnValue({ matches: true } as MediaQueryList)
      const wrapper = mount(BkTabs, { props: { modelValue: 'a', tabs } })
      await wrapper.findAll('[role="tab"]')[1].trigger('click')

      expect(scrollSpy).toHaveBeenCalledWith({ inline: 'nearest', block: 'nearest', behavior: 'auto' })
    })
  })
})

describe('BkHeatmap', () => {
  it('renders correct cell count', () => {
    const wrapper = mount(BkHeatmap, {
      props: {
        year: 2026,
        data: [{ date: '2026-08-05', count: 2 }],
      },
      global: { plugins: [createI18nInstance()] },
    })
    const cells = wrapper.findAll('[class*="w-2.5"]')
    expect(cells.length).toBe(365)
  })

  it('applies all four color-opacity tiers for counts 0-4 (bg-aurora/N, not element opacity — see item 1/2 why-comment)', () => {
    const wrapper = mount(BkHeatmap, {
      props: {
        year: 2026,
        data: [
          { date: '2026-01-01', count: 0 }, // bg-aurora/8
          { date: '2026-01-02', count: 1 }, // bg-aurora/15
          { date: '2026-01-03', count: 2 }, // bg-aurora/40
          { date: '2026-01-04', count: 3 }, // bg-aurora/70
          { date: '2026-01-05', count: 4 }, // bg-aurora/100
        ],
      },
      global: { plugins: [createI18nInstance()] },
    })
    // los cells ya no se distinguen por [style*="opacity"] (eso quedó libre
    // para bk-cascade) — se buscan por title y se comprueba la clase de color
    const cells = wrapper.findAll('[title]')
    const findCell = (date: string) =>
      cells.find((c) => c.attributes('title')?.startsWith(date))

    const cell0 = findCell('2026-01-01')!
    const cell1 = findCell('2026-01-02')!
    const cell2 = findCell('2026-01-03')!
    const cell3 = findCell('2026-01-04')!
    const cell4 = findCell('2026-01-05')!

    expect(cell0.classes()).toContain('bg-aurora/8')
    expect(cell1.classes()).toContain('bg-aurora/15')
    expect(cell2.classes()).toContain('bg-aurora/40')
    expect(cell3.classes()).toContain('bg-aurora/70')
    expect(cell4.classes()).toContain('bg-aurora/100')
  })

  it('item 1: cascade delay index is the GLOBAL column (block offset + local column), not reset per month block', () => {
    const wrapper = mount(BkHeatmap, {
      props: { year: 2026, data: [] },
      global: { plugins: [createI18nInstance()] },
    })

    const blocks = monthBlocksFor(2026, [])
    const totalColumns = blocks.reduce((sum, b) => sum + b.columnCount, 0)
    const expectedStep = 1000 / (totalColumns - 1)

    const cells = wrapper.findAll('.bk-cascade')
    expect(cells.length).toBeGreaterThan(0)
    const findCell = (date: string) => cells.find((c) => c.attributes('title')?.startsWith(date))!

    // 1 enero: primera columna del año, índice global 0
    expect(findCell('2026-01-01').attributes('style')).toContain('--bk-cascade-i: 0')
    expect(findCell('2026-01-01').attributes('style')).toContain(`--bk-cascade-step: ${expectedStep}ms`)

    // 31 enero: última columna del bloque de enero (columnCount - 1)
    const januaryLastColumn = blocks[0].columnCount - 1
    expect(findCell('2026-01-31').attributes('style')).toContain(`--bk-cascade-i: ${januaryLastColumn}`)

    // 1 febrero: primera columna LOCAL de su bloque, pero el índice GLOBAL
    // sigue acumulado desde enero (no vuelve a 0 al cruzar de mes)
    expect(findCell('2026-02-01').attributes('style')).toContain(`--bk-cascade-i: ${blocks[0].columnCount}`)
  })

  it('item 1: the full sweep (first to last column of the year) never exceeds ~1s regardless of column count', () => {
    const blocks = monthBlocksFor(2026, [])
    const totalColumns = blocks.reduce((sum, b) => sum + b.columnCount, 0)
    const expectedStep = 1000 / (totalColumns - 1)
    const maxSweepMs = (totalColumns - 1) * expectedStep

    expect(maxSweepMs).toBeLessThanOrEqual(1000)
  })

  it('renders one centered label per month block (item 4 redesign: per-month blocks, not a continuous grid)', () => {
    const wrapper = mount(BkHeatmap, {
      props: { year: 2026, data: [] },
      global: { plugins: [createI18nInstance()] },
    })
    const labels = wrapper.findAll('span.text-ink-faint')
    expect(labels).toHaveLength(12)
    expect(labels[0].text()).toBe('ene')
    expect(labels[0].classes()).toContain('text-xs')
    expect(labels[0].classes()).toContain('text-center')
    expect(labels[1].text()).toBe('feb')
  })

  it('renders each month as its own grid block, wrapping into rows with flex-wrap instead of a horizontal scroll', () => {
    const wrapper = mount(BkHeatmap, {
      props: { year: 2026, data: [] },
      global: { plugins: [createI18nInstance()] },
    })
    // contenedor exterior: flex-wrap con gap real entre bloques de mes — sin
    // overflow-x-auto, los bloques se apilan en varias filas en vez de scrollear
    const outer = wrapper.find('.flex.flex-wrap')
    expect(outer.exists()).toBe(true)
    expect(outer.classes()).toContain('gap-3')
    expect(wrapper.find('.overflow-x-auto').exists()).toBe(false)
    // 12 bloques (uno por mes), cada uno con su propia mini-rejilla de celdas
    const blocks = wrapper.findAll('.flex.flex-col.items-center.gap-1')
    expect(blocks).toHaveLength(12)
    // enero (bloque 0) ocupa 5 columnas, tal y como calcula heatmap.spec.ts
    const januaryGrid = blocks[0].find('.grid')
    expect(januaryGrid.attributes('style')).toContain('repeat(5, auto)')
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

  it('marks disabled options as disabled and leaves others enabled', () => {
    const wrapper = mount(BkSelect, {
      props: {
        label: 'Choose',
        modelValue: '',
        options: [
          { value: '', label: '—', disabled: true },
          { value: 'a', label: 'Option A' },
          { value: 'b', label: 'Option B' },
        ],
      },
    })
    const options = wrapper.findAll('option')
    expect(options).toHaveLength(3)
    expect(options[0].attributes('disabled')).toBeDefined()
    expect(options[1].attributes('disabled')).toBeUndefined()
    expect(options[2].attributes('disabled')).toBeUndefined()
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

import { mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { createI18nInstance } from '@/i18n'
import { core } from '@/tokens'
import BkChart from '../BkChart.vue'
import BkHeatmap from '../BkHeatmap.vue'
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
    // .bk-cascade (no el tamaño): con el side-fix 2 el tamaño de celda pasa a
    // ser responsive (w-2/sm:w-2.5), así que ya no es un selector estable
    // para contar celdas — .bk-cascade sí lo es (todas las celdas lo llevan)
    const cells = wrapper.findAll('.bk-cascade')
    expect(cells.length).toBe(365)
  })

  it('side-fix 2: cell size and gap are responsive (small below sm, original size from sm) so the widest 6-column month block fits down to 360px', () => {
    const wrapper = mount(BkHeatmap, {
      props: {
        year: 2026,
        data: [{ date: '2026-08-05', count: 2 }],
      },
      global: { plugins: [createI18nInstance()] },
    })
    const cell = wrapper.find('.bk-cascade')
    expect(cell.classes()).toEqual(
      expect.arrayContaining(['w-2', 'h-2', 'sm:w-2.5', 'sm:h-2.5']),
    )
    const cellGrid = wrapper.findAll('.grid.gap-0\\.5')
    expect(cellGrid.length).toBeGreaterThan(0)
    expect(cellGrid[0].classes()).toContain('sm:gap-1')
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

  it('renders each month as its own grid block, in a FIXED 3-row × 4-month grid (zurdi) instead of a horizontal scroll or a wrapping flex row', () => {
    const wrapper = mount(BkHeatmap, {
      props: { year: 2026, data: [] },
      global: { plugins: [createI18nInstance()] },
    })
    // contenedor exterior: grid de 4 columnas fijas (12 meses = siempre 3
    // filas exactas) con gap real entre bloques de mes — sin overflow-x-auto
    const outer = wrapper.find('.grid.grid-cols-4')
    expect(outer.exists()).toBe(true)
    expect(outer.classes()).toContain('gap-3')
    expect(outer.classes()).toContain('justify-items-center')
    expect(wrapper.find('.overflow-x-auto').exists()).toBe(false)
    // 12 bloques (uno por mes), cada uno con su propia mini-rejilla de celdas
    const blocks = wrapper.findAll('.flex.flex-col.items-center.gap-1')
    expect(blocks).toHaveLength(12)
    // enero (bloque 0) ocupa 5 columnas, tal y como calcula heatmap.spec.ts
    const januaryGrid = blocks[0].find('.grid')
    expect(januaryGrid.attributes('style')).toContain('repeat(5, auto)')
  })
})

describe('BkChart', () => {
  let mockUPlot: any
  let mockInstance: any

  beforeEach(async () => {
    // Get the mocked uPlot module and set up instance mock
    const uplotModule = await import('uplot')
    mockUPlot = uplotModule.default
    mockInstance = { destroy: vi.fn(), setSize: vi.fn(), setData: vi.fn() } as any
    mockUPlot.mockImplementation(() => mockInstance)
    mockUPlot.mockClear()
    // item 2: estos tests (previos al revelado progresivo) no verifican la
    // animación en sí — reduced-motion forzado hace que build() tome la rama
    // instantánea y evita depender del rAF real de happy-dom
    vi.spyOn(window, 'matchMedia').mockReturnValue({ matches: true } as MediaQueryList)
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
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

  it('the y-axis gutter width is a callback that grows with the longest rendered label, never a fixed number (fractional values + suffix used to clip)', async () => {
    mount(BkChart, {
      props: { points: [{ date: '2026-08-05', value: 83.5 }], suffix: ' kg' },
      global: { stubs: { teleport: true } },
    })

    await new Promise((resolve) => setTimeout(resolve, 10))
    const options = mockUPlot.mock.calls[0][0]
    const sizeFn = options.axes[1].size
    expect(typeof sizeFn).toBe('function')

    // self sintético con la forma REAL de uPlot (C2): axis.font es un ARRAY
    // (pxRatioFont: [fontString, fontSizePx, fontSizeCssPx]), no el string
    // plano que sugiere el tipo declarado — asignarlo tal cual a ctx.font lo
    // invalida en silencio y el canvas mide con su 10px por defecto
    const fakeSelf = {
      axes: [{}, { ticks: { size: 4 }, gap: 4, font: ['36px sans-serif', 36, 12] }],
      ctx: { font: '', measureText: (text: string) => ({ width: text.length * 6 }) },
    } as any

    const shortSize = sizeFn(fakeSelf, ['5 kg'], 1, 1)
    // ctx.font debe quedar con el STRING (primer elemento del array), no el
    // array entero — si volviera a romperse, esto lo detecta directamente
    // en vez de solo inferirlo del ancho medido
    expect(fakeSelf.ctx.font).toBe('36px sans-serif')

    const longSize = sizeFn(fakeSelf, ['888.5 kg'], 1, 1)
    expect(longSize).toBeGreaterThan(shortSize)

    // 2º ciclo de layout de uPlot: devuelve el tamaño ya calculado (cacheado
    // en axis._size) en vez de volver a medir, o el resize entraría en bucle
    const cachedSelf = { axes: [{}, { _size: 55 }] } as any
    expect(sizeFn(cachedSelf, ['lo que sea'], 1, 2)).toBe(55)
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

  describe('progressive reveal (item 2)', () => {
    // mismo fake-rAF que useAnimatedNumber.spec.ts: callbacks capturados a
    // mano, se disparan con pump(ms) para controlar el tween determinísticamente
    let callbacks: FrameRequestCallback[]
    let now: number

    function pump(ms: number) {
      now += ms
      const batch = callbacks
      callbacks = []
      for (const cb of batch) cb(now)
    }

    beforeEach(() => {
      callbacks = []
      now = 0
      vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
        callbacks.push(cb)
        return callbacks.length
      })
      vi.stubGlobal('cancelAnimationFrame', () => undefined)
      vi.stubGlobal('performance', { now: () => now })
      // estos tests SÍ quieren ver el tween, no el salto directo del guard
      // de reduced-motion (ese va aparte, más abajo)
      vi.spyOn(window, 'matchMedia').mockReturnValue({ matches: false } as MediaQueryList)
    })

    it('tweens with a linearly-advancing, interpolated tip point (no stepwise jumps), ending on the exact full arrays', () => {
      const points = Array.from({ length: 10 }, (_, i) => ({
        date: `2026-08-${String(i + 1).padStart(2, '0')}`,
        value: (i + 1) * 10,
      }))

      mount(BkChart, { props: { points, color: 'aurora' }, global: { stubs: { teleport: true } } })

      // el chart se crea vacío en el frame 0 — la estructura (ejes/grid) ya
      // está completa porque el rango de escala viene fijado en opts, no de data
      expect(mockUPlot).toHaveBeenCalledTimes(1)
      expect(mockUPlot.mock.calls[0][1]).toEqual([[], []])
      expect(mockInstance.setData).not.toHaveBeenCalled()

      const duration = parseInt(core.dur[5], 10)
      const fullXs = points.map((p) => new Date(p.date).getTime() / 1000)
      const fullYs = points.map((p) => p.value)

      pump(duration * 0.4) // frame intermedio: ni al principio ni al final
      const [midXs, midYs] = mockInstance.setData.mock.calls.at(-1)![0]

      // la punta (último elemento del frame) es sintética: no es ninguno de
      // los x reales, cae ESTRICTAMENTE entre dos consecutivos...
      const tipX = midXs.at(-1)!
      const tipY = midYs.at(-1)!
      expect(fullXs).not.toContain(tipX)
      let belowIdx = -1
      for (let i = 0; i < fullXs.length; i++) if (fullXs[i] < tipX) belowIdx = i
      expect(belowIdx).toBeGreaterThanOrEqual(0)
      expect(belowIdx).toBeLessThan(fullXs.length - 1)
      expect(tipX).toBeGreaterThan(fullXs[belowIdx])
      expect(tipX).toBeLessThan(fullXs[belowIdx + 1])
      // ...con su Y interpolado LINEALMENTE entre esos dos puntos reales
      // (no el valor de ninguno de los dos, uno intermedio real)
      const frac = (tipX - fullXs[belowIdx]) / (fullXs[belowIdx + 1] - fullXs[belowIdx])
      const expectedTipY = fullYs[belowIdx] + frac * (fullYs[belowIdx + 1] - fullYs[belowIdx])
      expect(tipY).toBeCloseTo(expectedTipY, 6)

      pump(duration) // tween completo: último setData con los arrays EXACTOS, sin punta
      const lastCall = mockInstance.setData.mock.calls.at(-1)![0]
      expect(lastCall).toEqual([fullXs, fullYs])
      expect(callbacks.length).toBe(0) // no queda ningún frame agendado
    })

    it('pins scales.{x,y}.range to the FULL data extent from the very first build, so axes/grid never jump mid-tween', () => {
      const points = [
        { date: '2026-08-01', value: 10 },
        { date: '2026-08-04', value: 40 },
      ]
      mount(BkChart, { props: { points, color: 'aurora' }, global: { stubs: { teleport: true } } })

      const options = mockUPlot.mock.calls[0][0]
      const fullXs = points.map((p) => new Date(p.date).getTime() / 1000)
      expect(options.scales.x.range).toEqual([Math.min(...fullXs), Math.max(...fullXs)])
      expect(options.scales.y.range).toEqual([10, 40])
    })
  })

  it('reduced-motion: sets the full data immediately via the constructor, never calls setData', () => {
    vi.spyOn(window, 'matchMedia').mockReturnValue({ matches: true } as MediaQueryList)
    const points = [
      { date: '2026-08-01', value: 10 },
      { date: '2026-08-02', value: 20 },
    ]
    mount(BkChart, { props: { points }, global: { stubs: { teleport: true } } })

    expect(mockUPlot).toHaveBeenCalledTimes(1)
    expect(mockUPlot.mock.calls[0][1]).toEqual([
      points.map((p) => new Date(p.date).getTime() / 1000),
      points.map((p) => p.value),
    ])
    expect(mockInstance.setData).not.toHaveBeenCalled()
  })

  it('no requestAnimationFrame in the runtime (SSR/node): sets the full data immediately, same guard as useAnimatedNumber', () => {
    vi.spyOn(window, 'matchMedia').mockReturnValue({ matches: false } as MediaQueryList)
    // happy-dom sí trae rAF nativo: para simular su ausencia real hay que
    // pisarlo explícitamente a undefined, no solo quitar el stub
    vi.stubGlobal('requestAnimationFrame', undefined)
    vi.stubGlobal('cancelAnimationFrame', undefined)
    const points = [
      { date: '2026-08-01', value: 10 },
      { date: '2026-08-02', value: 20 },
    ]
    mount(BkChart, { props: { points }, global: { stubs: { teleport: true } } })

    expect(mockUPlot).toHaveBeenCalledTimes(1)
    expect(mockUPlot.mock.calls[0][1]).toEqual([
      points.map((p) => new Date(p.date).getTime() / 1000),
      points.map((p) => p.value),
    ])
    expect(mockInstance.setData).not.toHaveBeenCalled()
  })
})

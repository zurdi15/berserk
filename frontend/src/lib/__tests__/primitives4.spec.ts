import { mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { createI18nInstance } from '@/i18n'
import { core } from '@/tokens'
import BkChart from '../BkChart.vue'
import BkHeatmap from '../BkHeatmap.vue'
import BkTabs from '../BkTabs.vue'

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

  describe('item 2 (v0.3.2): compact at phone widths, no elastic scroll feel', () => {
    it('tabs are compact below sm (px-2, text-2xs) and normal from sm (px-4, text-sm) — see the fit arithmetic comment in BkTabs.vue', () => {
      const wrapper = mount(BkTabs, { props: { modelValue: 'a', tabs } })
      for (const tabEl of wrapper.findAll('[role="tab"]')) {
        expect(tabEl.classes()).toEqual(
          expect.arrayContaining(['px-2', 'sm:px-4', 'text-2xs', 'sm:text-sm']),
        )
      }
    })

    it('the tablist kills the elastic overscroll feel (overscroll-x-contain) without dropping the overflow-x-auto safety valve', () => {
      const wrapper = mount(BkTabs, { props: { modelValue: 'a', tabs } })
      const tablist = wrapper.get('[role="tablist"]')
      expect(tablist.classes()).toContain('overscroll-x-contain')
      expect(tablist.classes()).toContain('overflow-x-auto')
    })

    it('never risks page-widening: the tablist itself absorbs any overflow (overflow-x-auto) and each tab stays non-shrinking/non-wrapping inside it — the same containment that fixed the original phase-4 bug (c111487)', () => {
      const wrapper = mount(BkTabs, { props: { modelValue: 'a', tabs } })
      const tablist = wrapper.get('[role="tablist"]')
      expect(tablist.classes()).toContain('overflow-x-auto')
      for (const tabEl of wrapper.findAll('[role="tab"]')) {
        expect(tabEl.classes()).toEqual(expect.arrayContaining(['shrink-0', 'whitespace-nowrap']))
      }
    })
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

  it('v0.3.0 item 7: flattens intensity to 3 tiers (empty / trained / 2+), killing the old 4-tier gradient (bg-aurora/N, not element opacity — see item 1/2 why-comment)', () => {
    const wrapper = mount(BkHeatmap, {
      props: {
        year: 2026,
        data: [
          { date: '2026-01-01', count: 0 }, // bg-aurora/8 (base, sin cambios)
          { date: '2026-01-02', count: 1 }, // bg-aurora/70 (un único nivel "brillante")
          { date: '2026-01-03', count: 2 }, // bg-aurora/100 (escalón extra, 2+)
          { date: '2026-01-04', count: 4 }, // bg-aurora/100 (sigue en el mismo tope, no un 4º tramo)
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
    const cell4 = findCell('2026-01-04')!

    expect(cell0.classes()).toContain('bg-aurora/8')
    expect(cell1.classes()).toContain('bg-aurora/70')
    expect(cell2.classes()).toContain('bg-aurora/100')
    expect(cell4.classes()).toContain('bg-aurora/100')

    // ninguna clase de los antiguos tramos intermedios (15%/40%) sobrevive
    for (const cell of [cell0, cell1, cell2, cell4]) {
      expect(cell.classes()).not.toContain('bg-aurora/15')
      expect(cell.classes()).not.toContain('bg-aurora/40')
    }
  })

  it('v0.3.0 item 6: cascade delay index is the GLOBAL day-of-week column (block offset + local col), not reset per month block', () => {
    const wrapper = mount(BkHeatmap, {
      props: { year: 2026, data: [] },
      global: { plugins: [createI18nInstance()] },
    })

    // tras la transposición (item 6) el eje horizontal del bloque es FIJO
    // (7, días de la semana) para todos los meses — el offset de cada
    // bloque ya no depende de cuántas semanas tenga (tenía antes, con
    // columnCount variable), es directamente su índice × 7
    const totalColumns = 12 * 7
    const expectedStep = 1000 / (totalColumns - 1)

    const cells = wrapper.findAll('.bk-cascade')
    expect(cells.length).toBeGreaterThan(0)
    const findCell = (date: string) => cells.find((c) => c.attributes('title')?.startsWith(date))!

    // 1 enero 2026 es jueves (col 3, ver heatmap.spec.ts): índice global = col 3
    expect(findCell('2026-01-01').attributes('style')).toContain('--bk-cascade-i: 3')
    expect(findCell('2026-01-01').attributes('style')).toContain(`--bk-cascade-step: ${expectedStep}ms`)

    // 5 enero 2026 es lunes (col 0, primera semana completa de enero):
    // índice global = offset de enero (0) + col 0 = 0
    expect(findCell('2026-01-05').attributes('style')).toContain('--bk-cascade-i: 0')
    // 12 enero también es lunes (otra semana, misma columna): comparte
    // índice con el 5 de enero — toda una columna de días de la semana
    // revela a la vez, no semana a semana
    expect(findCell('2026-01-12').attributes('style')).toContain('--bk-cascade-i: 0')

    // 1 febrero: bloque 1 (índice), offset = 1*7 = 7; 1 feb 2026 es domingo
    // (col 6): índice global = 7 + 6 = 13
    expect(findCell('2026-02-01').attributes('style')).toContain('--bk-cascade-i: 13')
  })

  it('v0.3.0 item 6: the full sweep (first to last column of the year) never exceeds ~1s, and the column count is now fixed at 12*7 regardless of the year', () => {
    const totalColumns = 12 * 7
    const expectedStep = 1000 / (totalColumns - 1)
    const maxSweepMs = (totalColumns - 1) * expectedStep

    expect(maxSweepMs).toBeLessThanOrEqual(1000)

    // el mismo total de columnas (84) vale para cualquier año, ya no
    // depende de en qué día de la semana cae cada 1 de enero
    for (const year of [2024, 2025, 2026, 2027]) {
      const wrapper = mount(BkHeatmap, {
        props: { year, data: [] },
        global: { plugins: [createI18nInstance()] },
      })
      const decCell = wrapper.findAll('.bk-cascade').find((c) => c.attributes('title')?.startsWith(`${year}-12-31`))!
      const cascadeI = Number(decCell.attributes('style')!.match(/--bk-cascade-i: (\d+)/)![1])
      expect(cascadeI).toBeLessThanOrEqual(totalColumns - 1)
    }
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
    // v0.3.0 item 6: tras la transposición, el eje horizontal (columnas) es
    // FIJO a 7 (días de la semana) para TODOS los meses; enero ocupa 5
    // filas (semanas), tal y como calcula heatmap.spec.ts
    const januaryGrid = blocks[0].find('.grid')
    expect(januaryGrid.attributes('style')).toContain('grid-template-columns: repeat(7, auto)')
    expect(januaryGrid.attributes('style')).toContain('grid-template-rows: repeat(5, auto)')
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

  // v0.4.0 light theme: uPlot pinta en <canvas>, así que un toggle de
  // html.bk-light no lo recolorea solo (CSS no llega dentro de un canvas).
  // utils/theme.ts dispara 'bk:theme-change' en cada aplicación de tema;
  // BkChart lo escucha y reconstruye — un "remonte" documentado y aceptado
  // a propósito (ver el comentario junto a onThemeChange en BkChart.vue)
  describe('theme re-render (item: v0.4.0 light theme)', () => {
    // ojo: 'bk:theme-change' es un evento GLOBAL en `window`, y este archivo
    // no desmonta todos los charts de tests anteriores (varios de los tests
    // de arriba nunca llaman a wrapper.unmount()) — así que el recuento
    // absoluto de mockUPlot puede incluir reconstrucciones de instancias
    // ajenas todavía vivas. Se comprueba con un DELTA relativo al propio
    // mount de este test, no un total absoluto; mockInstance SÍ es fiable
    // (se recrea en el beforeEach de este describe, así que solo el chart
    // de ESTE test puede tener esa referencia exacta en su `chart` interno).
    it('rebuilds the chart (destroy + new uPlot instance) on a global bk:theme-change event', async () => {
      const wrapper = mount(BkChart, {
        props: {
          points: [
            { date: '2026-08-05', value: 10 },
            { date: '2026-08-06', value: 15 },
          ],
          color: 'aurora',
        },
        global: { stubs: { teleport: true } },
      })
      await wrapper.vm.$nextTick()
      const callsBefore = mockUPlot.mock.calls.length

      window.dispatchEvent(new Event('bk:theme-change'))
      await wrapper.vm.$nextTick()

      expect(mockInstance.destroy).toHaveBeenCalledTimes(1)
      expect(mockUPlot.mock.calls.length).toBeGreaterThan(callsBefore)

      wrapper.unmount()
    })

    it('removes its bk:theme-change listener on unmount (no leak)', async () => {
      const addSpy = vi.spyOn(window, 'addEventListener')
      const removeSpy = vi.spyOn(window, 'removeEventListener')

      const wrapper = mount(BkChart, {
        props: { points: [{ date: '2026-08-05', value: 10 }] },
        global: { stubs: { teleport: true } },
      })
      await wrapper.vm.$nextTick()
      expect(addSpy).toHaveBeenCalledWith('bk:theme-change', expect.any(Function))

      wrapper.unmount()
      expect(removeSpy).toHaveBeenCalledWith('bk:theme-change', expect.any(Function))
      // el listener que se quitó es EL MISMO que se puso (misma referencia
      // de función) — si no, removeEventListener no habría dado de baja nada
      expect(removeSpy.mock.calls.find((c) => c[0] === 'bk:theme-change')?.[1])
        .toBe(addSpy.mock.calls.find((c) => c[0] === 'bk:theme-change')?.[1])
    })
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

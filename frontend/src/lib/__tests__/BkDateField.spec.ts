import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { createI18nInstance } from '@/i18n'
import BkDateField from '../BkDateField.vue'
import BkSheet from '../BkSheet.vue'

function build(props: { modelValue: string }) {
  return mount(BkDateField, {
    props: { label: 'Fecha', ...props },
    global: { plugins: [createI18nInstance()] },
    attachTo: document.body,
  })
}

describe('BkDateField', () => {
  let wrapper: VueWrapper | null = null

  afterEach(() => {
    wrapper?.unmount()
    wrapper = null
    vi.useRealTimers()
  })

  it('shows the localized short date on the trigger', () => {
    wrapper = build({ modelValue: '2026-08-05' })
    const text = wrapper.get('[role="combobox"]').text()
    expect(text).toMatch(/5/)
    expect(text).toMatch(/ago/i)
    expect(text).toMatch(/2026/)
  })

  it('zurdi: the panel enters with the softer bk-pop-soft transition (no overshoot), not the punchier bk-pop reserved for celebrations/branding', async () => {
    wrapper = mount(BkDateField, {
      props: { label: 'Fecha', modelValue: '2026-08-05' },
      global: { plugins: [createI18nInstance()], stubs: { transition: false } },
      attachTo: document.body,
    })
    await wrapper.get('[role="combobox"]').trigger('click')

    const panel = document.querySelector('[role="grid"]')!.closest('[style]') as HTMLElement
    expect(panel.classList.contains('bk-pop-soft-enter-active')).toBe(true)
    expect(panel.classList.contains('bk-pop-enter-active')).toBe(false)
  })

  it('clicking the label focuses the trigger (M10: span+aria-labelledby, not a wrapping <label>)', async () => {
    wrapper = build({ modelValue: '2026-08-05' })
    const label = wrapper.get('span.text-ink-muted')
    await label.trigger('click')
    expect(document.activeElement).toBe(wrapper.get('[role="combobox"]').element)
  })

  it('opens a grid with weekday headers and a multiple-of-7 cell count, heading the viewed month, and moves REAL focus into the grid (C1: without this, keyboard on the panel is dead)', async () => {
    wrapper = build({ modelValue: '2026-08-05' })
    await wrapper.get('[role="combobox"]').trigger('click')
    await flushPromises()

    const grid = document.querySelector('[role="grid"]') as HTMLElement
    expect(grid).not.toBeNull()
    const cells = grid.querySelectorAll('[role="gridcell"]')
    expect(cells.length % 7).toBe(0)
    expect(cells.length).toBeGreaterThanOrEqual(28)

    const heading = document.querySelector(`#${grid.getAttribute('aria-labelledby')}`)
    expect(heading?.textContent?.toLowerCase()).toContain('agosto')

    // el punto crítico: el foco real del DOM (no solo aria-activedescendant)
    // tiene que estar en la rejilla, o las teclas no llegan a nadie
    expect(document.activeElement).toBe(grid)
  })

  it('marks the selected day with aria-selected and an aurora background', async () => {
    wrapper = build({ modelValue: '2026-08-05' })
    await wrapper.get('[role="combobox"]').trigger('click')

    const selected = document.getElementById(
      Array.from(document.querySelectorAll('[role="gridcell"]'))
        .find((c) => c.getAttribute('aria-selected') === 'true')!.id,
    )!
    expect(selected.textContent?.trim()).toBe('5')
    expect(selected.className).toContain('bg-aurora')
  })

  it('marks today distinctly when it is not the selected day', async () => {
    vi.useFakeTimers({ now: new Date(2026, 7, 20, 12), toFake: ['Date'] })
    wrapper = build({ modelValue: '2026-08-05' })
    await wrapper.get('[role="combobox"]').trigger('click')

    const cells = Array.from(document.querySelectorAll('[role="gridcell"]'))
    const todayCell = cells.find((c) => c.textContent?.trim() === '20')!
    expect(todayCell.className).toContain('border-aurora')
    expect(todayCell.className).not.toContain('bg-aurora')
  })

  it('clicking a day emits its ISO date and closes the panel', async () => {
    wrapper = build({ modelValue: '2026-08-05' })
    await wrapper.get('[role="combobox"]').trigger('click')

    const cells = Array.from(document.querySelectorAll('[role="gridcell"]'))
    const day12 = cells.find((c) => c.id.endsWith('2026-08-12'))!
    ;(day12 as HTMLElement).dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await flushPromises()

    expect(wrapper.emitted('update:modelValue')!.at(-1)).toEqual(['2026-08-12'])
    expect(document.querySelector('[role="grid"]')).toBeNull()
  })

  it('ArrowRight on the REAL focused grid moves the focused day forward across a month boundary (day-shift trap)', async () => {
    // C1: dispatch sobre document.activeElement — así el test falla si el
    // foco deja de estar ahí de verdad, en vez de pasar contra un listener
    // huérfano que nunca recibiría la tecla en un navegador real
    wrapper = build({ modelValue: '2026-08-31' })
    await wrapper.get('[role="combobox"]').trigger('click')
    await flushPromises()

    const grid = document.querySelector('[role="grid"]') as HTMLElement
    expect(document.activeElement).toBe(grid)

    document.activeElement!.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true, cancelable: true }))
    await flushPromises()

    expect(grid.getAttribute('aria-activedescendant')).toContain('2026-09-01')
    // el mes visible sigue al foco: septiembre, no agosto
    const heading = document.querySelector(`#${grid.getAttribute('aria-labelledby')}`)
    expect(heading?.textContent?.toLowerCase()).toContain('septiembre')
  })

  it('ArrowDown on the REAL focused grid moves the focused day by 7 (one week)', async () => {
    wrapper = build({ modelValue: '2026-08-05' })
    await wrapper.get('[role="combobox"]').trigger('click')
    await flushPromises()

    const grid = document.querySelector('[role="grid"]') as HTMLElement
    expect(document.activeElement).toBe(grid)

    document.activeElement!.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true, cancelable: true }))
    await flushPromises()

    expect(grid.getAttribute('aria-activedescendant')).toContain('2026-08-12')
  })

  it('PageDown/PageUp on the REAL focused grid move the visible month forward/back a full month', async () => {
    wrapper = build({ modelValue: '2026-08-05' })
    await wrapper.get('[role="combobox"]').trigger('click')
    await flushPromises()

    const grid = document.querySelector('[role="grid"]') as HTMLElement
    expect(document.activeElement).toBe(grid)

    document.activeElement!.dispatchEvent(new KeyboardEvent('keydown', { key: 'PageDown', bubbles: true, cancelable: true }))
    await flushPromises()
    let heading = document.querySelector(`#${grid.getAttribute('aria-labelledby')}`)
    expect(heading?.textContent?.toLowerCase()).toContain('septiembre')

    document.activeElement!.dispatchEvent(new KeyboardEvent('keydown', { key: 'PageUp', bubbles: true, cancelable: true }))
    document.activeElement!.dispatchEvent(new KeyboardEvent('keydown', { key: 'PageUp', bubbles: true, cancelable: true }))
    await flushPromises()
    heading = document.querySelector(`#${grid.getAttribute('aria-labelledby')}`)
    expect(heading?.textContent?.toLowerCase()).toContain('julio')
  })

  it('Enter on the REAL focused grid selects the currently-focused day and closes', async () => {
    wrapper = build({ modelValue: '2026-08-05' })
    await wrapper.get('[role="combobox"]').trigger('click')
    await flushPromises()

    const grid = document.querySelector('[role="grid"]') as HTMLElement
    expect(document.activeElement).toBe(grid)

    document.activeElement!.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true, cancelable: true }))
    document.activeElement!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }))
    await flushPromises()

    expect(wrapper.emitted('update:modelValue')!.at(-1)).toEqual(['2026-08-06'])
    expect(document.querySelector('[role="grid"]')).toBeNull()
  })

  it('Escape on the REAL focused grid closes the panel without emitting a change', async () => {
    wrapper = build({ modelValue: '2026-08-05' })
    await wrapper.get('[role="combobox"]').trigger('click')
    await flushPromises()

    const grid = document.querySelector('[role="grid"]') as HTMLElement
    expect(document.activeElement).toBe(grid)

    document.activeElement!.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true, cancelable: true }))
    document.activeElement!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }))
    await flushPromises()

    expect(wrapper.emitted('update:modelValue')).toBeUndefined()
    expect(document.querySelector('[role="grid"]')).toBeNull()
  })

  describe('Escape interplay with BkSheet', () => {
    it('with a sheet open and its date panel open, the first Escape closes only the panel', async () => {
      const Host = {
        components: { BkSheet, BkDateField },
        data: () => ({ open: true, value: '2026-08-05' }),
        template: `
          <BkSheet :open="open" title="Ajustes" @close="open = false">
            <BkDateField v-model="value" label="Fecha" />
          </BkSheet>
        `,
      }
      wrapper = mount(Host, {
        global: { plugins: [createI18nInstance()] },
        attachTo: document.body,
      }) as unknown as VueWrapper
      await flushPromises()

      const trigger = document.querySelector('[role="combobox"]') as HTMLElement
      trigger.dispatchEvent(new MouseEvent('click', { bubbles: true }))
      await flushPromises()

      expect(document.querySelector('[role="dialog"]')).not.toBeNull()
      expect(document.querySelector('[role="grid"]')).not.toBeNull()

      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
      await flushPromises()

      expect(document.querySelector('[role="grid"]')).toBeNull()
      expect(document.querySelector('[role="dialog"]')).not.toBeNull()
    })
  })
})

import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { afterEach, describe, expect, it } from 'vitest'

import { createI18nInstance } from '@/i18n'
import BkTimeField from '../BkTimeField.vue'
import BkSheet from '../BkSheet.vue'

function build(props: { modelValue: string | null; hint?: string } = { modelValue: null }) {
  return mount(BkTimeField, {
    props: { label: 'Hora', ...props },
    global: { plugins: [createI18nInstance()] },
    attachTo: document.body,
  })
}

describe('BkTimeField', () => {
  let wrapper: VueWrapper | null = null

  afterEach(() => {
    wrapper?.unmount()
    wrapper = null
  })

  it('shows a placeholder when modelValue is null, and the value itself when set', () => {
    wrapper = build({ modelValue: null })
    expect(wrapper.get('[role="combobox"]').text()).toContain('--:--')

    wrapper.unmount()
    wrapper = build({ modelValue: '14:30' })
    expect(wrapper.get('[role="combobox"]').text()).toContain('14:30')
  })

  it('item 1: the trigger carries bk-form-control, so it gets the single-border focus treatment instead of stacking the global ring', () => {
    wrapper = build({ modelValue: null })
    expect(wrapper.get('[role="combobox"]').classes()).toContain('bk-form-control')
  })

  it('zurdi: the panel enters with the softer bk-pop-soft transition (no overshoot), not the punchier bk-pop reserved for celebrations/branding', async () => {
    wrapper = mount(BkTimeField, {
      props: { label: 'Hora', modelValue: null },
      global: { plugins: [createI18nInstance()], stubs: { transition: false } },
      attachTo: document.body,
    })
    await wrapper.get('[role="combobox"]').trigger('click')

    const panel = document.querySelectorAll('[role="listbox"]')[0].closest('[style]') as HTMLElement
    expect(panel.classList.contains('bk-pop-soft-enter-active')).toBe(true)
    expect(panel.classList.contains('bk-pop-enter-active')).toBe(false)
  })

  it('renders the hint text below the trigger when provided (parity with BkField, needed by ScheduleSheet)', () => {
    wrapper = build({ modelValue: null, hint: 'Opcional' })
    expect(wrapper.text()).toContain('Opcional')
  })

  it('renders no hint text when the prop is omitted', () => {
    wrapper = build({ modelValue: null })
    expect(wrapper.text()).not.toContain('Opcional')
  })

  it('clicking the label focuses the trigger (M10: span+aria-labelledby, not a wrapping <label>)', async () => {
    wrapper = build({ modelValue: null })
    const label = wrapper.get('span.text-ink-muted')
    await label.trigger('click')
    expect(document.activeElement).toBe(wrapper.get('[role="combobox"]').element)
  })

  it('opens a panel with two listboxes (24 hours, 12 five-minute-step minutes) and moves REAL focus into the hours column (C1: without this, keyboard on the panel is dead)', async () => {
    wrapper = build()
    await wrapper.get('[role="combobox"]').trigger('click')
    await flushPromises()

    const listboxes = document.querySelectorAll('[role="listbox"]')
    expect(listboxes).toHaveLength(2)
    expect(listboxes[0].querySelectorAll('[role="option"]')).toHaveLength(24)
    expect(listboxes[1].querySelectorAll('[role="option"]')).toHaveLength(12)
    expect(listboxes[1].querySelector('[role="option"]')?.textContent).toBe('00')
    expect(listboxes[1].querySelectorAll('[role="option"]')[1]?.textContent).toBe('05')

    // el punto crítico: el foco real del DOM (no solo aria-activedescendant)
    // tiene que estar en la columna de horas, o las teclas no llegan a nadie
    expect(document.activeElement).toBe(listboxes[0])
  })

  it('picking an hour and a minute, then Apply, emits "HH:MM" and closes', async () => {
    wrapper = build({ modelValue: null })
    await wrapper.get('[role="combobox"]').trigger('click')

    const [hourList, minuteList] = document.querySelectorAll('[role="listbox"]')
    const hour9 = Array.from(hourList.querySelectorAll('[role="option"]')).find((o) => o.textContent === '09')!
    const minute35 = Array.from(minuteList.querySelectorAll('[role="option"]')).find((o) => o.textContent === '35')!
    hour9.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    minute35.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await flushPromises()

    const applyBtn = document.querySelector('[data-testid="time-field-apply"]') as HTMLElement
    applyBtn.click()
    await flushPromises()

    expect(wrapper.emitted('update:modelValue')!.at(-1)).toEqual(['09:35'])
    expect(document.querySelector('[role="listbox"]')).toBeNull()
  })

  it('ArrowDown on the REAL focused hours column moves aria-activedescendant to the next hour, cyclically', async () => {
    // C1: dispatch sobre document.activeElement, no sobre el nodo consultado
    // a mano — así el test falla si algún día el foco deja de estar ahí de
    // verdad, en vez de pasar igual contra un listener huérfano sin foco
    wrapper = build({ modelValue: '23:00' })
    await wrapper.get('[role="combobox"]').trigger('click')
    await flushPromises()

    const hourList = document.querySelectorAll('[role="listbox"]')[0] as HTMLElement
    expect(document.activeElement).toBe(hourList)

    document.activeElement!.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true, cancelable: true }))
    await flushPromises()

    const activeId = hourList.getAttribute('aria-activedescendant')
    // de 23 pasa a 00 (roving cíclico)
    expect(document.getElementById(activeId!)?.textContent).toBe('00')
  })

  it('Home/End on the minutes column (reached via Tab from hours, simulated with a real .focus()) jump to 00/55', async () => {
    wrapper = build({ modelValue: '10:20' })
    await wrapper.get('[role="combobox"]').trigger('click')
    await flushPromises()

    const minuteList = document.querySelectorAll('[role="listbox"]')[1] as HTMLElement
    // el foco automático al abrir va a horas (C1); llegar a minutos es vía
    // Tab en un navegador real — se simula moviendo el foco real aquí antes
    // de disparar las teclas, no solo apuntando el evento al nodo
    minuteList.focus()
    expect(document.activeElement).toBe(minuteList)

    document.activeElement!.dispatchEvent(new KeyboardEvent('keydown', { key: 'End', bubbles: true, cancelable: true }))
    await flushPromises()
    let activeId = minuteList.getAttribute('aria-activedescendant')
    expect(document.getElementById(activeId!)?.textContent).toBe('55')

    document.activeElement!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Home', bubbles: true, cancelable: true }))
    await flushPromises()
    activeId = minuteList.getAttribute('aria-activedescendant')
    expect(document.getElementById(activeId!)?.textContent).toBe('00')
  })

  it('a non-step minute (e.g. 14:23) snaps to the nearest 5-minute step on open, so aria-activedescendant never points at a nonexistent option (M2)', async () => {
    wrapper = build({ modelValue: '14:23' })
    await wrapper.get('[role="combobox"]').trigger('click')
    await flushPromises()

    const minuteList = document.querySelectorAll('[role="listbox"]')[1] as HTMLElement
    const activeId = minuteList.getAttribute('aria-activedescendant')
    const activeEl = document.getElementById(activeId!)
    expect(activeEl).not.toBeNull()
    // 23 redondea al paso de 5 más cercano: 25
    expect(activeEl?.textContent).toBe('25')
  })

  it('Enter on the REAL focused hours column applies the pending hour/minute and closes', async () => {
    wrapper = build({ modelValue: '05:00' })
    await wrapper.get('[role="combobox"]').trigger('click')
    await flushPromises()

    const hourList = document.querySelectorAll('[role="listbox"]')[0] as HTMLElement
    expect(document.activeElement).toBe(hourList)

    document.activeElement!.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true, cancelable: true }))
    document.activeElement!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }))
    await flushPromises()

    expect(wrapper.emitted('update:modelValue')!.at(-1)).toEqual(['06:00'])
    expect(document.querySelector('[role="listbox"]')).toBeNull()
  })

  it('Escape on the REAL focused hours column cancels without emitting a change', async () => {
    wrapper = build({ modelValue: '05:00' })
    await wrapper.get('[role="combobox"]').trigger('click')
    await flushPromises()

    const hourList = document.querySelectorAll('[role="listbox"]')[0] as HTMLElement
    expect(document.activeElement).toBe(hourList)

    document.activeElement!.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true, cancelable: true }))
    document.activeElement!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }))
    await flushPromises()

    expect(wrapper.emitted('update:modelValue')).toBeUndefined()
    expect(document.querySelector('[role="listbox"]')).toBeNull()
  })

  it('the Clear button emits null and closes (nullable time, e.g. ScheduleSheet)', async () => {
    wrapper = build({ modelValue: '09:00' })
    await wrapper.get('[role="combobox"]').trigger('click')

    const clearBtn = document.querySelector('[data-testid="time-field-clear"]') as HTMLElement
    clearBtn.click()
    await flushPromises()

    expect(wrapper.emitted('update:modelValue')!.at(-1)).toEqual([null])
    expect(document.querySelector('[role="listbox"]')).toBeNull()
  })

  describe('Escape interplay with BkSheet', () => {
    it('with a sheet open and its time panel open, the first Escape closes only the panel', async () => {
      const Host = {
        components: { BkSheet, BkTimeField },
        data: () => ({ open: true, value: null as string | null }),
        template: `
          <BkSheet :open="open" title="Ajustes" @close="open = false">
            <BkTimeField v-model="value" label="Hora" />
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
      expect(document.querySelectorAll('[role="listbox"]').length).toBe(2)

      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
      await flushPromises()

      expect(document.querySelectorAll('[role="listbox"]').length).toBe(0)
      expect(document.querySelector('[role="dialog"]')).not.toBeNull()
    })
  })
})

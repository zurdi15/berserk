import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { createI18nInstance } from '@/i18n'
import BkSelect from '../BkSelect.vue'
import BkSheet from '../BkSheet.vue'

const OPTIONS = [
  { value: 'a', label: 'Option A' },
  { value: 'b', label: 'Option B' },
  { value: 'c', label: 'Option C', disabled: true },
  { value: 'd', label: 'Option D' },
]

function build(props: Partial<InstanceType<typeof BkSelect>['$props']> = {}) {
  return mount(BkSelect, {
    props: { label: 'Choose', modelValue: 'a', options: OPTIONS, ...props },
    global: { plugins: [createI18nInstance()] },
    attachTo: document.body,
  })
}

describe('BkSelect', () => {
  let wrapper: VueWrapper | null = null

  afterEach(() => {
    wrapper?.unmount()
    wrapper = null
    vi.restoreAllMocks()
  })

  it('renders the trigger as a combobox showing the selected option label', () => {
    wrapper = build()
    const trigger = wrapper.get('[role="combobox"]')
    expect(trigger.text()).toContain('Option A')
    expect(trigger.attributes('aria-expanded')).toBe('false')
    expect(trigger.attributes('aria-haspopup')).toBe('listbox')
  })

  it('opens the panel on click and exposes it as a listbox with option roles', async () => {
    wrapper = build()
    await wrapper.get('[role="combobox"]').trigger('click')

    const listbox = document.querySelector('[role="listbox"]') as HTMLElement
    expect(listbox).not.toBeNull()
    const options = listbox.querySelectorAll('[role="option"]')
    expect(options).toHaveLength(4)
    expect(wrapper.get('[role="combobox"]').attributes('aria-expanded')).toBe('true')
    expect(wrapper.get('[role="combobox"]').attributes('aria-controls')).toBe(listbox.id)
  })

  it('marks the selected option with aria-selected and the disabled one with aria-disabled', async () => {
    wrapper = build({ modelValue: 'b' })
    await wrapper.get('[role="combobox"]').trigger('click')

    const options = document.querySelectorAll('[role="option"]')
    expect(options[1].getAttribute('aria-selected')).toBe('true')
    expect(options[0].getAttribute('aria-selected')).toBe('false')
    expect(options[2].getAttribute('aria-disabled')).toBe('true')
  })

  it('clicking an enabled option emits update:modelValue and closes the panel', async () => {
    wrapper = build()
    await wrapper.get('[role="combobox"]').trigger('click')

    const options = document.querySelectorAll('[role="option"]')
    ;(options[1] as HTMLElement).dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await flushPromises()

    expect(wrapper.emitted('update:modelValue')!.at(-1)).toEqual(['b'])
    expect(document.querySelector('[role="listbox"]')).toBeNull()
  })

  it('clicking a disabled option does nothing', async () => {
    wrapper = build()
    await wrapper.get('[role="combobox"]').trigger('click')

    const options = document.querySelectorAll('[role="option"]')
    ;(options[2] as HTMLElement).dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await flushPromises()

    expect(wrapper.emitted('update:modelValue')).toBeUndefined()
    expect(document.querySelector('[role="listbox"]')).not.toBeNull()
  })

  it('ArrowDown opens the panel when closed, then moves aria-activedescendant to the next enabled option (skipping disabled)', async () => {
    wrapper = build({ modelValue: 'b' })
    const trigger = wrapper.get('[role="combobox"]')

    await trigger.trigger('keydown', { key: 'ArrowDown' })
    expect(document.querySelector('[role="listbox"]')).not.toBeNull()
    // arranca anclado a la opción actual (b)
    let activeId = trigger.attributes('aria-activedescendant')
    expect(document.getElementById(activeId!)?.textContent).toContain('Option B')

    // siguiente: c está disabled, así que salta directo a d
    await trigger.trigger('keydown', { key: 'ArrowDown' })
    activeId = trigger.attributes('aria-activedescendant')
    expect(document.getElementById(activeId!)?.textContent).toContain('Option D')
  })

  it('Home/End jump to the first/last enabled option', async () => {
    wrapper = build({ modelValue: 'b' })
    const trigger = wrapper.get('[role="combobox"]')
    await trigger.trigger('keydown', { key: 'ArrowDown' })

    await trigger.trigger('keydown', { key: 'End' })
    let activeId = trigger.attributes('aria-activedescendant')
    expect(document.getElementById(activeId!)?.textContent).toContain('Option D')

    await trigger.trigger('keydown', { key: 'Home' })
    activeId = trigger.attributes('aria-activedescendant')
    expect(document.getElementById(activeId!)?.textContent).toContain('Option A')
  })

  it('Enter commits the active option and returns focus to the trigger', async () => {
    wrapper = build({ modelValue: 'a' })
    const trigger = wrapper.get('[role="combobox"]')
    await trigger.trigger('keydown', { key: 'ArrowDown' }) // abre, activa 'a'
    await trigger.trigger('keydown', { key: 'ArrowDown' }) // mueve a 'b'
    await trigger.trigger('keydown', { key: 'Enter' })

    expect(wrapper.emitted('update:modelValue')!.at(-1)).toEqual(['b'])
    expect(document.querySelector('[role="listbox"]')).toBeNull()
    expect(document.activeElement).toBe(trigger.element)
  })

  it('Escape closes the panel without emitting a selection change', async () => {
    wrapper = build({ modelValue: 'a' })
    const trigger = wrapper.get('[role="combobox"]')
    await trigger.trigger('keydown', { key: 'ArrowDown' })
    await trigger.trigger('keydown', { key: 'ArrowDown' }) // activa 'b', sin confirmar
    await trigger.trigger('keydown', { key: 'Escape' })

    expect(wrapper.emitted('update:modelValue')).toBeUndefined()
    expect(document.querySelector('[role="listbox"]')).toBeNull()
  })

  it('printable-character type-ahead jumps the active option to the first matching label', async () => {
    // prefijos distintos a propósito: las OPTIONS de arriba comparten
    // "Option " y startsWith nunca distinguiría una letra intermedia
    const fruits = [
      { value: 'ap', label: 'Apple' },
      { value: 'ba', label: 'Banana' },
      { value: 'da', label: 'Date' },
    ]
    wrapper = build({ options: fruits, modelValue: 'ap' })
    const trigger = wrapper.get('[role="combobox"]')
    await trigger.trigger('keydown', { key: 'ArrowDown' }) // abre

    await trigger.trigger('keydown', { key: 'd' })
    const activeId = trigger.attributes('aria-activedescendant')
    expect(document.getElementById(activeId!)?.textContent).toContain('Date')
  })

  it('clicking outside the trigger and panel closes it without a selection change', async () => {
    wrapper = build()
    await wrapper.get('[role="combobox"]').trigger('click')
    expect(document.querySelector('[role="listbox"]')).not.toBeNull()

    document.body.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }))
    await flushPromises()

    expect(document.querySelector('[role="listbox"]')).toBeNull()
    expect(wrapper.emitted('update:modelValue')).toBeUndefined()
  })

  it('flips the panel above the trigger when there is not enough room below', async () => {
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({
      top: 750, bottom: 780, left: 10, right: 200, width: 190, height: 30,
      x: 10, y: 750, toJSON: () => {},
    } as DOMRect)
    vi.stubGlobal('innerHeight', 800)

    wrapper = build()
    await wrapper.get('[role="combobox"]').trigger('click')

    const panel = document.querySelector('[role="listbox"]')!.parentElement as HTMLElement
    expect(panel.style.bottom).not.toBe('')
    expect(panel.style.top).toBe('')

    vi.unstubAllGlobals()
  })

  it('renders a filter input only when there are more than 15 options, and it narrows the visible list', async () => {
    wrapper = build()
    await wrapper.get('[role="combobox"]').trigger('click')
    expect(document.querySelector('input[type="text"]')).toBeNull()
    await wrapper.get('[role="combobox"]').trigger('keydown', { key: 'Escape' })

    const manyOptions = Array.from({ length: 20 }, (_, i) => ({ value: String(i), label: `Zone ${i}` }))
    wrapper.unmount()
    wrapper = build({ options: manyOptions, modelValue: '0' })
    await wrapper.get('[role="combobox"]').trigger('click')

    const filterInput = document.querySelector('input[type="text"]') as HTMLInputElement
    expect(filterInput).not.toBeNull()
    expect(document.querySelectorAll('[role="option"]')).toHaveLength(20)

    filterInput.value = 'Zone 1'
    filterInput.dispatchEvent(new Event('input', { bubbles: true }))
    await flushPromises()

    const visible = document.querySelectorAll('[role="option"]')
    // "Zone 1", "Zone 10".."Zone 19": 11 coincidencias
    expect(visible.length).toBe(11)
  })

  it('shows a no-results row when the filter matches nothing', async () => {
    const manyOptions = Array.from({ length: 16 }, (_, i) => ({ value: String(i), label: `Zone ${i}` }))
    wrapper = build({ options: manyOptions, modelValue: '0' })
    await wrapper.get('[role="combobox"]').trigger('click')

    const filterInput = document.querySelector('input[type="text"]') as HTMLInputElement
    filterInput.value = 'nonexistent'
    filterInput.dispatchEvent(new Event('input', { bubbles: true }))
    await flushPromises()

    expect(document.querySelectorAll('[role="option"]')).toHaveLength(0)
    expect(document.querySelector('[role="listbox"]')?.textContent).toContain('Sin resultados')
  })

  describe('Escape interplay with BkSheet', () => {
    it('with a sheet open and its select panel open, the first Escape closes only the panel; the second closes the sheet', async () => {
      const Host = {
        components: { BkSheet, BkSelect },
        data: () => ({ open: true, value: 'a' }),
        template: `
          <BkSheet :open="open" title="Ajustes" @close="open = false">
            <BkSelect v-model="value" label="Choose" :options="[{value:'a',label:'A'},{value:'b',label:'B'}]" />
          </BkSheet>
        `,
      }
      wrapper = mount(Host, {
        global: { plugins: [createI18nInstance()] },
        attachTo: document.body,
      })
      await flushPromises()

      const trigger = document.querySelector('[role="combobox"]') as HTMLElement
      trigger.dispatchEvent(new MouseEvent('click', { bubbles: true }))
      await flushPromises()

      expect(document.querySelector('[role="dialog"]')).not.toBeNull()
      expect(document.querySelector('[role="listbox"]')).not.toBeNull()

      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
      await flushPromises()

      // primer Escape: solo el panel del select se cierra, el sheet sigue abierto
      expect(document.querySelector('[role="listbox"]')).toBeNull()
      expect(document.querySelector('[role="dialog"]')).not.toBeNull()

      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
      await flushPromises()

      // segundo Escape: ahora sí le toca al sheet (el @close del host lo cierra)
      expect(document.querySelector('[role="dialog"]')).toBeNull()
    })
  })
})

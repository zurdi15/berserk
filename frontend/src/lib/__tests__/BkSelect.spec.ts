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

  it('item 1: the trigger carries bk-form-control, so it gets the single-border focus treatment instead of stacking the global ring', () => {
    wrapper = build()
    expect(wrapper.get('[role="combobox"]').classes()).toContain('bk-form-control')
  })

  it('item 1: the filter input ALSO carries bk-form-control (its own focus indicator, not the global ring)', async () => {
    const manyOptions = Array.from({ length: 20 }, (_, i) => ({ value: String(i), label: `Zone ${i}` }))
    wrapper = build({ options: manyOptions, modelValue: '0' })
    await wrapper.get('[role="combobox"]').trigger('click')
    const filterInput = document.querySelector('input[type="text"]') as HTMLInputElement
    expect(filterInput.classList.contains('bk-form-control')).toBe(true)
  })

  it('clicking the label focuses the trigger (M10: span+aria-labelledby, not a wrapping <label>)', async () => {
    wrapper = build()
    const label = wrapper.get('span.text-ink-muted')
    await label.trigger('click')
    expect(document.activeElement).toBe(wrapper.get('[role="combobox"]').element)
  })

  it('zurdi: the panel enters with the softer bk-pop-soft transition (no overshoot), not the punchier bk-pop reserved for celebrations/branding', async () => {
    // VTU stubea <Transition> por defecto: hay que desactivarlo para ver la
    // clase de verdad (mismo patrón que BkSheet.spec.ts)
    wrapper = mount(BkSelect, {
      props: { label: 'Choose', modelValue: 'a', options: OPTIONS },
      global: { plugins: [createI18nInstance()], stubs: { transition: false } },
      attachTo: document.body,
    })
    await wrapper.get('[role="combobox"]').trigger('click')

    const panel = document.querySelector('[role="listbox"]')!.parentElement as HTMLElement
    expect(panel.classList.contains('bk-pop-soft-enter-active')).toBe(true)
    expect(panel.classList.contains('bk-pop-enter-active')).toBe(false)
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

  // C1: el foco real (document.activeElement), no solo dispatch a mano sobre
  // el nodo consultado — así un futuro regreso al bug de foco muerto (el que
  // sí tenían BkTimeField/BkDateField) lo detectaría este archivo también.
  // El trigger se enfoca a mano primero (simula "el usuario llegó aquí con
  // Tab", que sí da foco real incluso en navegadores que no enfocan
  // <button> al hacer click — ver open_() en BkSelect.vue) y todas las
  // teclas se disparan sobre document.activeElement, nunca sobre `trigger`
  // directamente.
  it('ArrowDown opens the panel when closed, then moves aria-activedescendant to the next enabled option (skipping disabled)', async () => {
    wrapper = build({ modelValue: 'b' })
    const trigger = wrapper.get('[role="combobox"]')
    const triggerEl = trigger.element as HTMLElement
    triggerEl.focus()
    expect(document.activeElement).toBe(trigger.element)

    document.activeElement!.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true, cancelable: true }))
    await flushPromises()
    expect(document.querySelector('[role="listbox"]')).not.toBeNull()
    // arranca anclado a la opción actual (b)
    let activeId = trigger.attributes('aria-activedescendant')
    expect(document.getElementById(activeId!)?.textContent).toContain('Option B')

    // siguiente: c está disabled, así que salta directo a d
    document.activeElement!.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true, cancelable: true }))
    await flushPromises()
    activeId = trigger.attributes('aria-activedescendant')
    expect(document.getElementById(activeId!)?.textContent).toContain('Option D')
  })

  it('Home/End jump to the first/last enabled option', async () => {
    wrapper = build({ modelValue: 'b' })
    const trigger = wrapper.get('[role="combobox"]')
    ;(trigger.element as HTMLElement).focus()
    document.activeElement!.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true, cancelable: true }))
    await flushPromises()

    document.activeElement!.dispatchEvent(new KeyboardEvent('keydown', { key: 'End', bubbles: true, cancelable: true }))
    await flushPromises()
    let activeId = trigger.attributes('aria-activedescendant')
    expect(document.getElementById(activeId!)?.textContent).toContain('Option D')

    document.activeElement!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Home', bubbles: true, cancelable: true }))
    await flushPromises()
    activeId = trigger.attributes('aria-activedescendant')
    expect(document.getElementById(activeId!)?.textContent).toContain('Option A')
  })

  it('Enter commits the active option and returns focus to the trigger', async () => {
    wrapper = build({ modelValue: 'a' })
    const trigger = wrapper.get('[role="combobox"]')
    ;(trigger.element as HTMLElement).focus()
    document.activeElement!.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true, cancelable: true })) // abre, activa 'a'
    await flushPromises()
    document.activeElement!.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true, cancelable: true })) // mueve a 'b'
    await flushPromises()
    document.activeElement!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }))
    await flushPromises()

    expect(wrapper.emitted('update:modelValue')!.at(-1)).toEqual(['b'])
    expect(document.querySelector('[role="listbox"]')).toBeNull()
    expect(document.activeElement).toBe(trigger.element)
  })

  it('Escape closes the panel without emitting a selection change', async () => {
    wrapper = build({ modelValue: 'a' })
    const trigger = wrapper.get('[role="combobox"]')
    ;(trigger.element as HTMLElement).focus()
    document.activeElement!.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true, cancelable: true }))
    await flushPromises()
    document.activeElement!.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true, cancelable: true })) // activa 'b', sin confirmar
    await flushPromises()
    document.activeElement!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }))
    await flushPromises()

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
    ;(trigger.element as HTMLElement).focus()
    document.activeElement!.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true, cancelable: true })) // abre
    await flushPromises()

    document.activeElement!.dispatchEvent(new KeyboardEvent('keydown', { key: 'd', bubbles: true, cancelable: true }))
    await flushPromises()
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

  // side-fix 1 (round-7 re-review): Escape y "aplicar" ya devolvían el foco
  // al trigger al cerrar; el cierre por click-fuera se había quedado corto y
  // lo dejaba en el body — useFloatingPanel.ts ahora también lo restaura ahí
  it('side-fix 1: clicking outside returns real focus to the trigger, not the body', async () => {
    wrapper = build()
    const trigger = wrapper.get('[role="combobox"]')
    await trigger.trigger('click')
    expect(document.querySelector('[role="listbox"]')).not.toBeNull()

    document.body.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }))
    await flushPromises()

    expect(document.activeElement).toBe(trigger.element)
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

  it('I4: the settled flip decision uses the REAL measured panel height, not the fallback constant (which would have decided the opposite here)', async () => {
    // hueco debajo del trigger: 150px. Con el alto de RESERVA (256+8) NO
    // cabría debajo (decidiría "arriba"). Con el alto REAL de este panel
    // (4 opciones, ~90px) SÍ cabe debajo — si I4 no recalculara con la
    // medida real tras montar, esta prueba fallaría con "bottom" seteado
    // en vez de "top". (La corrección ocurre tan rápido tras abrir —
    // dentro del mismo nextTick que ya espera trigger('click') — que no es
    // observable un estado intermedio con la reserva: solo el asentado.)
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
      if (this.getAttribute('role') === 'combobox') {
        return { top: 620, bottom: 650, left: 10, right: 200, width: 190, height: 30, x: 10, y: 620, toJSON: () => {} } as DOMRect
      }
      // el panel (sin role propio — el role="listbox" vive en el <ul> hijo)
      return { top: 0, bottom: 90, left: 0, right: 200, width: 200, height: 90, x: 0, y: 0, toJSON: () => {} } as DOMRect
    })
    vi.stubGlobal('innerHeight', 800)

    wrapper = build()
    await wrapper.get('[role="combobox"]').trigger('click')
    await flushPromises()

    const panel = document.querySelector('[role="listbox"]')!.parentElement as HTMLElement
    expect(panel.style.top).not.toBe('')
    expect(panel.style.bottom).toBe('')

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

  it('I3: opening a filterable select moves REAL focus to the filter input (unreachable by keyboard otherwise); typing filters and ArrowDown+Enter selects', async () => {
    // fixture propia (en vez de "Zone N"): con prefijos distintos, filtrar
    // deja EXACTAMENTE 2 coincidencias y el resultado de ArrowDown+Enter es
    // inequívoco de leer, sin tener que rastrear el orden de "Zone 1/10..19"
    const options = [
      { value: 'other-0', label: 'Other 0' },
      { value: 'target-0', label: 'Target 0' },
      { value: 'target-1', label: 'Target 1' },
      ...Array.from({ length: 17 }, (_, i) => ({ value: `filler-${i}`, label: `Filler ${i}` })),
    ]
    wrapper = build({ options, modelValue: 'other-0' })
    await wrapper.get('[role="combobox"]').trigger('click')
    await flushPromises()

    const filterInput = document.querySelector('input[type="text"]') as HTMLInputElement
    expect(document.activeElement).toBe(filterInput)
    expect(filterInput.getAttribute('aria-controls')).toBe(document.querySelector('[role="listbox"]')!.id)

    filterInput.value = 'Target'
    filterInput.dispatchEvent(new Event('input', { bubbles: true }))
    await flushPromises()
    // el valor actual ('other-0') queda fuera del filtro: se re-ancla a la
    // primera coincidencia visible, "Target 0"
    expect(document.querySelectorAll('[role="option"]')).toHaveLength(2)

    document.activeElement!.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true, cancelable: true }))
    await flushPromises()
    document.activeElement!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }))
    await flushPromises()

    // re-anclado a "Target 0", un ArrowDown mueve a "Target 1", Enter la selecciona
    expect(wrapper.emitted('update:modelValue')!.at(-1)).toEqual(['target-1'])
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

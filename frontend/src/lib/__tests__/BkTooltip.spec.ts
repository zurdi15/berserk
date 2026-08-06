import { mount } from '@vue/test-utils'
import { afterEach, describe, expect, it } from 'vitest'

import BkTooltip from '../BkTooltip.vue'

function build(text = 'Pecho') {
  return mount(BkTooltip, {
    props: { text },
    slots: { default: '<span data-testid="trigger-content">rune</span>' },
    attachTo: document.body, // necesario: pointerdown-fuera se comprueba contra el DOM real
  })
}

describe('BkTooltip', () => {
  afterEach(() => {
    document.body.innerHTML = ''
  })

  it('renders the trigger as a real button with an accessible name, closed by default', () => {
    const wrapper = build('Pecho')
    const button = wrapper.find('button')
    expect(button.attributes('aria-label')).toBe('Pecho')
    expect(button.attributes('aria-describedby')).toBeUndefined()
    expect(document.querySelector('[role="tooltip"]')).toBeNull()
  })

  it('opens on click/tap, teleporting a role=tooltip bubble with the group text and wiring aria-describedby', async () => {
    const wrapper = build('Espalda')
    await wrapper.find('button').trigger('click')

    const bubble = document.querySelector('[role="tooltip"]')
    expect(bubble).not.toBeNull()
    expect(bubble!.textContent?.trim()).toBe('Espalda')
    expect(wrapper.find('button').attributes('aria-describedby')).toBe(bubble!.id)

    wrapper.unmount()
  })

  it('a second click/tap on the trigger closes it (toggle)', async () => {
    const wrapper = build()
    const button = wrapper.find('button')
    await button.trigger('click')
    expect(document.querySelector('[role="tooltip"]')).not.toBeNull()

    await button.trigger('click')
    expect(document.querySelector('[role="tooltip"]')).toBeNull()

    wrapper.unmount()
  })

  it('a pointerdown outside the trigger and bubble closes it', async () => {
    const wrapper = build()
    await wrapper.find('button').trigger('click')
    expect(document.querySelector('[role="tooltip"]')).not.toBeNull()

    document.body.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }))
    await wrapper.vm.$nextTick()
    expect(document.querySelector('[role="tooltip"]')).toBeNull()

    wrapper.unmount()
  })

  it('Escape closes it', async () => {
    const wrapper = build()
    await wrapper.find('button').trigger('click')
    expect(document.querySelector('[role="tooltip"]')).not.toBeNull()

    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    await wrapper.vm.$nextTick()
    expect(document.querySelector('[role="tooltip"]')).toBeNull()

    wrapper.unmount()
  })

  it('a native button activation (Enter while focused) fires the same click that opens it — no extra keyboard wiring needed', async () => {
    // el trigger es un <button> real: el navegador ya convierte foco+Enter/
    // Espacio en un evento click nativo (semántica HTML, no JS propio) —
    // aquí solo se comprueba que ESE evento (el que dispara la activación
    // por teclado) abre el tooltip, igual que un tap.
    const wrapper = build()
    const button = wrapper.find('button')
    button.element.focus()
    await button.trigger('click')
    expect(document.querySelector('[role="tooltip"]')).not.toBeNull()

    wrapper.unmount()
  })
})

import { mount, type VueWrapper } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { nextTick } from 'vue'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { createI18nInstance } from '../../i18n'
import { useToastStore } from '../../stores/toast'
import BkSheet from '../BkSheet.vue'
import BkToast from '../BkToast.vue'

describe('BkSheet', () => {
  let trigger: HTMLButtonElement | null = null

  afterEach(() => {
    trigger?.remove()
    trigger = null
  })

  it('moves focus into the panel on open and restores it on close', async () => {
    trigger = document.createElement('button')
    document.body.appendChild(trigger)
    trigger.focus()
    expect(document.activeElement).toBe(trigger)

    const wrapper = mount(BkSheet, {
      props: { open: false, title: 'Ajustes' },
      attachTo: document.body,
    })

    await wrapper.setProps({ open: true })
    await nextTick()
    await nextTick()

    const panel = document.querySelector('[role="dialog"]') as HTMLElement
    expect(panel).not.toBeNull()
    expect(panel.getAttribute('tabindex')).toBe('-1')
    expect(document.activeElement).toBe(panel)

    const title = panel.querySelector('h2') as HTMLElement
    expect(title.id).toBeTruthy()
    expect(panel.getAttribute('aria-labelledby')).toBe(title.id)

    await wrapper.setProps({ open: false })
    await nextTick()
    await nextTick()

    expect(document.activeElement).toBe(trigger)

    wrapper.unmount()
  })

  it('closes only the topmost sheet on Escape when sheets are stacked', async () => {
    // flujo real: sheet del editor de rutina, con el sheet de confirmar
    // borrado abierto encima — un solo Escape debe cerrar solo el de arriba
    const editor = mount(BkSheet, {
      props: { open: false, title: 'Editor' },
      attachTo: document.body,
    })
    await editor.setProps({ open: true })
    await nextTick()
    await nextTick()

    const confirm = mount(BkSheet, {
      props: { open: false, title: 'Confirmar borrado' },
      attachTo: document.body,
    })
    await confirm.setProps({ open: true })
    await nextTick()
    await nextTick()

    expect(document.querySelectorAll('[role="dialog"]').length).toBe(2)

    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    await nextTick()

    expect(confirm.emitted('close')).toHaveLength(1)
    expect(editor.emitted('close')).toBeUndefined()

    // el padre real reacciona al close cerrando el sheet de arriba, lo que
    // lo saca de la pila y deja el editor como tope
    await confirm.setProps({ open: false })
    await nextTick()
    await nextTick()

    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    await nextTick()

    expect(editor.emitted('close')).toHaveLength(1)

    editor.unmount()
    confirm.unmount()
  })
})

describe('BkToast', () => {
  let wrapper: VueWrapper | null = null

  beforeEach(() => {
    setActivePinia(createPinia())
  })

  afterEach(() => {
    wrapper?.unmount()
    wrapper = null
    vi.useRealTimers()
  })

  it('pauses auto-dismiss on hover and resumes it on mouse leave', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    const store = useToastStore()
    wrapper = mount(BkToast, {
      attachTo: document.body,
      global: { plugins: [createI18nInstance()] },
    })

    store.push('info', 'hola')
    await nextTick()
    expect(document.querySelector('output')).not.toBeNull()

    const toastEl = document.querySelector('output') as HTMLElement
    toastEl.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }))
    await nextTick()

    vi.advanceTimersByTime(5000)
    await nextTick()
    expect(document.querySelector('output')).not.toBeNull()

    toastEl.dispatchEvent(new MouseEvent('mouseleave', { bubbles: true }))
    await nextTick()

    vi.advanceTimersByTime(4000)
    await nextTick()
    expect(document.querySelector('output')).toBeNull()
  })

  it('renders a focusable dismiss button that dismisses the toast on click', async () => {
    const store = useToastStore()
    const dismissSpy = vi.spyOn(store, 'dismiss')
    wrapper = mount(BkToast, {
      attachTo: document.body,
      global: { plugins: [createI18nInstance()] },
    })

    store.push('error', 'boom')
    await nextTick()
    const toastId = store.toasts[0].id

    const dismissButton = document.querySelector('button[aria-label="Cerrar aviso"]') as HTMLButtonElement
    expect(dismissButton).not.toBeNull()

    dismissButton.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await nextTick()

    expect(dismissSpy).toHaveBeenCalledWith(toastId)
    expect(document.querySelector('output')).toBeNull()
  })
})

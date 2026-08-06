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

  it('emits close on Escape when mounted already open (v-if-style consumer)', async () => {
    // algunos consumidores montan el sheet directamente con open=true (p.ej.
    // detrás de un v-if del padre) en vez de open:false → true; sin
    // immediate:true en el watcher, este id nunca entraba en sheetStack y
    // Escape se lo comía en silencio
    const wrapper = mount(BkSheet, {
      props: { open: true, title: 'Ya abierto' },
      attachTo: document.body,
    })
    await nextTick()
    await nextTick()

    expect(document.querySelector('[role="dialog"]')).not.toBeNull()

    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    await nextTick()

    expect(wrapper.emitted('close')).toHaveLength(1)

    wrapper.unmount()
  })

  // item 4: excepción documentada al doctrine "solo entrada" — el sheet
  // anima también al cerrarse (ver el comentario en BkSheet.vue). Vue Test
  // Utils stubea <Transition> por defecto (sin eso, nunca se ven las clases
  // ni corren los hooks) así que estos dos tests lo desactivan explícitamente
  // para observar el comportamiento real.
  it('item 4: applies the sheet-specific enter transition classes to panel and backdrop on open', async () => {
    const wrapper = mount(BkSheet, {
      props: { open: false, title: 'Con animación' },
      attachTo: document.body,
      global: { stubs: { transition: false } },
    })

    await wrapper.setProps({ open: true })
    await nextTick()

    const panel = document.querySelector('[role="dialog"]') as HTMLElement
    expect(panel.classList.contains('bk-sheet-panel-enter-active')).toBe(true)

    const backdrop = document.querySelector('.bg-void\\/70') as HTMLElement
    expect(backdrop.classList.contains('bk-sheet-backdrop-enter-active')).toBe(true)

    wrapper.unmount()
  })

  it('item 4: initiates the leave transition on close (visual only — close still emits immediately) and the panel eventually detaches', async () => {
    const wrapper = mount(BkSheet, {
      props: { open: true, title: 'Con animación' },
      attachTo: document.body,
      global: { stubs: { transition: false } },
    })
    await nextTick()
    await nextTick()

    await wrapper.setProps({ open: false })

    // la salida es solo visual: el panel sigue montado un instante con la
    // clase de leave mientras se desliza hacia abajo — @close ya se emitió
    // de inmediato en cuanto el padre puso open=false, sin esperar a esto
    const leavingPanel = document.querySelector('[role="dialog"]') as HTMLElement
    expect(leavingPanel).not.toBeNull()
    expect(leavingPanel.classList.contains('bk-sheet-panel-leave-active')).toBe(true)

    await vi.waitFor(
      () => {
        expect(document.querySelector('[role="dialog"]')).toBeNull()
      },
      { timeout: 1000 },
    )

    wrapper.unmount()
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

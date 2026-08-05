import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import { afterEach, describe, expect, it } from 'vitest'

import BkSheet from '../BkSheet.vue'

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
})

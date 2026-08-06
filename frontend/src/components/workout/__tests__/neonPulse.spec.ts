import { mount } from '@vue/test-utils'
import { afterEach, describe, expect, it } from 'vitest'

import NeonPulse from '../NeonPulse.vue'

// se teletransporta a document.body (mismo patrón que BkCelebration/BkSheet):
// hay que buscarlo ahí y limpiar el body tras cada test
describe('NeonPulse (item 9)', () => {
  afterEach(() => {
    document.body.innerHTML = ''
  })

  it('renders nothing when show is false', () => {
    mount(NeonPulse, { props: { show: false } })
    expect(document.body.querySelector('[data-testid="neon-pulse"]')).toBeNull()
  })

  it('renders the fixed, pointer-events-none overlay when show is true', () => {
    mount(NeonPulse, { props: { show: true } })
    const el = document.body.querySelector('[data-testid="neon-pulse"]')
    expect(el).not.toBeNull()
    expect(el?.className).toContain('pointer-events-none')
    expect(el?.className).toContain('bk-neon-pulse')
    expect(el?.getAttribute('aria-hidden')).toBe('true')
  })

  it('emits done when the CSS animation ends', () => {
    const wrapper = mount(NeonPulse, { props: { show: true } })
    const el = document.body.querySelector('[data-testid="neon-pulse"]') as HTMLElement
    el.dispatchEvent(new Event('animationend'))
    expect(wrapper.emitted('done')).toHaveLength(1)
  })
})

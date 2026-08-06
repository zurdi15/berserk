import { mount } from '@vue/test-utils'
import { afterEach, describe, expect, it } from 'vitest'

import NeonPulse from '../NeonPulse.vue'

// se teletransporta a document.body (mismo patrón que BkCelebration/BkSheet):
// hay que buscarlo ahí y limpiar el body tras cada test
describe('NeonPulse (item 2: aurora de dos estelas)', () => {
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
    expect(el?.getAttribute('aria-hidden')).toBe('true')
  })

  it('renders the four streak segments (two lateral risers + two top closers) with their edge classes', () => {
    mount(NeonPulse, { props: { show: true } })
    const left = document.body.querySelector('[data-testid="neon-pulse-left"]')
    const right = document.body.querySelector('[data-testid="neon-pulse-right"]')
    const topA = document.body.querySelector('[data-testid="neon-pulse-top-a"]')
    const topB = document.body.querySelector('[data-testid="neon-pulse-top-b"]')

    expect(left?.className).toContain('bk-neon-streak')
    expect(left?.className).toContain('bk-neon-edge-left')
    expect(right?.className).toContain('bk-neon-edge-right')
    expect(topA?.className).toContain('bk-neon-edge-top-a')
    expect(topB?.className).toContain('bk-neon-edge-top-b')
  })

  it('emits done exactly once when the final segment (top-a) finishes its animation', () => {
    const wrapper = mount(NeonPulse, { props: { show: true } })
    const el = document.body.querySelector('[data-testid="neon-pulse-top-a"]') as HTMLElement
    el.dispatchEvent(new Event('animationend'))
    expect(wrapper.emitted('done')).toHaveLength(1)
  })

  it('does not emit done from the lateral segments finishing (only the top-a handoff closes the cycle)', () => {
    const wrapper = mount(NeonPulse, { props: { show: true } })
    const left = document.body.querySelector('[data-testid="neon-pulse-left"]') as HTMLElement
    left.dispatchEvent(new Event('animationend'))
    expect(wrapper.emitted('done')).toBeUndefined()
  })
})

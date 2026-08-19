import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'

import BkAnimatedText from '../BkAnimatedText.vue'

// v0.24.3 — texto letra a letra (el análogo textual del roll numérico)
describe('BkAnimatedText', () => {
  it('renders one staggered letter span per character, aria-hidden, with the real text as aria-label', () => {
    const wrapper = mount(BkAnimatedText, { props: { text: 'Tirón' } })
    const letters = wrapper.findAll('.bk-letter-in')
    expect(letters).toHaveLength(5)
    expect(letters.every((l) => l.attributes('aria-hidden') === 'true')).toBe(true)
    expect(letters[0].attributes('style')).toContain('--bk-letter-delay: 0ms')
    expect(letters[4].attributes('style')).toContain('--bk-letter-delay: 104ms')
    expect(wrapper.attributes('aria-label')).toBe('Tirón')
  })

  it('spaces become nbsp (an inline-block span with a plain space collapses)', () => {
    const wrapper = mount(BkAnimatedText, { props: { text: 'a b' } })
    expect(wrapper.findAll('.bk-letter-in')[1].element.textContent).toBe('\u00a0')
  })

  it('a text change re-keys every letter so the cascade replays', async () => {
    const wrapper = mount(BkAnimatedText, { props: { text: 'ab' } })
    const before = wrapper.findAll('.bk-letter-in')[0].element
    await wrapper.setProps({ text: 'cd' })
    const after = wrapper.findAll('.bk-letter-in')[0].element
    expect(after).not.toBe(before)
    expect(wrapper.text()).toBe('cd')
  })
})

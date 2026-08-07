import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'

import BkUser from '../BkUser.vue'

describe('BkUser', () => {
  it('renders the username and a dot colored with user.color', () => {
    const wrapper = mount(BkUser, {
      props: { user: { username: 'freyr', color: '#7C8FFF' } },
    })

    expect(wrapper.text()).toContain('freyr')
    const dot = wrapper.get('[data-testid="bk-user-dot"]')
    expect((dot.element as HTMLElement).style.backgroundColor).toBe('#7C8FFF')
  })

  it('falls back to the aurora accent token when user.color is null/undefined', () => {
    const withNull = mount(BkUser, { props: { user: { username: 'loki', color: null } } })
    expect((withNull.get('[data-testid="bk-user-dot"]').element as HTMLElement).style.backgroundColor).toBe(
      'var(--bk-accent-aurora)',
    )

    const withUndefined = mount(BkUser, { props: { user: { username: 'sif' } } })
    expect((withUndefined.get('[data-testid="bk-user-dot"]').element as HTMLElement).style.backgroundColor).toBe(
      'var(--bk-accent-aurora)',
    )
  })

  it('defaults to size md (w-2.5 dot, text-sm name) and switches to sm when requested', () => {
    const md = mount(BkUser, { props: { user: { username: 'freyja' } } })
    expect(md.get('[data-testid="bk-user-dot"]').classes()).toContain('w-2.5')
    expect(md.find('span.truncate').classes()).toContain('text-sm')

    const sm = mount(BkUser, { props: { user: { username: 'freyja' }, size: 'sm' } })
    expect(sm.get('[data-testid="bk-user-dot"]').classes()).toContain('w-2')
    expect(sm.find('span.truncate').classes()).toContain('text-xs')
  })

  it('the dot is aria-hidden (decorative; the username text is the accessible content)', () => {
    const wrapper = mount(BkUser, { props: { user: { username: 'thor' } } })
    expect(wrapper.get('[data-testid="bk-user-dot"]').attributes('aria-hidden')).toBe('true')
  })
})

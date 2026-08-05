import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'

import { createI18nInstance } from '../../i18n'
import ShellView from '../ShellView.vue'

describe('ShellView nav', () => {
  it('has desktop navbar (hidden sm:flex) with identity and navigation', () => {
    const wrapper = mount(ShellView, {
      global: {
        plugins: [createI18nInstance()],
        stubs: { RouterView: true, RouterLink: true },
      },
    })
    const headers = wrapper.findAll('header')
    expect(headers).toHaveLength(2)
    // desktop header
    const desktopHeader = headers[0]
    expect(desktopHeader.classes()).toContain('hidden')
    expect(desktopHeader.classes()).toContain('sm:flex')
    const desktopNav = desktopHeader.find('nav')
    expect(desktopNav.attributes('aria-label')).toBe('Navegación principal')
  })

  it('has mobile identity header and bottom nav', () => {
    const wrapper = mount(ShellView, {
      global: {
        plugins: [createI18nInstance()],
        stubs: { RouterView: true, RouterLink: true },
      },
    })
    const headers = wrapper.findAll('header')
    // mobile identity header
    const mobileHeader = headers[1]
    expect(mobileHeader.classes()).toContain('sm:hidden')
    const navs = wrapper.findAll('nav')
    expect(navs).toHaveLength(2)
    // mobile bottom nav
    const mobileNav = navs[1]
    expect(mobileNav.attributes('aria-label')).toBe('Navegación principal')
    expect(mobileNav.classes()).toContain('sm:hidden')
  })
})

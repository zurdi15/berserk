import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'

import { createI18nInstance } from '../../i18n'
import ShellView from '../ShellView.vue'

describe('ShellView nav', () => {
  it('has desktop nav bar (hidden sm:block) centered with vertical-stack items', () => {
    const wrapper = mount(ShellView, {
      global: {
        plugins: [createI18nInstance()],
        stubs: { RouterView: true, RouterLink: true },
      },
    })
    const headers = wrapper.findAll('header')
    expect(headers).toHaveLength(2)
    // desktop header: centered nav bar, no identity block (por ahora)
    const desktopHeader = headers[0]
    expect(desktopHeader.classes()).toContain('hidden')
    expect(desktopHeader.classes()).toContain('sm:block')
    const desktopNav = desktopHeader.find('nav')
    expect(desktopNav.attributes('aria-label')).toBe('Navegación principal')
    // desktop nav ul is centered
    const ul = desktopNav.find('ul')
    expect(ul.classes()).toContain('flex')
    expect(ul.classes()).toContain('justify-center')
    const listItems = ul.findAll('li')
    expect(listItems.length).toBeGreaterThan(0)
  })

  it('has mobile identity header and fixed bottom nav', () => {
    const wrapper = mount(ShellView, {
      global: {
        plugins: [createI18nInstance()],
        stubs: { RouterView: true, RouterLink: true },
      },
    })
    const headers = wrapper.findAll('header')
    expect(headers).toHaveLength(2)
    // mobile identity header: rune + wordmark
    const mobileHeader = headers[1]
    expect(mobileHeader.classes()).toContain('sm:hidden')
    const navs = wrapper.findAll('nav')
    expect(navs).toHaveLength(2)
    // mobile bottom nav: fixed, sm:hidden, icon on top label below
    const mobileNav = navs[1]
    expect(mobileNav.attributes('aria-label')).toBe('Navegación principal')
    expect(mobileNav.classes()).toContain('sm:hidden')
    expect(mobileNav.classes()).toContain('fixed')
    const ul = mobileNav.find('ul')
    const listItems = ul.findAll('li')
    expect(listItems.length).toBeGreaterThan(0)
  })
})

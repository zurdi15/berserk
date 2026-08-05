import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'

import { createI18nInstance } from '../../i18n'
import ShellView from '../ShellView.vue'

describe('ShellView nav', () => {
  it('labels the bottom nav with a dedicated i18n key and drops the dead desktop classes', () => {
    const wrapper = mount(ShellView, {
      global: {
        plugins: [createI18nInstance()],
        stubs: { RouterView: true, RouterLink: true },
      },
    })
    const nav = wrapper.find('nav')
    expect(nav.attributes('aria-label')).toBe('Navegación principal')
    // sm:hidden se quitó (la nav inferior ahora es visible también en desktop de forma interina)
    expect(nav.classes()).not.toContain('sm:hidden')
    expect(nav.classes()).not.toContain('sm:static')
    expect(nav.classes()).not.toContain('sm:border-t-0')
    expect(nav.classes()).not.toContain('sm:bg-transparent')
    expect(nav.classes()).not.toContain('sm:pb-0')
    expect(nav.classes()).not.toContain('sm:order-first')
  })
})

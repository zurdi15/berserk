import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'

import { createI18nInstance } from '../../i18n'
import ShellView from '../ShellView.vue'

describe('ShellView nav', () => {
  it('labels the nav with a dedicated i18n key and applies responsive desktop layout classes', () => {
    const wrapper = mount(ShellView, {
      global: {
        plugins: [createI18nInstance()],
        stubs: { RouterView: true, RouterLink: true },
      },
    })
    const nav = wrapper.find('nav')
    expect(nav.attributes('aria-label')).toBe('Navegación principal')
    // la nav fluye bajo la cabecera como fila de pestañas en desktop
    expect(nav.classes()).toContain('sm:static')
    expect(nav.classes()).toContain('sm:border-t-0')
    expect(nav.classes()).toContain('sm:border-b')
    expect(nav.classes()).toContain('sm:bg-transparent')
    expect(nav.classes()).toContain('sm:pb-0')
    expect(nav.classes()).not.toContain('sm:hidden')
    expect(nav.classes()).not.toContain('sm:order-first')
  })
})

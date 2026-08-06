import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const push = vi.fn()
vi.mock('vue-router', () => ({
  useRouter: () => ({ push }),
}))

import { createI18nInstance } from '@/i18n'
import LoginView from '../LoginView.vue'

function build() {
  return mount(LoginView, {
    global: { plugins: [createI18nInstance()] },
  })
}

describe('LoginView', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    push.mockClear()
  })

  // item 6 (post-0.3.0): el <main> es el único nodo raíz de la plantilla —
  // el gutter/scrollbar permanente que hacía "scroll" en un contenido que
  // cabe de sobra vivía en el html (ver base.css), no aquí; gap-6 (antes
  // gap-8) es margen extra de seguridad para viewports realmente cortos
  it('item 6: the root fits one viewport (min-h-dvh) with the tightened gap-6, and never opts out of scroll via overflow-hidden', () => {
    const wrapper = build()
    const root = wrapper.get('main')
    expect(root.classes()).toContain('min-h-dvh')
    expect(root.classes()).toContain('gap-6')
    expect(root.classes()).not.toContain('gap-8')
    expect(root.classes()).not.toContain('overflow-hidden')
  })

  it('renders the brand rune and the login form', () => {
    const wrapper = build()
    expect(wrapper.findComponent({ name: 'BkRune' }).exists()).toBe(true)
    expect(wrapper.find('form').exists()).toBe(true)
    expect(wrapper.findAll('input')).toHaveLength(2)
  })
})

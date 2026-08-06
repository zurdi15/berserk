import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'

import { createI18nInstance } from '@/i18n'
import BkEmpty from '../BkEmpty.vue'

function build(props: Partial<InstanceType<typeof BkEmpty>['$props']> = {}) {
  return mount(BkEmpty, {
    props: { message: 'Nada por aquí', ...props },
    global: { plugins: [createI18nInstance()] },
  })
}

describe('BkEmpty (item 10: unified empty state)', () => {
  it('renders the rune and the message, with no action button by default', () => {
    const wrapper = build()
    expect(wrapper.findComponent({ name: 'BkRune' }).exists()).toBe(true)
    expect(wrapper.text()).toContain('Nada por aquí')
    expect(wrapper.find('[data-testid="empty-action-btn"]').exists()).toBe(false)
  })

  it('renders a primary action button below the message when actionLabel is given, and emits "action" on click', async () => {
    const wrapper = build({ actionLabel: 'Crear algo' })
    const btn = wrapper.get('[data-testid="empty-action-btn"]')
    expect(btn.text()).toBe('Crear algo')
    expect(btn.classes()).toContain('bg-aurora-deep') // variant=primary

    await btn.trigger('click')
    expect(wrapper.emitted('action')).toHaveLength(1)
  })

  it('the action button uses a consumer-provided data-testid when given, so consumers keep their existing test hooks', () => {
    const wrapper = build({ actionLabel: 'Nueva rutina', actionTestid: 'new-routine-btn' })
    expect(wrapper.find('[data-testid="new-routine-btn"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="empty-action-btn"]').exists()).toBe(false)
  })
})

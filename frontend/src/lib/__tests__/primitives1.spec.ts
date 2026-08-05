import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'

import BkButton from '../BkButton.vue'
import BkField from '../BkField.vue'

describe('BkButton', () => {
  it('renders slot and emits click', async () => {
    const wrapper = mount(BkButton, { slots: { default: 'Entrar' } })
    expect(wrapper.text()).toBe('Entrar')
    await wrapper.trigger('click')
    expect(wrapper.emitted('click')).toBeTruthy()
  })

  it('blocks interaction while loading', () => {
    const wrapper = mount(BkButton, { props: { loading: true } })
    expect(wrapper.attributes('disabled')).toBeDefined()
    expect(wrapper.attributes('aria-busy')).toBe('true')
  })
})

describe('BkField', () => {
  it('binds v-model and shows error', async () => {
    const wrapper = mount(BkField, {
      props: { label: 'Usuario', modelValue: '', error: 'errors.invalid_credentials' },
    })
    await wrapper.find('input').setValue('thor')
    expect(wrapper.emitted('update:modelValue')![0]).toEqual(['thor'])
    expect(wrapper.text()).toContain('errors.invalid_credentials')
    expect(wrapper.find('input').attributes('aria-invalid')).toBe('true')
  })
})

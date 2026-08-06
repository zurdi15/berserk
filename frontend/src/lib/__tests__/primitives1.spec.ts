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

  // item 2 (round 9): la etiqueta vive DENTRO del campo como placeholder,
  // no como texto visible arriba — el nombre accesible no puede depender
  // solo del placeholder (desaparece al escribir), así que también va a
  // aria-label
  it('item 2: the label feeds the placeholder AND aria-label, with no visible label text above the field', () => {
    const wrapper = mount(BkField, {
      props: { label: 'Buscar ejercicio', modelValue: '' },
    })
    const input = wrapper.get('input')
    expect(input.attributes('placeholder')).toBe('Buscar ejercicio')
    expect(input.attributes('aria-label')).toBe('Buscar ejercicio')
    // ningún <label>/<span> visible con el texto de la etiqueta por fuera del input
    expect(wrapper.find('label').exists()).toBe(false)
    expect(wrapper.text()).not.toContain('Buscar ejercicio')
  })

  it('item 1: the input carries bk-form-control, so it gets the single-border focus treatment instead of stacking the global ring', () => {
    const wrapper = mount(BkField, { props: { label: 'Usuario', modelValue: '' } })
    expect(wrapper.get('input').classes()).toContain('bk-form-control')
  })
})

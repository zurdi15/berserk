import { mount } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'

import BkActionBtn from '../BkActionBtn.vue'

describe('BkActionBtn', () => {
  it('renders a pencil icon (two paths, no circle) for icon="edit"', () => {
    const wrapper = mount(BkActionBtn, {
      props: { icon: 'edit' },
      attrs: { 'aria-label': 'Editar' },
    })

    const svg = wrapper.find('svg')
    expect(svg.exists()).toBe(true)
    expect(svg.findAll('path')).toHaveLength(2)
    expect(svg.find('circle').exists()).toBe(false)
  })

  it('renders the key icon (circle + jagged path) for icon="key", reusing AdminCard\'s original icon', () => {
    const wrapper = mount(BkActionBtn, {
      props: { icon: 'key' },
      attrs: { 'aria-label': 'Restablecer contraseña' },
    })

    const svg = wrapper.find('svg')
    expect(svg.find('circle').exists()).toBe(true)
    expect(svg.find('path').attributes('d')).toBe('M9.5 12 L20 12 M15 12 L15 15 M19 12 L19 16')
  })

  it('renders an X icon (single crossing path, no circle) for icon="delete"', () => {
    const wrapper = mount(BkActionBtn, {
      props: { icon: 'delete' },
      attrs: { 'aria-label': 'Borrar' },
    })

    const svg = wrapper.find('svg')
    expect(svg.findAll('path')).toHaveLength(1)
    expect(svg.find('path').attributes('d')).toBe('M6 6 L18 18 M18 6 L6 18')
    expect(svg.find('circle').exists()).toBe(false)
  })

  it('v0.3.0 item 5: renders a crossed-circle icon (circle + ONE diagonal path, unlike delete\'s two crossing paths) for icon="skip"', () => {
    const wrapper = mount(BkActionBtn, {
      props: { icon: 'skip' },
      attrs: { 'aria-label': 'Omitir' },
    })

    const svg = wrapper.find('svg')
    expect(svg.find('circle').exists()).toBe(true)
    expect(svg.findAll('path')).toHaveLength(1)
    expect(svg.find('path').attributes('d')).toBe('M6 6 L18 18')
  })

  it('v0.3.0 item 5: renders a circular-arrow icon (two paths, no circle) for icon="replan"', () => {
    const wrapper = mount(BkActionBtn, {
      props: { icon: 'replan' },
      attrs: { 'aria-label': 'Replanificar' },
    })

    const svg = wrapper.find('svg')
    expect(svg.find('circle').exists()).toBe(false)
    expect(svg.findAll('path')).toHaveLength(2)
    expect(svg.find('circle').exists()).toBe(false)
  })

  it('v0.3.2: renders two overlapping rounded rects (no circle, no crossing path) for icon="copy"', () => {
    const wrapper = mount(BkActionBtn, {
      props: { icon: 'copy' },
      attrs: { 'aria-label': 'Copiar' },
    })

    const svg = wrapper.find('svg')
    expect(svg.findAll('rect')).toHaveLength(2)
    expect(svg.find('circle').exists()).toBe(false)
    expect(svg.find('path').exists()).toBe(false)
  })

  it('v0.3.2: icon="copy" gets the ink-muted styling, not danger', () => {
    const wrapper = mount(BkActionBtn, {
      props: { icon: 'copy' },
      attrs: { 'aria-label': 'Copiar' },
    })
    expect(wrapper.find('button').classes()).toContain('text-ink-muted')
    expect(wrapper.find('button').classes()).not.toContain('text-danger')
  })

  it('v0.3.0 item 5: skip and replan get the ink-muted styling, same as edit/key (only delete is danger)', () => {
    const skipBtn = mount(BkActionBtn, {
      props: { icon: 'skip' },
      attrs: { 'aria-label': 'Omitir' },
    })
    expect(skipBtn.find('button').classes()).toContain('text-ink-muted')
    expect(skipBtn.find('button').classes()).not.toContain('text-danger')

    const replanBtn = mount(BkActionBtn, {
      props: { icon: 'replan' },
      attrs: { 'aria-label': 'Replanificar' },
    })
    expect(replanBtn.find('button').classes()).toContain('text-ink-muted')
    expect(replanBtn.find('button').classes()).not.toContain('text-danger')
  })

  it('is a single square button (w-8 h-8) with a type="button" root and a ~w-4 h-4 icon, regardless of variant', () => {
    const wrapper = mount(BkActionBtn, {
      props: { icon: 'edit' },
      attrs: { 'aria-label': 'Editar' },
    })

    const button = wrapper.find('button')
    expect(button.attributes('type')).toBe('button')
    expect(button.classes()).toContain('w-8')
    expect(button.classes()).toContain('h-8')
    expect(wrapper.find('svg').classes()).toContain('w-4')
    expect(wrapper.find('svg').classes()).toContain('h-4')
  })

  it('forwards the consumer-provided aria-label onto the button (icon-only: it is the only accessible name)', () => {
    // aria-label es obligatorio por contrato pero NO es una prop de
    // defineProps (ver el comentario en BkActionBtn.vue: Vue excluye los
    // atributos aria-* del emparejamiento kebab→camelCase con props), así
    // que aquí se pasa como atributo (fallthrough), igual que en un consumo
    // real por template (`:aria-label="..."`)
    const wrapper = mount(BkActionBtn, {
      props: { icon: 'edit' },
      attrs: { 'aria-label': 'Editar entrada' },
    })

    expect(wrapper.find('button').attributes('aria-label')).toBe('Editar entrada')
  })

  it('gives icon="delete" danger styling (text-danger), distinct from the ink-muted styling of edit/key', () => {
    const deleteBtn = mount(BkActionBtn, {
      props: { icon: 'delete' },
      attrs: { 'aria-label': 'Borrar' },
    })
    expect(deleteBtn.find('button').classes()).toContain('text-danger')
    expect(deleteBtn.find('button').classes()).not.toContain('text-ink-muted')

    const editBtn = mount(BkActionBtn, {
      props: { icon: 'edit' },
      attrs: { 'aria-label': 'Editar' },
    })
    expect(editBtn.find('button').classes()).toContain('text-ink-muted')
    expect(editBtn.find('button').classes()).not.toContain('text-danger')

    const keyBtn = mount(BkActionBtn, {
      props: { icon: 'key' },
      attrs: { 'aria-label': 'Llave' },
    })
    expect(keyBtn.find('button').classes()).toContain('text-ink-muted')
    expect(keyBtn.find('button').classes()).not.toContain('text-danger')
  })

  it('emits a native click through to a listener bound by the consumer', async () => {
    const onClick = vi.fn()
    const wrapper = mount(BkActionBtn, {
      props: { icon: 'delete' },
      attrs: { 'aria-label': 'Borrar', onClick },
    })

    await wrapper.find('button').trigger('click')

    expect(onClick).toHaveBeenCalledTimes(1)
  })
})

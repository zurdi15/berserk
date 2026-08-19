import { mount, RouterLinkStub } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'

import BkCheck from '../BkCheck.vue'
import BkChip from '../BkChip.vue'
import BkHero from '../BkHero.vue'
import BkListRow from '../BkListRow.vue'
import BkMedia from '../BkMedia.vue'
import BkSegmentedProgress from '../BkSegmentedProgress.vue'

// primitivas nuevas del facelift — ver el plan del rediseño: BkChip extrae
// el chip inline repetido, BkMedia es la pieza "fotos protagonistas" con
// fallback rúnico, BkCheck el check grande de serie, BkSegmentedProgress la
// barra por bloques del player, BkListRow la fila de hub/listas y BkHero el
// hero con scrim.

describe('BkChip', () => {
  it('renders a span by default and a button when interactive', () => {
    expect(mount(BkChip, { slots: { default: 'PG' } }).element.tagName).toBe('SPAN')
    const btn = mount(BkChip, { props: { interactive: true }, slots: { default: 'PG' } })
    expect(btn.element.tagName).toBe('BUTTON')
    expect(btn.attributes('type')).toBe('button')
    expect(btn.classes()).toContain('bk-press')
  })

  it('active neutral paints the historical aurora trio (border/text/bg)', () => {
    const wrapper = mount(BkChip, { props: { active: true } })
    for (const cls of ['border-aurora', 'text-aurora', 'bg-aurora/10']) {
      expect(wrapper.classes()).toContain(cls)
    }
  })

  it('md keeps the literal chip shape other specs assert on (rounded-full border px-2.5 py-1 transition-colors)', () => {
    const wrapper = mount(BkChip)
    expect(wrapper.classes()).toEqual(
      expect.arrayContaining(['rounded-full', 'border', 'px-2.5', 'py-1', 'transition-colors']),
    )
  })

  it('falls attrs through to the root (testid + aria)', () => {
    const wrapper = mount(BkChip, {
      props: { interactive: true },
      attrs: { 'data-testid': 'mi-chip', 'aria-pressed': 'true' },
    })
    expect(wrapper.attributes('data-testid')).toBe('mi-chip')
    expect(wrapper.attributes('aria-pressed')).toBe('true')
  })
})

describe('BkMedia', () => {
  it('renders the exercise image when has_image, via exerciseImageUrl', () => {
    const wrapper = mount(BkMedia, { props: { exercise: { id: 7, has_image: true } } })
    const img = wrapper.find('img')
    expect(img.exists()).toBe(true)
    expect(img.attributes('src')).toBe('/api/v1/exercises/7/image')
    expect(img.attributes('loading')).toBe('lazy')
  })

  it('falls back to the rune well when the exercise has no image', () => {
    const wrapper = mount(BkMedia, { props: { exercise: { id: 7, has_image: false }, rune: 'chest' } })
    expect(wrapper.find('img').exists()).toBe(false)
    expect(wrapper.find('svg').exists()).toBe(true)
  })

  it('flips to the rune fallback when the <img> errors (stale has_image)', async () => {
    const wrapper = mount(BkMedia, { props: { exercise: { id: 7, has_image: true } } })
    await wrapper.find('img').trigger('error')
    expect(wrapper.find('img').exists()).toBe(false)
    expect(wrapper.find('svg').exists()).toBe(true)
  })

  it('an explicit src wins over the exercise', () => {
    const wrapper = mount(BkMedia, {
      props: { exercise: { id: 7, has_image: true }, src: '/api/v1/body/photos/3/file' },
    })
    expect(wrapper.find('img').attributes('src')).toBe('/api/v1/body/photos/3/file')
  })

  it('a null rune (primaryRune sin mapeo) falls back to the house bindrune, not to nothing', () => {
    const wrapper = mount(BkMedia, { props: { rune: null } })
    expect(wrapper.find('svg').exists()).toBe(true)
  })
})

describe('BkHero', () => {
  it('paints the scrim gradient overlay and the bottom content slot', () => {
    const wrapper = mount(BkHero, { slots: { default: '<p>Hoy toca</p>' } })
    expect(wrapper.html()).toContain('from-scrim')
    expect(wrapper.text()).toContain('Hoy toca')
  })

  it('flush drops the rounded corner for full-bleed use', () => {
    expect(mount(BkHero).classes()).toContain('rounded-xl')
    expect(mount(BkHero, { props: { flush: true } }).classes()).not.toContain('rounded-xl')
  })
})

describe('BkSegmentedProgress', () => {
  const segments = [
    { done: 2, total: 2, label: 'Calentamiento' },
    { done: 1, total: 4, label: 'Fuerza' },
  ]

  it('is a progressbar over the summed totals', () => {
    const wrapper = mount(BkSegmentedProgress, { props: { segments, current: 1 } })
    expect(wrapper.attributes('role')).toBe('progressbar')
    expect(wrapper.attributes('aria-valuenow')).toBe('3')
    expect(wrapper.attributes('aria-valuemax')).toBe('6')
  })

  it('renders one button per segment with the configurable testid prefix and emits select', async () => {
    const wrapper = mount(BkSegmentedProgress, {
      props: { segments, current: 0, testidPrefix: 'block-step' },
    })
    const second = wrapper.find('[data-testid="block-step-1"]')
    expect(second.exists()).toBe(true)
    await second.trigger('click')
    expect(wrapper.emitted('select')![0]).toEqual([1])
  })

  it('marks only the current segment as pressed and fills fractions', () => {
    const wrapper = mount(BkSegmentedProgress, { props: { segments, current: 1 } })
    const buttons = wrapper.findAll('button')
    expect(buttons[0].attributes('aria-pressed')).toBe('false')
    expect(buttons[1].attributes('aria-pressed')).toBe('true')
    expect(buttons[0].html()).toContain('width: 100%')
    expect(buttons[1].html()).toContain('width: 25%')
  })
})

describe('BkCheck', () => {
  it('is a custom checkbox button, never a native input (noNativeFormControls)', () => {
    const wrapper = mount(BkCheck, { props: { modelValue: false } })
    expect(wrapper.element.tagName).toBe('BUTTON')
    expect(wrapper.attributes('role')).toBe('checkbox')
    expect(wrapper.attributes('aria-checked')).toBe('false')
    expect(wrapper.find('input').exists()).toBe(false)
  })

  it('toggles via update:modelValue and draws the tick only when checked', async () => {
    const wrapper = mount(BkCheck, { props: { modelValue: false } })
    expect(wrapper.find('svg').exists()).toBe(false)
    await wrapper.trigger('click')
    expect(wrapper.emitted('update:modelValue')![0]).toEqual([true])

    const checked = mount(BkCheck, { props: { modelValue: true } })
    expect(checked.attributes('aria-checked')).toBe('true')
    expect(checked.find('svg path').classes()).toContain('bk-check-stroke')
    expect(checked.classes()).toContain('bk-check-pop')
  })

  it('disabled blocks the toggle', async () => {
    const wrapper = mount(BkCheck, { props: { modelValue: false, disabled: true } })
    await wrapper.trigger('click')
    expect(wrapper.emitted('update:modelValue')).toBeUndefined()
  })
})

describe('BkListRow', () => {
  it('renders a button with label/sublabel and optional chevron', () => {
    const wrapper = mount(BkListRow, {
      props: { label: 'Rutinas', sublabel: '3 activas', chevron: true },
    })
    expect(wrapper.element.tagName).toBe('BUTTON')
    expect(wrapper.text()).toContain('Rutinas')
    expect(wrapper.text()).toContain('3 activas')
    expect(wrapper.find('svg').exists()).toBe(true)
  })

  it('renders a RouterLink when `to` is given', () => {
    const wrapper = mount(BkListRow, {
      props: { label: 'Perfil', to: '/profile' },
      global: { stubs: { RouterLink: RouterLinkStub } },
    })
    expect(wrapper.findComponent(RouterLinkStub).props('to')).toBe('/profile')
  })

  it('shows the rune well when a rune is given', () => {
    const wrapper = mount(BkListRow, { props: { label: 'Pecho', rune: 'chest' } })
    expect(wrapper.find('svg').exists()).toBe(true)
  })
})

describe('BkRadio', () => {
  it('is a custom radio button (role=radio) that emits select on click', async () => {
    const { default: BkRadio } = await import('../BkRadio.vue')
    const wrapper = mount(BkRadio, { props: { checked: false } })
    expect(wrapper.element.tagName).toBe('BUTTON')
    expect(wrapper.attributes('role')).toBe('radio')
    expect(wrapper.attributes('aria-checked')).toBe('false')
    await wrapper.trigger('click')
    expect(wrapper.emitted('select')).toBeTruthy()

    const checked = mount(BkRadio, { props: { checked: true } })
    expect(checked.attributes('aria-checked')).toBe('true')
    // el punto interior solo existe marcado
    expect(checked.find('span').exists()).toBe(true)
  })
})

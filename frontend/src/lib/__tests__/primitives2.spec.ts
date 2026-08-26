import { mount } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'

import { createI18nInstance } from '../../i18n'
import BkRing from '../BkRing.vue'
import BkRune from '../BkRune.vue'
import BkStepper from '../BkStepper.vue'
import { FUTHARK_RUNE_NAMES, RUNES, RUNE_SEQUENCES } from '../runes'

describe('runes catalog', () => {
  it('has the logo, the 7 muscle groups and the achievement/nav runes', () => {
    // item 4 (round 9): +sowilo/+dagaz (nav de Hoy/Perfil) — streak y
    // shoulders se quedan (StreakCard y el catálogo de grupos musculares
    // siguen usándolos), el nav solo cambió a qué runa apunta
    expect(Object.keys(RUNES).sort()).toEqual(
      [
        'back', 'berserk', 'biceps', 'chest', 'core', 'dagaz', 'legs', 'pr',
        'shoulders', 'sowilo', 'streak', 'triceps',
        // v0.3.0: futhark antiguo completo (menos sowilo/dagaz, ya listadas
        // arriba) para el selector de rutinas — ver FUTHARK_24 más abajo
        'fehu', 'uruz', 'thurisaz', 'ansuz', 'raidho', 'kenaz', 'gebo',
        'wunjo', 'hagalaz', 'nauthiz', 'isa', 'jera', 'eihwaz', 'perthro',
        'algiz', 'tiwaz', 'berkano', 'ehwaz', 'mannaz', 'laguz', 'ingwaz',
        'othala',
      ].sort(),
    )
    for (const d of Object.values(RUNES)) {
      expect(d).toMatch(/^M[\d\s.]/) // path data válido que empieza con moveto
    }
  })

  it('v0.3.0: contains all 24 Elder Futhark runes by name, for the routine picker', () => {
    for (const name of FUTHARK_RUNE_NAMES) {
      expect(Object.keys(RUNES)).toContain(name)
    }
    expect(FUTHARK_RUNE_NAMES).toHaveLength(24)
    expect(new Set(FUTHARK_RUNE_NAMES).size).toBe(24) // sin nombres repetidos
  })

  it('v0.3.0: tiwaz reuses the pr glyph verbatim (same canonical Týr shape, two names)', () => {
    expect(RUNES.tiwaz).toBe(RUNES.pr)
  })

  it('item 4: pr has no underline stroke below the Tyr glyph (round 9 — shared by the Progresión nav and PR-list icons)', () => {
    expect(RUNES.pr).toBe('M16 4 L16 28 M8 10 L16 4 L24 10')
    expect(RUNES.pr).not.toContain('M10 28')
  })

  it('item 4: sowilo and dagaz render as single, non-sequenced carved paths', () => {
    const sowilo = mount(BkRune, { props: { name: 'sowilo', carve: true } })
    expect(sowilo.findAll('path')).toHaveLength(1)
    expect(sowilo.find('path').attributes('d')).toBe(RUNES.sowilo)
    expect(sowilo.find('path').classes()).toContain('bk-carve-stroke')

    const dagaz = mount(BkRune, { props: { name: 'dagaz', carve: true } })
    expect(dagaz.findAll('path')).toHaveLength(1)
    expect(dagaz.find('path').attributes('d')).toBe(RUNES.dagaz)
    expect(dagaz.find('path').classes()).toContain('bk-carve-stroke')
  })
})

describe('BkRune', () => {
  it('renders the named path with carve animation class', () => {
    const wrapper = mount(BkRune, { props: { name: 'chest', carve: true } })
    expect(wrapper.find('path').attributes('d')).toBe(RUNES.chest)
    expect(wrapper.find('path').classes()).toContain('bk-carve-stroke')
  })

  it('renders sequenced berserk carve with 3 phases at constant speed (linear, halved duration, proportional)', () => {
    const wrapper = mount(BkRune, { props: { name: 'berserk', carve: true } })
    const paths = wrapper.findAll('path')
    expect(paths).toHaveLength(3)
    // Each phase should have bk-carve-stroke, proportional duration/delay (halved), and linear easing
    paths.forEach((path, i) => {
      expect(path.classes()).toContain('bk-carve-stroke')
      expect(path.attributes('d')).toBe(RUNE_SEQUENCES.berserk![i])
      const style = path.attributes('style') || ''
      // Proportional durations at half speed: calc(var(--bk-dur-5) / 2 * <ratio>)
      expect(style).toMatch(/animation-duration:\s*calc\(var\(--bk-dur-5\)\s*\/\s*2\s*\*\s*[\d.]+\)/)
      // Staggered delays at half speed: calc(var(--bk-dur-5) / 2 * <cumulative-ratio>)
      expect(style).toMatch(/animation-delay:\s*calc\(var\(--bk-dur-5\)\s*\/\s*2\s*\*\s*[\d.]+\)/)
      // Constant speed: linear easing
      expect(style).toContain('animation-timing-function: var(--bk-ease-linear)')
    })
  })

  it('renders non-sequenced runes with carve as a single path', () => {
    const wrapper = mount(BkRune, { props: { name: 'shoulders', carve: true } })
    const paths = wrapper.findAll('path')
    expect(paths).toHaveLength(1)
    expect(paths[0].attributes('d')).toBe(RUNES.shoulders)
    expect(paths[0].classes()).toContain('bk-carve-stroke')
  })
})

describe('BkStepper', () => {
  it('increments and clamps to bounds', async () => {
    const wrapper = mount(BkStepper, {
      props: { modelValue: 99, step: 1, max: 100, min: 0 },
      global: { plugins: [createI18nInstance()] },
    })
    const [minus, plus] = wrapper.findAll('button')
    await plus.trigger('pointerdown')
    await plus.trigger('pointerup')
    expect(wrapper.emitted('update:modelValue')!.at(-1)).toEqual([100])
    await wrapper.setProps({ modelValue: 100 })
    await plus.trigger('pointerdown')
    await plus.trigger('pointerup')
    expect(wrapper.emitted('update:modelValue')!.at(-1)).toEqual([100]) // clamped
    await minus.trigger('pointerdown')
    await minus.trigger('pointerup')
    expect(wrapper.emitted('update:modelValue')!.at(-1)).toEqual([99])
  })

  // v0.39.3: un puntero cancelado (el WebView se queda el gesto como scroll)
  // no manda pointerup, y la repetición de mantener pulsado se quedaba viva
  // hasta desplomar el valor al mínimo — con su PATCH por tic
  it('stops the hold-to-repeat when the pointer is cancelled', async () => {
    vi.useFakeTimers()
    try {
      const wrapper = mount(BkStepper, {
        props: { modelValue: 60, step: 5, min: 5, max: 900 },
        global: { plugins: [createI18nInstance()] },
      })
      const [minus] = wrapper.findAll('button')
      await minus.trigger('pointerdown')
      await minus.trigger('pointercancel')
      const emittedAfterCancel = wrapper.emitted('update:modelValue')!.length
      vi.advanceTimersByTime(2000)
      expect(wrapper.emitted('update:modelValue')!).toHaveLength(emittedAfterCancel)
    } finally {
      vi.useRealTimers()
    }
  })

  it('applies a single step on keyboard activation (click with detail 0)', async () => {
    const wrapper = mount(BkStepper, {
      props: { modelValue: 5 },
      global: { plugins: [createI18nInstance()] },
    })
    const [, plus] = wrapper.findAll('button')
    // Enter/Space sintetizan un click con detail 0: sin pointerdown/up de por medio
    await plus.trigger('click', { detail: 0 })
    expect(wrapper.emitted('update:modelValue')!.at(-1)).toEqual([6])
  })

  it('does not double-apply a real pointer click (detail > 0)', async () => {
    const wrapper = mount(BkStepper, {
      props: { modelValue: 5 },
      global: { plugins: [createI18nInstance()] },
    })
    const [, plus] = wrapper.findAll('button')
    await plus.trigger('pointerdown')
    await plus.trigger('pointerup')
    await plus.trigger('click', { detail: 1 })
    expect(wrapper.emitted('update:modelValue')!.at(-1)).toEqual([6])
  })

  // v0.17.1 (zurdi: "que se pueda editar directamente para poner literalmente
  // cualquier peso, con punto o coma"): entrada directa tocando el valor
  describe('editable (v0.17.1)', () => {
    function buildEditable(props: Record<string, unknown> = {}) {
      return mount(BkStepper, {
        props: { modelValue: 20, step: 2.5, min: 2.5, max: 500, suffix: 'kg', editable: true, ...props },
        global: { plugins: [createI18nInstance()] },
      })
    }

    it('renders the value as a button that opens a decimal input on click', async () => {
      const wrapper = buildEditable()
      const valueBtn = wrapper.get('[data-testid="stepper-edit"]')
      expect(valueBtn.text()).toContain('20')
      await valueBtn.trigger('click')
      const input = wrapper.get('[data-testid="stepper-edit-input"]')
      expect(input.attributes('inputmode')).toBe('decimal')
      expect((input.element as HTMLInputElement).value).toBe('20')
    })

    it('accepts a comma as decimal separator (82,5 → 82.5)', async () => {
      const wrapper = buildEditable()
      await wrapper.get('[data-testid="stepper-edit"]').trigger('click')
      const input = wrapper.get('[data-testid="stepper-edit-input"]')
      await input.setValue('82,5')
      await input.trigger('keydown', { key: 'Enter' })
      expect(wrapper.emitted('update:modelValue')!.at(-1)).toEqual([82.5])
    })

    it('accepts a dot too, and values off the step grid (43.7)', async () => {
      const wrapper = buildEditable()
      await wrapper.get('[data-testid="stepper-edit"]').trigger('click')
      const input = wrapper.get('[data-testid="stepper-edit-input"]')
      await input.setValue('43.7')
      await input.trigger('blur')
      expect(wrapper.emitted('update:modelValue')!.at(-1)).toEqual([43.7])
    })

    it('clamps typed values to min/max like the +/- taps', async () => {
      const wrapper = buildEditable()
      await wrapper.get('[data-testid="stepper-edit"]').trigger('click')
      const input = wrapper.get('[data-testid="stepper-edit-input"]')
      await input.setValue('9999')
      await input.trigger('keydown', { key: 'Enter' })
      expect(wrapper.emitted('update:modelValue')!.at(-1)).toEqual([500])
    })

    it('ignores garbage and empty input (no emit), and Escape cancels', async () => {
      const wrapper = buildEditable()
      await wrapper.get('[data-testid="stepper-edit"]').trigger('click')
      const input = wrapper.get('[data-testid="stepper-edit-input"]')
      await input.setValue('8kg2')
      await input.trigger('keydown', { key: 'Enter' })
      expect(wrapper.emitted('update:modelValue')).toBeUndefined()

      await wrapper.get('[data-testid="stepper-edit"]').trigger('click')
      const input2 = wrapper.get('[data-testid="stepper-edit-input"]')
      await input2.setValue('90')
      await input2.trigger('keydown', { key: 'Escape' })
      expect(wrapper.emitted('update:modelValue')).toBeUndefined()
      // el botón vuelve con el valor original
      expect(wrapper.get('[data-testid="stepper-edit"]').text()).toContain('20')
    })

    it('Enter commits once even though the input blur fires right after (guard)', async () => {
      const wrapper = buildEditable()
      await wrapper.get('[data-testid="stepper-edit"]').trigger('click')
      const input = wrapper.get('[data-testid="stepper-edit-input"]')
      await input.setValue('100')
      await input.trigger('keydown', { key: 'Enter' })
      await input.trigger('blur')
      expect(wrapper.emitted('update:modelValue')).toHaveLength(1)
    })

    it('a non-editable stepper keeps the plain span (no value button)', () => {
      const wrapper = mount(BkStepper, {
        props: { modelValue: 20 },
        global: { plugins: [createI18nInstance()] },
      })
      expect(wrapper.find('[data-testid="stepper-edit"]').exists()).toBe(false)
      expect(wrapper.findAll('button')).toHaveLength(2)
    })
  })

  it('labels the buttons via i18n', () => {
    const wrapper = mount(BkStepper, {
      props: { modelValue: 5 },
      global: { plugins: [createI18nInstance()] },
    })
    const [minus, plus] = wrapper.findAll('button')
    expect(minus.attributes('aria-label')).toBe('Reducir')
    expect(plus.attributes('aria-label')).toBe('Aumentar')
  })

  it('defaults to size "md" (unchanged footprint for existing consumers like RoutineEditorSheet)', () => {
    const wrapper = mount(BkStepper, {
      props: { modelValue: 5 },
      global: { plugins: [createI18nInstance()] },
    })
    const [minus] = wrapper.findAll('button')
    expect(minus.classes()).toEqual(expect.arrayContaining(['w-12', 'h-12']))
  })

  it('item 2 (post-0.3.0): size="compact" shrinks the buttons (fits two steppers side by side in the set drawer)', () => {
    const wrapper = mount(BkStepper, {
      props: { modelValue: 5, size: 'compact' },
      global: { plugins: [createI18nInstance()] },
    })
    const [minus, plus] = wrapper.findAll('button')
    expect(minus.classes()).toEqual(expect.arrayContaining(['w-8', 'h-8']))
    expect(plus.classes()).toEqual(expect.arrayContaining(['w-8', 'h-8']))
    expect(minus.classes()).not.toContain('w-12')
  })

  // item 11 (v0.4.3, zurdi): "−"/"+" pinned a los bordes del contenedor
  // (w-full + justify-between), el valor centrado entre los dos — un valor
  // más ancho (p.ej. "22.5" frente a "20") ya no desplaza los botones,
  // porque su posición depende del CONTENEDOR, no del texto del valor.
  it('item 11: root spans the full width and distributes children edge-to-edge (justify-between)', () => {
    const wrapper = mount(BkStepper, {
      props: { modelValue: 5 },
      global: { plugins: [createI18nInstance()] },
    })
    expect(wrapper.classes()).toEqual(expect.arrayContaining(['w-full', 'flex', 'items-center', 'justify-between']))
  })

  it('item 11: both buttons carry shrink-0 (fixed square size, never compressed by a wide value at narrow widths)', () => {
    const wrapper = mount(BkStepper, {
      props: { modelValue: 5 },
      global: { plugins: [createI18nInstance()] },
    })
    const [minus, plus] = wrapper.findAll('button')
    expect(minus.classes()).toContain('shrink-0')
    expect(plus.classes()).toContain('shrink-0')
  })

  it('item 11: the value span carries no fixed/min width — its footprint no longer needs to be pre-sized to keep the buttons still', () => {
    const wrapper = mount(BkStepper, {
      props: { modelValue: 5 },
      global: { plugins: [createI18nInstance()] },
    })
    const value = wrapper.get('.bk-metric')
    expect(value.classes()).not.toContain('min-w-11')
    expect(value.classes()).not.toContain('min-w-16')
  })

  it('item 11: a value that grows wider (x.5) never moves the buttons out of their DOM position — the layout model (edge-pinning), not the value width, keeps them still', async () => {
    const wrapper = mount(BkStepper, {
      props: { modelValue: 20, step: 2.5 },
      global: { plugins: [createI18nInstance()] },
    })
    const buttonsBefore = wrapper.findAll('button').map((b) => b.classes().join(' '))
    await wrapper.setProps({ modelValue: 22.5 })
    const buttonsAfter = wrapper.findAll('button').map((b) => b.classes().join(' '))
    // las clases (y por tanto el tamaño/posición estructural) de los
    // botones son IDÉNTICAS antes y después: nada en su propio markup
    // reacciona al ancho del valor — la estabilidad pixel-real la da el
    // modelo de layout (edge-to-edge), no un ajuste por valor
    expect(buttonsAfter).toEqual(buttonsBefore)
  })
})

describe('BkRing', () => {
  it('computes dashoffset from value', () => {
    const wrapper = mount(BkRing, { props: { value: 0.25, size: 48, stroke: 4 } })
    const circle = wrapper.findAll('circle')[1]
    const radius = (48 - 4) / 2
    const circumference = 2 * Math.PI * radius
    expect(Number(circle.attributes('stroke-dashoffset'))).toBeCloseTo(circumference * 0.75, 1)
  })
})

import { mount, type VueWrapper } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { Measurement } from '@/api/domain'
import { createI18nInstance } from '@/i18n'
import { displayToKg } from '@/utils/units'
import SetForm from '../SetForm.vue'

function build(measurement: string, units?: 'kg' | 'lb') {
  setActivePinia(createPinia())
  return mount(SetForm, {
    // measurement viaja como Measurement en producción; aquí se castea en el
    // harness (no se afloja el tipo del componente) para simular valores libres
    props: { measurement: measurement as Measurement, units },
    global: { plugins: [createI18nInstance()] },
  })
}

describe('SetForm', () => {
  // M9: el test de rpe abre un panel flotante real (BkSelect) que se
  // registra en la pila de capas COMPARTIDA (layerStack.ts) — aunque hoy se
  // cierra solo (seleccionar una opción cierra el panel), un afterEach que
  // desmonta es la red de seguridad correcta para cualquier test futuro que
  // abra uno y no llegue a cerrarlo antes de terminar
  let wrapper: VueWrapper | null = null

  beforeEach(() => setActivePinia(createPinia()))
  afterEach(() => {
    wrapper?.unmount()
    wrapper = null
  })

  it('strength emits reps + weight_kg', async () => {
    wrapper = build('strength')
    await wrapper.find('form').trigger('submit')
    const payload = wrapper.emitted('submit')![0][0] as Record<string, unknown>
    expect(payload).toMatchObject({ is_warmup: false })
    expect(payload.reps).toBeGreaterThan(0)
    expect(payload.weight_kg).toBeGreaterThan(0)
    expect(payload.duration_seconds).toBeUndefined()
  })

  it('timed emits only duration', async () => {
    wrapper = build('timed')
    await wrapper.find('form').trigger('submit')
    const payload = wrapper.emitted('submit')![0][0] as Record<string, unknown>
    expect(payload.duration_seconds).toBeGreaterThan(0)
    expect(payload.reps).toBeUndefined()
    expect(payload.weight_kg).toBeUndefined()
  })

  it('bodyweight emits reps only by default (optional weight omitted)', async () => {
    wrapper = build('bodyweight')
    await wrapper.find('form').trigger('submit')
    const payload = wrapper.emitted('submit')![0][0] as Record<string, unknown>
    expect(payload.reps).toBeGreaterThan(0)
    expect(payload.weight_kg).toBeUndefined()
    expect(payload.duration_seconds).toBeUndefined()
  })

  it('bodyweight includes weight_kg once bumped above zero', async () => {
    wrapper = build('bodyweight')
    const plus = wrapper.findAll('button[aria-label="Aumentar"]')[1]
    await plus.trigger('click', { detail: 0 })
    await wrapper.find('form').trigger('submit')
    const payload = wrapper.emitted('submit')![0][0] as Record<string, unknown>
    expect(payload.weight_kg).toBeGreaterThan(0)
  })

  it('cardio emits duration only by default (optional distance omitted)', async () => {
    wrapper = build('cardio')
    await wrapper.find('form').trigger('submit')
    const payload = wrapper.emitted('submit')![0][0] as Record<string, unknown>
    expect(payload.duration_seconds).toBeGreaterThan(0)
    expect(payload.distance_m).toBeUndefined()
    expect(payload.reps).toBeUndefined()
    expect(payload.weight_kg).toBeUndefined()
  })

  it('cardio includes distance_m once bumped above zero', async () => {
    wrapper = build('cardio')
    const plus = wrapper.findAll('button[aria-label="Aumentar"]')[1]
    await plus.trigger('click', { detail: 0 })
    await wrapper.find('form').trigger('submit')
    const payload = wrapper.emitted('submit')![0][0] as Record<string, unknown>
    expect(payload.distance_m).toBeGreaterThan(0)
  })

  it('warmup toggle marks the set as warmup', async () => {
    wrapper = build('strength')
    await wrapper.find('[data-testid="warmup-toggle"]').trigger('click')
    await wrapper.find('form').trigger('submit')
    const payload = wrapper.emitted('submit')![0][0] as Record<string, unknown>
    expect(payload.is_warmup).toBe(true)
  })

  it('resets the warmup toggle back to false after logging a set', async () => {
    wrapper = build('strength')
    const toggle = wrapper.find('[data-testid="warmup-toggle"]')
    await toggle.trigger('click')
    await wrapper.find('form').trigger('submit')
    expect(toggle.attributes('aria-pressed')).toBe('false')
    await wrapper.find('form').trigger('submit')
    const payload = wrapper.emitted('submit')![1][0] as Record<string, unknown>
    expect(payload.is_warmup).toBe(false)
  })

  it('rpe select includes the chosen value in the payload', async () => {
    // BkSelect v2 (round 7): listbox propio, no <select> nativo — abrir y
    // hacer click real sobre la opción "8"
    wrapper = build('strength')
    await wrapper.find('[role="combobox"]').trigger('click')
    const option8 = Array.from(document.querySelectorAll('[role="option"]'))
      .find((o) => o.textContent?.trim() === '8') as HTMLElement
    expect(option8).not.toBeUndefined()
    option8.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await wrapper.vm.$nextTick()

    await wrapper.find('form').trigger('submit')
    const payload = wrapper.emitted('submit')![0][0] as Record<string, unknown>
    expect(payload.rpe).toBe(8)
  })

  it('rpe defaults to undefined when left at the empty placeholder option', async () => {
    wrapper = build('strength')
    await wrapper.find('form').trigger('submit')
    const payload = wrapper.emitted('submit')![0][0] as Record<string, unknown>
    expect(payload.rpe).toBeUndefined()
  })

  it('item 4e: the rpe placeholder option has no em/en-dash label (zurdi: "quita el m-dash")', () => {
    wrapper = build('strength')
    expect(wrapper.text()).not.toMatch(/[—–]/)
  })

  it('keeps entered values as defaults for the next set', async () => {
    wrapper = build('strength')
    await wrapper.find('form').trigger('submit')
    const first = wrapper.emitted('submit')![0][0] as Record<string, unknown>

    const plus = wrapper.findAll('button[aria-label="Aumentar"]')[0]
    await plus.trigger('click', { detail: 0 })
    await wrapper.find('form').trigger('submit')
    const second = wrapper.emitted('submit')![1][0] as Record<string, unknown>

    expect(second.weight_kg).toBe((first.weight_kg as number) + 2.5)
    expect(second.reps).toBe(first.reps)
  })

  it('displays the forwarded units prop as the weight stepper suffix', () => {
    wrapper = build('strength', 'lb')
    expect(wrapper.text()).toContain('lb')
  })

  it('reps stepper clamps at the backend minimum of 1 (ge=1)', async () => {
    wrapper = build('strength')
    const minus = wrapper.findAll('button[aria-label="Reducir"]')[1]
    for (let i = 0; i < 10; i++) {
      await minus.trigger('click', { detail: 0 })
    }
    await wrapper.find('form').trigger('submit')
    const payload = wrapper.emitted('submit')!.at(-1)![0] as Record<string, unknown>
    expect(payload.reps).toBe(1)
  })

  it('strength weight stepper clamps at the backend minimum of 2.5 (gt=0)', async () => {
    wrapper = build('strength')
    const minus = wrapper.findAll('button[aria-label="Reducir"]')[0]
    for (let i = 0; i < 10; i++) {
      await minus.trigger('click', { detail: 0 })
    }
    await wrapper.find('form').trigger('submit')
    const payload = wrapper.emitted('submit')!.at(-1)![0] as Record<string, unknown>
    expect(payload.weight_kg).toBe(2.5)
  })

  it('timed duration stepper clamps at the backend minimum of 1 (ge=1)', async () => {
    wrapper = build('timed')
    const minus = wrapper.findAll('button[aria-label="Reducir"]')[0]
    for (let i = 0; i < 5; i++) {
      await minus.trigger('click', { detail: 0 })
    }
    await wrapper.find('form').trigger('submit')
    const payload = wrapper.emitted('submit')!.at(-1)![0] as Record<string, unknown>
    expect(payload.duration_seconds).toBe(1)
  })

  it('lb mode: weight stepper starts at a natural 45 with a natural step of 5, not a kg-space value', async () => {
    wrapper = build('strength', 'lb')
    expect(wrapper.text()).toContain('45')

    const plus = wrapper.findAll('button[aria-label="Aumentar"]')[0]
    await plus.trigger('click', { detail: 0 })
    await wrapper.find('form').trigger('submit')
    const payload = wrapper.emitted('submit')![0][0] as Record<string, unknown>
    expect(payload.weight_kg).toBe(displayToKg(50, 'lb'))
  })

  it('logs a console warning and emits nothing for an unknown measurement (defensive default)', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    wrapper = build('unknown-measurement')
    await wrapper.find('form').trigger('submit')
    expect(wrapper.emitted('submit')).toBeFalsy()
    expect(warnSpy).toHaveBeenCalled()
    warnSpy.mockRestore()
  })

  // v0.3.2 CARDIO-COUNTDOWN PERSISTENCE: SetForm es quien conoce
  // duration_seconds/distance_m en el instante justo de arrancar el
  // countdown — emite la señal mínima para que WorkoutExerciseCard (quien
  // conoce workoutId/workoutExerciseId) pueda persistirlo (ver uiPrefs.ts)
  describe('item 7 / CARDIO-COUNTDOWN PERSISTENCE: countdown start/cancel signals', () => {
    it('emits countdownStart with the current targetSeconds when "Empezar" is clicked (distanceM omitted, still at 0)', async () => {
      wrapper = build('cardio')
      await wrapper.get('[data-testid="cardio-start-countdown"]').trigger('click')

      expect(wrapper.emitted('countdownStart')).toHaveLength(1)
      const payload = wrapper.emitted('countdownStart')![0][0] as Record<string, unknown>
      expect(payload.targetSeconds).toBeGreaterThan(0)
      expect(payload.distanceM).toBeUndefined()
    })

    it('emits countdownStart with distanceM once bumped above zero', async () => {
      wrapper = build('cardio')
      const plus = wrapper.findAll('button[aria-label="Aumentar"]')[1]
      await plus.trigger('click', { detail: 0 })
      await wrapper.get('[data-testid="cardio-start-countdown"]').trigger('click')

      const payload = wrapper.emitted('countdownStart')![0][0] as Record<string, unknown>
      expect(payload.distanceM).toBeGreaterThan(0)
    })

    it('emits countdownCancel (without countdownStart again) when the running countdown is cancelled', async () => {
      wrapper = build('cardio')
      await wrapper.get('[data-testid="cardio-start-countdown"]').trigger('click')
      await wrapper.get('[data-testid="cardio-countdown-cancel"]').trigger('click')

      expect(wrapper.emitted('countdownCancel')).toHaveLength(1)
      expect(wrapper.emitted('countdownStart')).toHaveLength(1)
    })
  })

  describe('item 4: drawer layout', () => {
    it('item 4a: the form content is centered (flex-col items-center)', () => {
      wrapper = build('strength')
      const form = wrapper.get('form')
      expect(form.classes()).toEqual(expect.arrayContaining(['flex', 'flex-col', 'items-center']))
    })

    it('item 4b: weight and reps are laid out as a stable two-column grid (never flex-wrap) for strength', () => {
      wrapper = build('strength')
      const grid = wrapper.get('.grid.grid-cols-2')
      expect(grid.classes()).toEqual(expect.arrayContaining(['grid', 'grid-cols-2']))
      const columns = Array.from(grid.element.children)
      expect(columns).toHaveLength(2)
      for (const column of columns) expect(column.classList.contains('min-w-0')).toBe(true)
    })

    it('item 4b: reps and (optional) weight are also a two-column grid for bodyweight', () => {
      wrapper = build('bodyweight')
      const grid = wrapper.get('.grid.grid-cols-2')
      expect(grid.classes()).toEqual(expect.arrayContaining(['grid', 'grid-cols-2']))
    })

    it('item 4b: duration and distance are a two-column grid for cardio', () => {
      wrapper = build('cardio')
      const grid = wrapper.get('.grid.grid-cols-2')
      expect(grid.classes()).toEqual(expect.arrayContaining(['grid', 'grid-cols-2']))
    })

    it('item 2 (post-0.3.0): the strength/bodyweight/cardio steppers render compact (fits two columns from 360px, no overlap)', () => {
      // ambos steppers de la rejilla pasan size="compact" — sin esto, los
      // botones a tamaño "md" (3rem) + el gap por defecto no caben dos
      // columnas en un móvil real (ver la aritmética en SetForm.vue)
      for (const measurement of ['strength', 'bodyweight', 'cardio'] as const) {
        wrapper = build(measurement)
        const gridButtons = wrapper.get('.grid.grid-cols-2').findAll('button')
        expect(gridButtons.length).toBeGreaterThan(0)
        for (const button of gridButtons) {
          expect(button.classes()).toEqual(expect.arrayContaining(['w-8', 'h-8']))
          expect(button.classes()).not.toContain('w-12')
        }
        wrapper.unmount()
      }
    })

    it('item 2 (post-0.3.0): the strength grid uses the tighter gap-2 (not the old gap-3) between columns', () => {
      wrapper = build('strength')
      const grid = wrapper.get('.grid.grid-cols-2')
      expect(grid.classes()).toContain('gap-2')
      expect(grid.classes()).not.toContain('gap-3')
    })

    it('item 4c: the warmup toggle sits on its own row, not sharing a flex row with the rpe select', () => {
      wrapper = build('strength')
      const toggle = wrapper.get('[data-testid="warmup-toggle"]')
      // el padre directo del toggle es ahora el <form> (flex-col): ya no
      // comparte un contenedor flex-row con el select de rpe
      expect(toggle.element.parentElement?.tagName).toBe('FORM')
    })
  })
})

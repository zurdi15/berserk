import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { Measurement } from '@/api/domain'
import { createI18nInstance } from '@/i18n'
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
  beforeEach(() => setActivePinia(createPinia()))

  it('strength emits reps + weight_kg', async () => {
    const wrapper = build('strength')
    await wrapper.find('form').trigger('submit')
    const payload = wrapper.emitted('submit')![0][0] as Record<string, unknown>
    expect(payload).toMatchObject({ is_warmup: false })
    expect(payload.reps).toBeGreaterThan(0)
    expect(payload.weight_kg).toBeGreaterThan(0)
    expect(payload.duration_seconds).toBeUndefined()
  })

  it('timed emits only duration', async () => {
    const wrapper = build('timed')
    await wrapper.find('form').trigger('submit')
    const payload = wrapper.emitted('submit')![0][0] as Record<string, unknown>
    expect(payload.duration_seconds).toBeGreaterThan(0)
    expect(payload.reps).toBeUndefined()
    expect(payload.weight_kg).toBeUndefined()
  })

  it('bodyweight emits reps only by default (optional weight omitted)', async () => {
    const wrapper = build('bodyweight')
    await wrapper.find('form').trigger('submit')
    const payload = wrapper.emitted('submit')![0][0] as Record<string, unknown>
    expect(payload.reps).toBeGreaterThan(0)
    expect(payload.weight_kg).toBeUndefined()
    expect(payload.duration_seconds).toBeUndefined()
  })

  it('bodyweight includes weight_kg once bumped above zero', async () => {
    const wrapper = build('bodyweight')
    const plus = wrapper.findAll('button[aria-label="Aumentar"]')[1]
    await plus.trigger('click', { detail: 0 })
    await wrapper.find('form').trigger('submit')
    const payload = wrapper.emitted('submit')![0][0] as Record<string, unknown>
    expect(payload.weight_kg).toBeGreaterThan(0)
  })

  it('cardio emits duration only by default (optional distance omitted)', async () => {
    const wrapper = build('cardio')
    await wrapper.find('form').trigger('submit')
    const payload = wrapper.emitted('submit')![0][0] as Record<string, unknown>
    expect(payload.duration_seconds).toBeGreaterThan(0)
    expect(payload.distance_m).toBeUndefined()
    expect(payload.reps).toBeUndefined()
    expect(payload.weight_kg).toBeUndefined()
  })

  it('cardio includes distance_m once bumped above zero', async () => {
    const wrapper = build('cardio')
    const plus = wrapper.findAll('button[aria-label="Aumentar"]')[1]
    await plus.trigger('click', { detail: 0 })
    await wrapper.find('form').trigger('submit')
    const payload = wrapper.emitted('submit')![0][0] as Record<string, unknown>
    expect(payload.distance_m).toBeGreaterThan(0)
  })

  it('warmup toggle marks the set as warmup', async () => {
    const wrapper = build('strength')
    await wrapper.find('[data-testid="warmup-toggle"]').trigger('click')
    await wrapper.find('form').trigger('submit')
    const payload = wrapper.emitted('submit')![0][0] as Record<string, unknown>
    expect(payload.is_warmup).toBe(true)
  })

  it('resets the warmup toggle back to false after logging a set', async () => {
    const wrapper = build('strength')
    const toggle = wrapper.find('[data-testid="warmup-toggle"]')
    await toggle.trigger('click')
    await wrapper.find('form').trigger('submit')
    expect(toggle.attributes('aria-pressed')).toBe('false')
    await wrapper.find('form').trigger('submit')
    const payload = wrapper.emitted('submit')![1][0] as Record<string, unknown>
    expect(payload.is_warmup).toBe(false)
  })

  it('rpe select includes the chosen value in the payload', async () => {
    const wrapper = build('strength')
    await wrapper.find('select').setValue('8')
    await wrapper.find('form').trigger('submit')
    const payload = wrapper.emitted('submit')![0][0] as Record<string, unknown>
    expect(payload.rpe).toBe(8)
  })

  it('rpe defaults to undefined when left at "—"', async () => {
    const wrapper = build('strength')
    await wrapper.find('form').trigger('submit')
    const payload = wrapper.emitted('submit')![0][0] as Record<string, unknown>
    expect(payload.rpe).toBeUndefined()
  })

  it('keeps entered values as defaults for the next set', async () => {
    const wrapper = build('strength')
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
    const wrapper = build('strength', 'lb')
    expect(wrapper.text()).toContain('lb')
  })

  it('reps stepper clamps at the backend minimum of 1 (ge=1)', async () => {
    const wrapper = build('strength')
    const minus = wrapper.findAll('button[aria-label="Reducir"]')[1]
    for (let i = 0; i < 10; i++) {
      await minus.trigger('click', { detail: 0 })
    }
    await wrapper.find('form').trigger('submit')
    const payload = wrapper.emitted('submit')!.at(-1)![0] as Record<string, unknown>
    expect(payload.reps).toBe(1)
  })

  it('strength weight stepper clamps at the backend minimum of 2.5 (gt=0)', async () => {
    const wrapper = build('strength')
    const minus = wrapper.findAll('button[aria-label="Reducir"]')[0]
    for (let i = 0; i < 10; i++) {
      await minus.trigger('click', { detail: 0 })
    }
    await wrapper.find('form').trigger('submit')
    const payload = wrapper.emitted('submit')!.at(-1)![0] as Record<string, unknown>
    expect(payload.weight_kg).toBe(2.5)
  })

  it('timed duration stepper clamps at the backend minimum of 1 (ge=1)', async () => {
    const wrapper = build('timed')
    const minus = wrapper.findAll('button[aria-label="Reducir"]')[0]
    for (let i = 0; i < 5; i++) {
      await minus.trigger('click', { detail: 0 })
    }
    await wrapper.find('form').trigger('submit')
    const payload = wrapper.emitted('submit')!.at(-1)![0] as Record<string, unknown>
    expect(payload.duration_seconds).toBe(1)
  })

  it('logs a console warning and emits nothing for an unknown measurement (defensive default)', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const wrapper = build('unknown-measurement')
    await wrapper.find('form').trigger('submit')
    expect(wrapper.emitted('submit')).toBeFalsy()
    expect(warnSpy).toHaveBeenCalled()
    warnSpy.mockRestore()
  })
})

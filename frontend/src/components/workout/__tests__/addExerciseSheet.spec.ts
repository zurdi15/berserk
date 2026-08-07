import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const EXERCISES = [
  { id: 5, name_es: 'Press banca', name_en: 'Bench press', measurement: 'strength', owner_id: null, muscle_groups: [{ muscle_group_id: 1, is_primary: true }] },
  { id: 6, name_es: 'Sentadilla', name_en: 'Squat', measurement: 'strength', owner_id: null, muscle_groups: [] },
]

vi.mock('@/api/domain', () => ({
  listExercises: vi.fn(async () => EXERCISES),
  listMuscleGroups: vi.fn(async () => [
    { id: 1, slug: 'chest', name_es: 'Pecho', name_en: 'Chest', owner_id: null },
  ]),
}))

import * as domain from '@/api/domain'
import { createI18nInstance } from '@/i18n'
import AddExerciseSheet from '../AddExerciseSheet.vue'

// BkSheet teletransporta el contenido a document.body: hay que buscarlo ahí,
// no en el árbol del wrapper (misma técnica que calendar.spec.ts)
async function typeQuery(text: string) {
  const input = document.querySelector('[data-testid="search-list-input"]') as HTMLInputElement
  input.value = text
  input.dispatchEvent(new Event('input', { bubbles: true }))
  await flushPromises()
}

describe('AddExerciseSheet (item 5: consume BkSearchList, catálogo completo)', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.mocked(domain.listExercises).mockClear()
  })

  afterEach(() => {
    // el contenido teletransportado sobrevive al wrapper si no se limpia el body
    document.body.innerHTML = ''
  })

  it('loads the FULL exercise catalog once on mount (listExercises with no query)', async () => {
    mount(AddExerciseSheet, {
      props: { open: true, actions: { addExercise: vi.fn() } },
      global: { plugins: [createI18nInstance()] },
    })
    await flushPromises()

    expect(domain.listExercises).toHaveBeenCalledWith({})
    expect(domain.listExercises).toHaveBeenCalledTimes(1)
  })

  it('shows ALL exercises immediately, before any search text is typed', async () => {
    mount(AddExerciseSheet, {
      props: { open: true, actions: { addExercise: vi.fn() } },
      global: { plugins: [createI18nInstance()] },
    })
    await flushPromises()

    expect(document.querySelector('[data-testid="exercise-result-5"]')).not.toBeNull()
    expect(document.querySelector('[data-testid="exercise-result-6"]')).not.toBeNull()
  })

  it('typing narrows the list client-side without another listExercises call', async () => {
    mount(AddExerciseSheet, {
      props: { open: true, actions: { addExercise: vi.fn() } },
      global: { plugins: [createI18nInstance()] },
    })
    await flushPromises()

    await typeQuery('banca')

    expect(document.querySelector('[data-testid="exercise-result-5"]')).not.toBeNull()
    expect(document.querySelector('[data-testid="exercise-result-6"]')).toBeNull()
    expect(domain.listExercises).toHaveBeenCalledTimes(1)
  })

  // v0.9.4 (zurdi: "los ejercicios de cardio no salen"): el pajar de búsqueda
  // incluye el nombre en el OTRO idioma y la etiqueta del tipo de medición
  it('v0.9.4: typing "cardio" or the other-locale name matches via searchFn, beyond the visible label', async () => {
    vi.mocked(domain.listExercises).mockResolvedValueOnce([
      ...EXERCISES,
      { id: 7, name_es: 'Cinta de correr', name_en: 'Treadmill', measurement: 'cardio', owner_id: null, muscle_groups: [] },
    ] as never)
    mount(AddExerciseSheet, {
      props: { open: true, actions: { addExercise: vi.fn() } },
      global: { plugins: [createI18nInstance()] },
    })
    await flushPromises()

    await typeQuery('cardio')
    expect(document.querySelector('[data-testid="exercise-result-7"]')).not.toBeNull()
    expect(document.querySelector('[data-testid="exercise-result-5"]')).toBeNull()

    // nombre EN aunque la UI muestre el ES
    await typeQuery('treadmill')
    expect(document.querySelector('[data-testid="exercise-result-7"]')).not.toBeNull()
  })

  it('picking a search result calls actions.addExercise with its id and emits close', async () => {
    const addSpy = vi.fn().mockResolvedValue(undefined)

    const wrapper = mount(AddExerciseSheet, {
      props: { open: true, actions: { addExercise: addSpy } },
      global: { plugins: [createI18nInstance()] },
    })
    await flushPromises()

    const resultButton = document.querySelector('[data-testid="exercise-result-5"]') as HTMLElement
    expect(resultButton).not.toBeNull()
    resultButton.click()
    await flushPromises()

    expect(addSpy).toHaveBeenCalledWith(5)
    expect(wrapper.emitted('close')).toBeTruthy()
  })

  it('item 6: shows a rune+name tag for the primary muscle group of each search result', async () => {
    mount(AddExerciseSheet, {
      props: { open: true, actions: { addExercise: vi.fn() } },
      global: { plugins: [createI18nInstance()] },
    })
    await flushPromises()

    const tag = document.querySelector('[data-testid="exercise-group-tag-5"]') as HTMLElement
    expect(tag).not.toBeNull()
    expect(tag.textContent).toContain('Pecho')
    expect(tag.querySelector('svg')).not.toBeNull()
  })

  it('does not show a group tag for an exercise with no primary muscle group', async () => {
    mount(AddExerciseSheet, {
      props: { open: true, actions: { addExercise: vi.fn() } },
      global: { plugins: [createI18nInstance()] },
    })
    await flushPromises()

    expect(document.querySelector('[data-testid="exercise-group-tag-6"]')).toBeNull()
  })

  it('resets the query when the sheet closes', async () => {
    const wrapper = mount(AddExerciseSheet, {
      props: { open: true, actions: { addExercise: vi.fn() } },
      global: { plugins: [createI18nInstance()] },
    })
    await flushPromises()
    await typeQuery('banca')

    await wrapper.setProps({ open: false })
    await wrapper.setProps({ open: true })
    await flushPromises()

    const input = document.querySelector('[data-testid="search-list-input"]') as HTMLInputElement
    expect(input.value).toBe('')
    expect(document.querySelector('[data-testid="exercise-result-6"]')).not.toBeNull()
  })

  // v0.8.0 (zurdi rediseña la creación de superseries): check en el sheet —
  // activo, el primer tap selecciona y el segundo añade AMBOS enlazados
  describe('v0.8.0: superset mode', () => {
    it('shows the check only when the surface provides addSupersetPair (the retro editor does not)', async () => {
      mount(AddExerciseSheet, {
        props: { open: true, actions: { addExercise: vi.fn() } },
        global: { plugins: [createI18nInstance()] },
      })
      await flushPromises()
      expect(document.querySelector('[data-testid="superset-mode-checkbox"]')).toBeNull()
      document.body.innerHTML = ''

      mount(AddExerciseSheet, {
        props: { open: true, actions: { addExercise: vi.fn(), addSupersetPair: vi.fn() } },
        global: { plugins: [createI18nInstance()] },
      })
      await flushPromises()
      expect(document.querySelector('[data-testid="superset-mode-checkbox"]')).not.toBeNull()
    })

    it('with the check on: first pick highlights and keeps the sheet open, second pick adds the linked pair and closes', async () => {
      const pairSpy = vi.fn().mockResolvedValue(undefined)
      const addSpy = vi.fn()
      const wrapper = mount(AddExerciseSheet, {
        props: { open: true, actions: { addExercise: addSpy, addSupersetPair: pairSpy } },
        global: { plugins: [createI18nInstance()] },
      })
      await flushPromises()

      const check = document.querySelector('[data-testid="superset-mode-checkbox"]') as HTMLInputElement
      check.click()
      await flushPromises()
      expect(document.querySelector('[data-testid="superset-pick-hint"]')).not.toBeNull()

      ;(document.querySelector('[data-testid="exercise-result-6"]') as HTMLElement).click()
      await flushPromises()
      // seleccionado, no anadido: sin cierre, sin llamadas, hint con nombre
      expect(pairSpy).not.toHaveBeenCalled()
      expect(addSpy).not.toHaveBeenCalled()
      expect(wrapper.emitted('close')).toBeUndefined()

      ;(document.querySelector('[data-testid="exercise-result-5"]') as HTMLElement).click()
      await flushPromises()
      expect(pairSpy).toHaveBeenCalledWith(6, 5)
      expect(addSpy).not.toHaveBeenCalled()
      expect(wrapper.emitted('close')).toHaveLength(1)
    })

    it('tapping the selected exercise again deselects it; unchecking mid-selection discards the first pick', async () => {
      const pairSpy = vi.fn().mockResolvedValue(undefined)
      mount(AddExerciseSheet, {
        props: { open: true, actions: { addExercise: vi.fn(), addSupersetPair: pairSpy } },
        global: { plugins: [createI18nInstance()] },
      })
      await flushPromises()

      const check = document.querySelector('[data-testid="superset-mode-checkbox"]') as HTMLInputElement
      check.click()
      await flushPromises()

      const first = document.querySelector('[data-testid="exercise-result-6"]') as HTMLElement
      first.click()
      await flushPromises()
      first.click() // deseleccionar
      await flushPromises()
      first.click() // volver a seleccionar
      await flushPromises()

      check.click() // desmarcar el check descarta la seleccion
      await flushPromises()
      check.click()
      await flushPromises()
      // tras re-marcar, el siguiente tap vuelve a ser PRIMERA seleccion
      first.click()
      await flushPromises()
      expect(pairSpy).not.toHaveBeenCalled()
    })
  })
})

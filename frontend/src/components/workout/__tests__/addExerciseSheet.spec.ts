import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/api/domain', () => ({
  listExercises: vi.fn(async () => [
    { id: 5, name_es: 'Press banca', name_en: 'Bench press', measurement: 'strength', owner_id: null, muscle_groups: [{ muscle_group_id: 1, is_primary: true }] },
  ]),
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
  const input = document.querySelector('input') as HTMLInputElement
  input.value = text
  input.dispatchEvent(new Event('input', { bubbles: true }))
  await new Promise((resolve) => setTimeout(resolve, 350))
  await flushPromises()
}

describe('AddExerciseSheet', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.mocked(domain.listExercises).mockClear()
  })

  afterEach(() => {
    // el contenido teletransportado sobrevive al wrapper si no se limpia el body
    document.body.innerHTML = ''
  })

  it('searches via listExercises with the typed query', async () => {
    mount(AddExerciseSheet, {
      props: { open: true, actions: { addExercise: vi.fn() } },
      global: { plugins: [createI18nInstance()] },
    })
    await flushPromises()

    await typeQuery('banca')

    expect(domain.listExercises).toHaveBeenCalledWith({ q: 'banca' })
  })

  it('picking a search result calls actions.addExercise with its id and emits close', async () => {
    const addSpy = vi.fn().mockResolvedValue(undefined)

    const wrapper = mount(AddExerciseSheet, {
      props: { open: true, actions: { addExercise: addSpy } },
      global: { plugins: [createI18nInstance()] },
    })
    await flushPromises()

    await typeQuery('banca')

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

    await typeQuery('banca')

    const tag = document.querySelector('[data-testid="exercise-group-tag-5"]') as HTMLElement
    expect(tag).not.toBeNull()
    expect(tag.textContent).toContain('Pecho')
    expect(tag.querySelector('svg')).not.toBeNull()
  })
})

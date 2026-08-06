import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/api/domain', () => ({
  listExercises: vi.fn(async () => [
    { id: 5, name_es: 'Press banca', name_en: 'Bench press', measurement: 'strength', owner_id: null, muscle_groups: [] },
  ]),
}))

import * as domain from '@/api/domain'
import { createI18nInstance } from '@/i18n'
import { useActiveWorkoutStore } from '@/stores/activeWorkout'
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
      props: { open: true },
      global: { plugins: [createI18nInstance()] },
    })
    await flushPromises()

    await typeQuery('banca')

    expect(domain.listExercises).toHaveBeenCalledWith({ q: 'banca' })
  })

  it('picking a search result calls activeWorkout.addExercise with its id and emits close', async () => {
    const activeWorkout = useActiveWorkoutStore()
    const addSpy = vi.spyOn(activeWorkout, 'addExercise').mockResolvedValue(undefined)

    const wrapper = mount(AddExerciseSheet, {
      props: { open: true },
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
})

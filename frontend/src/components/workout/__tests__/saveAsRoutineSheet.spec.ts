import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/api/domain', () => ({
  createRoutine: vi.fn(),
  replaceRoutineExercises: vi.fn(),
  deleteRoutine: vi.fn(),
}))

import * as domain from '@/api/domain'
import { createI18nInstance } from '@/i18n'
import { useToastStore } from '@/stores/toast'
import SaveAsRoutineSheet from '../SaveAsRoutineSheet.vue'

const workout = {
  id: 9,
  date: '2026-08-06',
  started_at: 'x',
  ended_at: 'x',
  routine_id: null,
  note: null,
  feeling: null,
  stretched: false,
  muscle_tag_ids: [],
  exercises: [
    {
      id: 20, exercise_id: 5, position: 0, note: null, rest_seconds: 90,
      sets: [{ id: 1, set_number: 1, reps: 8, weight_kg: 80, duration_seconds: null, distance_m: null, is_warmup: false, rpe: null, completed_at: 'x' }],
    },
  ],
}

// BkSheet teletransporta a document.body — mismo patrón que AddExerciseSheet
function byTestId(id: string) {
  return document.body.querySelector(`[data-testid="${id}"]`) as HTMLElement
}

describe('SaveAsRoutineSheet (item 5)', () => {
  let wrapper: VueWrapper | null = null

  beforeEach(() => {
    setActivePinia(createPinia())
    vi.mocked(domain.createRoutine).mockClear()
    vi.mocked(domain.replaceRoutineExercises).mockClear()
    vi.mocked(domain.deleteRoutine).mockClear()
  })

  afterEach(() => {
    wrapper?.unmount()
    wrapper = null
    document.body.innerHTML = ''
  })

  function build(open = true) {
    return mount(SaveAsRoutineSheet, {
      props: { open, workout: workout as never },
      global: { plugins: [createI18nInstance()] },
      attachTo: document.body,
    })
  }

  it('defaults the name field to "Entreno {date}" when opened', () => {
    wrapper = build()
    const input = byTestId('save-as-routine-sheet').querySelector('input') as HTMLInputElement
    expect(input.value).toBe('Entreno 2026-08-06')
  })

  it('creates the routine and replaces its exercises with the mapped payload, then closes', async () => {
    vi.mocked(domain.createRoutine).mockResolvedValue({ id: 42, name: 'x', description: null, rune: null, color: null, exercises: [] } as never)
    vi.mocked(domain.replaceRoutineExercises).mockResolvedValue({} as never)
    const toast = useToastStore()

    wrapper = build()
    const input = byTestId('save-as-routine-sheet').querySelector('input') as HTMLInputElement
    input.value = 'Mi rutina'
    input.dispatchEvent(new Event('input', { bubbles: true }))

    await byTestId('save-as-routine-confirm').click()
    await flushPromises()

    expect(domain.createRoutine).toHaveBeenCalledWith({ name: 'Mi rutina' })
    expect(domain.replaceRoutineExercises).toHaveBeenCalledWith(42, [
      // v0.5.0 superseries: el payload SIEMPRE lleva superset_group (null =
      // suelto, el fixture no venía agrupado)
      { exercise_id: 5, target_sets: 1, target_reps: 8, target_weight_kg: 80, rest_seconds: 90, superset_group: null },
    ])
    expect(toast.toasts.some((t) => t.message === 'Rutina guardada')).toBe(true)
    expect(wrapper.emitted('close')).toBeTruthy()
  })

  it('a rejected createRoutine surfaces a toast and does not close the sheet', async () => {
    vi.mocked(domain.createRoutine).mockRejectedValueOnce(new Error('boom'))
    const toast = useToastStore()

    wrapper = build()
    await byTestId('save-as-routine-confirm').click()
    await flushPromises()

    expect(toast.toasts.length).toBeGreaterThan(0)
    expect(wrapper.emitted('close')).toBeFalsy()
  })

  it('a rejected createRoutine never calls deleteRoutine (nothing was created to clean up)', async () => {
    vi.mocked(domain.createRoutine).mockRejectedValueOnce(new Error('boom'))

    wrapper = build()
    await byTestId('save-as-routine-confirm').click()
    await flushPromises()

    expect(domain.deleteRoutine).not.toHaveBeenCalled()
  })

  describe('fix M5: no orphaned routine when replaceRoutineExercises fails', () => {
    it('deletes the just-created routine in the catch and still surfaces the original error', async () => {
      vi.mocked(domain.createRoutine).mockResolvedValue({ id: 42, name: 'x', description: null, rune: null, color: null, exercises: [] } as never)
      vi.mocked(domain.replaceRoutineExercises).mockRejectedValueOnce(new Error('422 invalid'))
      vi.mocked(domain.deleteRoutine).mockResolvedValue(undefined as never)
      const toast = useToastStore()

      wrapper = build()
      await byTestId('save-as-routine-confirm').click()
      await flushPromises()

      expect(domain.deleteRoutine).toHaveBeenCalledWith(42)
      expect(toast.toasts.length).toBeGreaterThan(0)
      expect(wrapper.emitted('close')).toBeFalsy()
    })

    it('a failed cleanup delete does not throw unhandled — the original error toast still wins', async () => {
      vi.mocked(domain.createRoutine).mockResolvedValue({ id: 42, name: 'x', description: null, rune: null, color: null, exercises: [] } as never)
      vi.mocked(domain.replaceRoutineExercises).mockRejectedValueOnce(new Error('422 invalid'))
      vi.mocked(domain.deleteRoutine).mockRejectedValueOnce(new Error('delete also failed'))
      const toast = useToastStore()

      wrapper = build()
      await byTestId('save-as-routine-confirm').click()
      await flushPromises()

      expect(domain.deleteRoutine).toHaveBeenCalledWith(42)
      expect(toast.toasts.length).toBeGreaterThan(0)
    })
  })
})

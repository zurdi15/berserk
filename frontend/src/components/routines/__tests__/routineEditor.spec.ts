import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { createI18nInstance } from '@/i18n'
import { useAuthStore } from '@/stores/auth'
import { useToastStore } from '@/stores/toast'
import { displayToKg, kgToDisplay } from '@/utils/units'
import type { RoutineOut } from '@/api/domain'
import RoutineEditorSheet from '../RoutineEditorSheet.vue'
import { exerciseName } from '../exerciseName'

vi.mock('@/api/domain', () => ({
  createRoutine: vi.fn((body) => Promise.resolve({
    id: 1,
    name: body.name,
    description: body.description || null,
    rune: body.rune || null,
    color: body.color || null,
    exercises: [],
  })),
  updateRoutine: vi.fn((id, body) => Promise.resolve({
    id,
    name: body.name,
    description: body.description || null,
    rune: body.rune || null,
    color: body.color || null,
    exercises: [],
  })),
  replaceRoutineExercises: vi.fn((id: number, items: any[]) => Promise.resolve({
    id,
    name: 'Test Routine',
    description: null,
    rune: null,
    color: null,
    exercises: items.map((item: any, i: number) => ({
      id: i + 1,
      exercise_id: item.exercise_id,
      position: i,
      target_sets: item.target_sets || 3,
      target_reps: item.target_reps || null,
      target_weight_kg: item.target_weight_kg || null,
      rest_seconds: item.rest_seconds || null,
    })),
  })),
  listExercises: vi.fn(() => Promise.resolve([
    {
      id: 1,
      name_es: 'Press de banca',
      name_en: 'Bench Press',
      measurement: 'strength',
      owner_id: null,
      muscle_groups: [{ muscle_group_id: 1, is_primary: true }],
    },
    {
      id: 2,
      name_es: 'Sentadilla',
      name_en: 'Squat',
      measurement: 'strength',
      owner_id: null,
      muscle_groups: [{ muscle_group_id: 4, is_primary: true }],
    },
  ])),
  listMuscleGroups: vi.fn(() => Promise.resolve([
    { id: 1, slug: 'chest', name_es: 'Pecho', name_en: 'Chest', owner_id: null },
    { id: 2, slug: 'back', name_es: 'Espalda', name_en: 'Back', owner_id: null },
    { id: 3, slug: 'biceps', name_es: 'Bíceps', name_en: 'Biceps', owner_id: null },
    { id: 4, slug: 'legs', name_es: 'Piernas', name_en: 'Legs', owner_id: null },
  ])),
}))

describe('exerciseName', () => {
  it('resolves exercise name to English when locale is en', () => {
    const exercise = {
      id: 1,
      name_es: 'Press de banca',
      name_en: 'Bench Press',
      measurement: 'strength' as const,
      owner_id: null,
      muscle_groups: [],
    }
    expect(exerciseName(exercise, 'en')).toBe('Bench Press')
  })

  it('resolves exercise name to Spanish when locale is es', () => {
    const exercise = {
      id: 1,
      name_es: 'Press de banca',
      name_en: 'Bench Press',
      measurement: 'strength' as const,
      owner_id: null,
      muscle_groups: [],
    }
    expect(exerciseName(exercise, 'es')).toBe('Press de banca')
  })

  it('handles null-safe fallback when exercise undefined', () => {
    const result = exerciseName(undefined, 'en')
    expect(result).toBe('')
  })
})

describe('RoutineEditorSheet', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    const auth = useAuthStore()
    auth.user = {
      id: 1,
      username: 'test',
      is_admin: false,
      locale: 'es',
      units: 'kg',
      timezone: 'UTC',
    }
  })

  function build(routine: RoutineOut | undefined = undefined) {
    return mount(RoutineEditorSheet, {
      props: {
        open: true,
        routine,
      },
      global: {
        plugins: [createI18nInstance()],
        stubs: {
          BkRune: true,
          BkSheet: false,
          BkButton: false,
          BkField: false,
          BkSelect: false,
          BkStepper: false,
        },
      },
    })
  }

  it('reorders exercises and saves with swapped ids', async () => {
    const { replaceRoutineExercises } = await import('@/api/domain')
    vi.mocked(replaceRoutineExercises).mockClear()

    const routine = {
      id: 5,
      name: 'Test Routine',
      description: null,
      rune: null,
      color: null,
      exercises: [
        { id: 10, exercise_id: 1, position: 0, target_sets: 3, target_reps: null, target_weight_kg: null, rest_seconds: 60 },
        { id: 11, exercise_id: 2, position: 1, target_sets: 4, target_reps: null, target_weight_kg: null, rest_seconds: 90 },
      ],
    }

    const wrapper = build(routine)
    await wrapper.vm.$nextTick()
    await new Promise(resolve => setTimeout(resolve, 100))
    await wrapper.vm.$nextTick()

    const vm = wrapper.vm as any

    // Verify exercises loaded
    expect(vm.exercises).toHaveLength(2)
    expect(vm.exercises[0].exercise_id).toBe(1)
    expect(vm.exercises[1].exercise_id).toBe(2)

    // BkSheet teletransporta su contenido a document.body: hay que buscarlo
    // ahí (no en wrapper), y tomar el diálogo más reciente por si algún test
    // previo del archivo dejó el suyo montado
    const dialogs = document.querySelectorAll('[role="dialog"]')
    const dialog = dialogs[dialogs.length - 1] as HTMLElement

    // Sube el segundo ejercicio vía el botón "↑" real (solo la fila con
    // index > 0 lo muestra, así que es único en este montaje de 2 ejercicios)
    // — item 6: ahora es icon-only, se busca por aria-label (que SÍ se
    // conserva) en vez del texto visible
    const moveUpButton = Array.from(dialog.querySelectorAll('button')).find(
      (b) => b.getAttribute('aria-label') === 'Arriba',
    )
    expect(moveUpButton).not.toBeUndefined()
    moveUpButton!.click()
    await wrapper.vm.$nextTick()

    // Verify order swapped in local state
    expect(vm.exercises[0].exercise_id).toBe(2)
    expect(vm.exercises[1].exercise_id).toBe(1)

    // Guarda vía el botón real "Guardar"
    const saveButton = Array.from(dialog.querySelectorAll('button')).find((b) => b.textContent === 'Guardar')
    expect(saveButton).not.toBeUndefined()
    saveButton!.click()
    await wrapper.vm.$nextTick()
    await new Promise(resolve => setTimeout(resolve, 0))

    // Assert replaceRoutineExercises called with swapped ids
    expect(replaceRoutineExercises).toHaveBeenCalledWith(5, expect.arrayContaining([
      expect.objectContaining({ exercise_id: 2 }),
      expect.objectContaining({ exercise_id: 1 }),
    ]))
  })

  it('sends replaceRoutineExercises with empty array when exercises removed', async () => {
    const { replaceRoutineExercises } = await import('@/api/domain')
    vi.mocked(replaceRoutineExercises).mockClear()

    const routine = {
      id: 5,
      name: 'Test Routine',
      description: null,
      rune: null,
      color: null,
      exercises: [
        { id: 10, exercise_id: 1, position: 0, target_sets: 3, target_reps: null, target_weight_kg: null, rest_seconds: 60 },
      ],
    }

    const wrapper = build(routine)
    await wrapper.vm.$nextTick()
    await new Promise(resolve => setTimeout(resolve, 100))
    await wrapper.vm.$nextTick()

    const vm = wrapper.vm as any

    const dialogs = document.querySelectorAll('[role="dialog"]')
    const dialog = dialogs[dialogs.length - 1] as HTMLElement

    // Elimina el único ejercicio vía el botón "Quitar" real
    const removeButton = Array.from(dialog.querySelectorAll('button')).find((b) => b.textContent === 'Quitar')
    expect(removeButton).not.toBeUndefined()
    removeButton!.click()
    await wrapper.vm.$nextTick()
    expect(vm.exercises).toHaveLength(0)

    // Guarda vía el botón real "Guardar"
    const saveButton = Array.from(dialog.querySelectorAll('button')).find((b) => b.textContent === 'Guardar')
    expect(saveButton).not.toBeUndefined()
    saveButton!.click()
    await wrapper.vm.$nextTick()
    await new Promise(resolve => setTimeout(resolve, 0))

    // Assert replaceRoutineExercises called with empty array
    expect(replaceRoutineExercises).toHaveBeenCalledWith(5, [])
  })

  it('includes target_weight_kg in save payload', async () => {
    const { replaceRoutineExercises } = await import('@/api/domain')
    vi.mocked(replaceRoutineExercises).mockClear()

    const routine = {
      id: 5,
      name: 'Test Routine',
      description: null,
      rune: null,
      color: null,
      exercises: [
        { id: 10, exercise_id: 1, position: 0, target_sets: 3, target_reps: 8, target_weight_kg: 50, rest_seconds: 60 },
      ],
    }

    const wrapper = build(routine)
    await wrapper.vm.$nextTick()
    await new Promise(resolve => setTimeout(resolve, 100))
    await wrapper.vm.$nextTick()

    const vm = wrapper.vm as any

    // Verify weight is loaded
    expect(vm.exercises[0].target_weight_kg).toBe(50)

    const dialogs = document.querySelectorAll('[role="dialog"]')
    const dialog = dialogs[dialogs.length - 1] as HTMLElement

    // Guarda vía el botón real "Guardar"
    const saveButton = Array.from(dialog.querySelectorAll('button')).find((b) => b.textContent === 'Guardar')
    expect(saveButton).not.toBeUndefined()
    saveButton!.click()
    await wrapper.vm.$nextTick()
    await new Promise(resolve => setTimeout(resolve, 0))

    // Assert replaceRoutineExercises called with weight
    expect(replaceRoutineExercises).toHaveBeenCalledWith(5, expect.arrayContaining([
      expect.objectContaining({ target_weight_kg: 50 }),
    ]))
  })

  it('lb mode: prefills the weight stepper via kgToDisplay and saves canonical kg via displayToKg (C3)', async () => {
    const auth = useAuthStore()
    auth.user = {
      id: 1,
      username: 'test',
      is_admin: false,
      locale: 'es',
      units: 'lb',
      timezone: 'UTC',
    }

    const { replaceRoutineExercises } = await import('@/api/domain')
    vi.mocked(replaceRoutineExercises).mockClear()

    const routine = {
      id: 5,
      name: 'Test Routine',
      description: null,
      rune: null,
      color: null,
      exercises: [
        { id: 10, exercise_id: 1, position: 0, target_sets: 3, target_reps: 8, target_weight_kg: 100, rest_seconds: 60 },
      ],
    }

    const wrapper = build(routine)
    await wrapper.vm.$nextTick()
    await new Promise(resolve => setTimeout(resolve, 100))
    await wrapper.vm.$nextTick()

    // BkSheet teletransporta su contenido a document.body: hay que buscarlo
    // ahí (no en wrapper), y tomar el diálogo más reciente por si algún test
    // previo del archivo dejó el suyo montado
    const dialogs = document.querySelectorAll('[role="dialog"]')
    const dialog = dialogs[dialogs.length - 1] as HTMLElement
    expect(dialog).not.toBeUndefined()

    // prefill: 100 kg canónico se muestra convertido a lb (220.5), no crudo (100)
    expect(dialog.textContent).toContain(String(kgToDisplay(100, 'lb')))

    // el último stepper "Aumentar" de la fila es el de peso objetivo (sets, reps, peso)
    const plusButtons = dialog.querySelectorAll('button[aria-label="Aumentar"]')
    const weightPlus = plusButtons[plusButtons.length - 1] as HTMLButtonElement
    weightPlus.dispatchEvent(new MouseEvent('click', { detail: 0, bubbles: true, cancelable: true }))
    await wrapper.vm.$nextTick()

    const saveButton = Array.from(dialog.querySelectorAll('button')).find((b) => b.textContent === 'Guardar')
    expect(saveButton).not.toBeUndefined()
    saveButton!.click()
    await wrapper.vm.$nextTick()
    await new Promise(resolve => setTimeout(resolve, 0))

    const bumpedDisplayLb = kgToDisplay(100, 'lb') + 2.5
    expect(replaceRoutineExercises).toHaveBeenCalledWith(5, expect.arrayContaining([
      expect.objectContaining({ target_weight_kg: displayToKg(bumpedDisplayLb, 'lb') }),
    ]))

    wrapper.unmount()
  })

  it('shows validation error when name is empty', async () => {
    const toast = useToastStore()
    toast.toasts = []

    const wrapper = build()
    await wrapper.vm.$nextTick()

    const dialogs = document.querySelectorAll('[role="dialog"]')
    const dialog = dialogs[dialogs.length - 1] as HTMLElement

    // Intenta guardar con nombre vacío vía el botón real "Guardar"
    const saveButton = Array.from(dialog.querySelectorAll('button')).find((b) => b.textContent === 'Guardar')
    expect(saveButton).not.toBeUndefined()
    saveButton!.click()
    await wrapper.vm.$nextTick()

    // Check that error was pushed to toast store with correct message
    const errorToast = toast.toasts.find(t => t.kind === 'error' && t.message.includes('rutina'))
    expect(errorToast).toBeTruthy()
  })

  it('loads exercises from populated routine without crashing', async () => {
    const routine = {
      id: 5,
      name: 'Test Routine',
      description: null,
      rune: null,
      color: null,
      exercises: [
        { id: 10, exercise_id: 1, position: 0, target_sets: 3, target_reps: null, target_weight_kg: null, rest_seconds: 60 },
      ],
    }

    // Should not throw
    const wrapper = build(routine)
    await wrapper.vm.$nextTick()
    await new Promise(resolve => setTimeout(resolve, 100))
    await wrapper.vm.$nextTick()
    expect((wrapper.vm as any).exercises).toHaveLength(1)
  })

  it('fetches exercises on search with debounce', async () => {
    const { listExercises } = await import('@/api/domain')
    vi.mocked(listExercises).mockClear()

    const wrapper = build()
    await wrapper.vm.$nextTick()

    const vm = wrapper.vm as any

    // Trigger search input
    vm.searchQuery = 'bench'

    // Wait for debounce (300ms + nextTick)
    await new Promise(resolve => setTimeout(resolve, 350))
    await wrapper.vm.$nextTick()

    // Assert listExercises called with {q: 'bench'}
    expect(listExercises).toHaveBeenCalledWith({ q: 'bench' })
  })

  it('keeps row exercise names visible after search', async () => {
    const routine = {
      id: 5,
      name: 'Test Routine',
      description: null,
      rune: null,
      color: null,
      exercises: [
        { id: 10, exercise_id: 1, position: 0, target_sets: 3, target_reps: null, target_weight_kg: null, rest_seconds: 60 },
      ],
    }

    const wrapper = build(routine)
    await wrapper.vm.$nextTick()
    await new Promise(resolve => setTimeout(resolve, 100))
    await wrapper.vm.$nextTick()

    const vm = wrapper.vm as any
    const exerciseName1 = vm.allExercises[0]?.name_es || ''

    // Perform a search
    vm.searchQuery = 'sentadilla'
    await new Promise(resolve => setTimeout(resolve, 350))
    await wrapper.vm.$nextTick()

    // Verify allExercises still contains the catalog (row names still render)
    expect(vm.allExercises).toHaveLength(2)
    expect(vm.allExercises[0].name_es).toBe(exerciseName1)
  })

  it('keeps row exercise names visible after adding exercise', async () => {
    const routine = {
      id: 5,
      name: 'Test Routine',
      description: null,
      rune: null,
      color: null,
      exercises: [
        { id: 10, exercise_id: 1, position: 0, target_sets: 3, target_reps: null, target_weight_kg: null, rest_seconds: 60 },
      ],
    }

    const wrapper = build(routine)
    await wrapper.vm.$nextTick()
    await new Promise(resolve => setTimeout(resolve, 100))
    await wrapper.vm.$nextTick()

    const vm = wrapper.vm as any
    const allExercisesBefore = vm.allExercises.length
    const newExerciseName = exerciseName(vm.allExercises[1], 'es')

    const dialogs = document.querySelectorAll('[role="dialog"]')
    const dialog = dialogs[dialogs.length - 1] as HTMLElement

    // Escribe en el buscador real para revelar el picker agrupado
    const searchInput = dialog.querySelector('[data-testid="exercise-search"] input') as HTMLInputElement
    searchInput.value = 'sentadilla'
    searchInput.dispatchEvent(new Event('input'))
    await new Promise(resolve => setTimeout(resolve, 350))
    await wrapper.vm.$nextTick()

    // Añade el ejercicio vía el botón real del picker
    const optionButton = Array.from(dialog.querySelectorAll('button')).find((b) => b.textContent === newExerciseName)
    expect(optionButton).not.toBeUndefined()
    optionButton!.click()
    await wrapper.vm.$nextTick()

    // Verify allExercises unchanged (row names still render)
    expect(vm.allExercises).toHaveLength(allExercisesBefore)
    expect(vm.exercises).toHaveLength(2)
  })
})

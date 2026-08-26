import { flushPromises, mount } from '@vue/test-utils'
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
    is_global: body.is_global ?? false,
    exercises: [],
  })),
  updateRoutine: vi.fn((id, body) => Promise.resolve({
    id,
    name: body.name,
    description: body.description || null,
    rune: body.rune || null,
    color: body.color || null,
    is_global: body.is_global ?? false,
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
    {
      id: 3,
      name_es: 'Cinta de correr',
      name_en: 'Treadmill',
      measurement: 'cardio',
      owner_id: null,
      muscle_groups: [{ muscle_group_id: 4, is_primary: false }],
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

  it('cardio rows hide reps/weight/rest and save purges them (v0.11.1)', async () => {
    const { replaceRoutineExercises } = await import('@/api/domain')
    vi.mocked(replaceRoutineExercises).mockClear()

    const routine = {
      id: 5,
      name: 'Test Routine',
      description: null,
      rune: null,
      color: null,
      exercises: [
        // rutina VIEJA: la fila de cardio trae reps/peso/descanso guardados
        { id: 10, exercise_id: 3, position: 0, target_sets: 3, target_reps: 8, target_weight_kg: 50, rest_seconds: 60 },
        { id: 11, exercise_id: 1, position: 1, target_sets: 3, target_reps: 10, target_weight_kg: 80, rest_seconds: 90 },
      ],
    }

    const wrapper = build(routine)
    await wrapper.vm.$nextTick()
    await new Promise(resolve => setTimeout(resolve, 100))
    await wrapper.vm.$nextTick()

    const dialogs = document.querySelectorAll('[role="dialog"]')
    const dialog = dialogs[dialogs.length - 1] as HTMLElement

    const cardioRow = dialog.querySelector('[data-testid="routine-row-0"]') as HTMLElement
    const strengthRow = dialog.querySelector('[data-testid="routine-row-1"]') as HTMLElement
    // v0.23.0: cardio cambia "Series objetivo" por "Tiempo objetivo"
    expect(cardioRow.textContent).toContain('Tiempo objetivo')
    expect(cardioRow.textContent).not.toContain('Series objetivo')
    expect(cardioRow.textContent).not.toContain('Reps objetivo')
    expect(cardioRow.textContent).not.toContain('Peso objetivo')
    expect(cardioRow.textContent).not.toContain('Descanso')
    // la fila de fuerza conserva los cuatro campos
    expect(strengthRow.textContent).toContain('Series objetivo')
    expect(strengthRow.textContent).not.toContain('Tiempo objetivo')
    expect(strengthRow.textContent).toContain('Reps objetivo')
    expect(strengthRow.textContent).toContain('Peso objetivo')
    expect(strengthRow.textContent).toContain('Descanso')

    const saveButton = Array.from(dialog.querySelectorAll('button')).find((b) => b.textContent === 'Guardar')
    saveButton!.click()
    await wrapper.vm.$nextTick()
    await new Promise(resolve => setTimeout(resolve, 0))

    expect(replaceRoutineExercises).toHaveBeenCalledWith(5, [
      expect.objectContaining({ exercise_id: 3, target_reps: null, target_weight_kg: null, rest_seconds: null }),
      expect.objectContaining({ exercise_id: 1, target_reps: 10, target_weight_kg: 80, rest_seconds: 90 }),
    ])
  })

  // v0.39.3: un descanso fuera de los presets (p.ej. el 5 s que puede colarse
  // por "guardar como plantilla") dejaba el campo en blanco — invisible e
  // incorregible desde aquí
  it('shows a non-preset rest value in the rest select instead of leaving it blank', async () => {
    const routine = {
      id: 5,
      name: 'Test Routine',
      description: null,
      rune: null,
      color: null,
      exercises: [
        { id: 10, exercise_id: 1, position: 0, target_sets: 3, target_reps: null, target_weight_kg: null, rest_seconds: 5 },
      ],
    }

    const wrapper = build(routine)
    await wrapper.vm.$nextTick()
    await new Promise(resolve => setTimeout(resolve, 100))
    await wrapper.vm.$nextTick()

    const dialogs = document.querySelectorAll('[role="dialog"]')
    const dialog = dialogs[dialogs.length - 1] as HTMLElement
    const row = dialog.querySelector('[data-testid="routine-row-0"]') as HTMLElement
    expect(row.textContent).toContain('5 s')

    wrapper.unmount()
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

  // v0.10.0 (zurdi: "el flow de rutina, exactamente el mismo que el de
  // entrenamiento"): el buscador inline con debounce murió — añadir pasa por
  // el MISMO AddExerciseSheet del entreno, con su catálogo completo cargado
  // una vez y filtrado en cliente
  it('v0.10.0: no inline search field; the add button opens AddExerciseSheet', async () => {
    document.body.innerHTML = ''
    const wrapper = build()
    await flushPromises()

    const dialogs = document.querySelectorAll('[role="dialog"]')
    const dialog = dialogs[dialogs.length - 1] as HTMLElement
    expect(dialog.querySelector('[data-testid="exercise-search"]')).toBeNull()

    const addBtn = dialog.querySelector('[data-testid="routine-add-exercise-btn"]') as HTMLElement
    expect(addBtn).not.toBeNull()
    addBtn.click()
    await flushPromises()

    // el sheet de añadir del ENTRENO, con su check de superserie incluido
    expect(document.querySelector('[data-testid="superset-mode-checkbox"]')).not.toBeNull()
    expect(document.querySelector('[data-testid="search-list-input"]')).not.toBeNull()
  })

  it('v0.10.0: picking an exercise in the add sheet appends a row (names keep rendering)', async () => {
    document.body.innerHTML = ''
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
    await flushPromises()

    const vm = wrapper.vm as any
    const newExerciseName = exerciseName(vm.allExercises[1], 'es')

    const dialogs = document.querySelectorAll('[role="dialog"]')
    const dialog = dialogs[dialogs.length - 1] as HTMLElement
    ;(dialog.querySelector('[data-testid="routine-add-exercise-btn"]') as HTMLElement).click()
    await flushPromises()

    const optionButton = [...document.querySelectorAll('[data-testid^="exercise-result-"]')]
      .find((b) => b.textContent?.includes(newExerciseName)) as HTMLElement
    expect(optionButton).not.toBeUndefined()
    optionButton.click()
    await flushPromises()

    expect(vm.exercises).toHaveLength(2)
    expect(vm.exercises[1].exercise_id).toBe(vm.allExercises[1].id)
  })

  // ROUTINES-OPEN (course correction, v0.4.2): el check "Global" vive en el
  // editor, disponible a CUALQUIER usuario sobre su propia rutina (nunca
  // admin-only, sin confirm — a diferencia del extinto flujo globalize).
  describe('ROUTINES-OPEN: "Global" checkbox', () => {
    // v0.4.3 item 10 (zurdi): el default de creación pasó de false a true —
    // la mayoría de rutinas nuevas se quieren compartidas de entrada, mismo
    // criterio que el default del backend (RoutineIn.is_global)
    it('is checked by default when creating a new routine, even for a non-admin user', async () => {
      const wrapper = build()
      await wrapper.vm.$nextTick()

      const dialogs = document.querySelectorAll('[role="dialog"]')
      const dialog = dialogs[dialogs.length - 1] as HTMLElement
      const checkbox = dialog.querySelector('[data-testid="routine-is-global-checkbox"]') as HTMLButtonElement
      expect(checkbox.getAttribute('aria-checked')).toBe('true')
    })

    it('reflects the routine\'s is_global when editing an existing one', async () => {
      const routine = {
        id: 5, name: 'Global routine', description: null, rune: null, color: null,
        is_global: true, exercises: [],
      }

      const wrapper = build(routine as RoutineOut)
      await wrapper.vm.$nextTick()
      await new Promise(resolve => setTimeout(resolve, 100))
      await wrapper.vm.$nextTick()

      const dialogs = document.querySelectorAll('[role="dialog"]')
      const dialog = dialogs[dialogs.length - 1] as HTMLElement
      const checkbox = dialog.querySelector('[data-testid="routine-is-global-checkbox"]') as HTMLButtonElement
      expect(checkbox.getAttribute('aria-checked')).toBe('true')
    })

    it('saving a NEW routine without touching the (already-checked) checkbox sends is_global: true to createRoutine', async () => {
      const { createRoutine } = await import('@/api/domain')
      vi.mocked(createRoutine).mockClear()

      const wrapper = build()
      await wrapper.vm.$nextTick()

      const vm = wrapper.vm as any
      vm.name = 'Full body'

      const dialogs = document.querySelectorAll('[role="dialog"]')
      const dialog = dialogs[dialogs.length - 1] as HTMLElement
      // sin tocar el checkbox: ya nace marcado (item 10)
      const checkbox = dialog.querySelector('[data-testid="routine-is-global-checkbox"]') as HTMLButtonElement
      expect(checkbox.getAttribute('aria-checked')).toBe('true')
      await wrapper.vm.$nextTick()

      const saveButton = Array.from(dialog.querySelectorAll('button')).find((b) => b.textContent === 'Guardar')
      saveButton!.click()
      await wrapper.vm.$nextTick()
      await new Promise(resolve => setTimeout(resolve, 0))

      expect(createRoutine).toHaveBeenCalledWith(expect.objectContaining({ is_global: true }))
    })

    it('unchecking it on CREATE sends is_global: false to createRoutine (the user opted out)', async () => {
      const { createRoutine } = await import('@/api/domain')
      vi.mocked(createRoutine).mockClear()

      const wrapper = build()
      await wrapper.vm.$nextTick()

      const vm = wrapper.vm as any
      vm.name = 'Private routine'

      const dialogs = document.querySelectorAll('[role="dialog"]')
      const dialog = dialogs[dialogs.length - 1] as HTMLElement
      const checkbox = dialog.querySelector('[data-testid="routine-is-global-checkbox"]') as HTMLButtonElement
      checkbox.click()
      await wrapper.vm.$nextTick()

      const saveButton = Array.from(dialog.querySelectorAll('button')).find((b) => b.textContent === 'Guardar')
      saveButton!.click()
      await wrapper.vm.$nextTick()
      await new Promise(resolve => setTimeout(resolve, 0))

      expect(createRoutine).toHaveBeenCalledWith(expect.objectContaining({ is_global: false }))
    })

    it('unchecking it and saving an existing GLOBAL routine sends is_global: false to updateRoutine (round trip)', async () => {
      const { updateRoutine } = await import('@/api/domain')
      vi.mocked(updateRoutine).mockClear()

      const routine = {
        id: 5, name: 'Global routine', description: null, rune: null, color: null,
        is_global: true, exercises: [],
      }

      const wrapper = build(routine as RoutineOut)
      await wrapper.vm.$nextTick()
      await new Promise(resolve => setTimeout(resolve, 100))
      await wrapper.vm.$nextTick()

      const dialogs = document.querySelectorAll('[role="dialog"]')
      const dialog = dialogs[dialogs.length - 1] as HTMLElement
      const checkbox = dialog.querySelector('[data-testid="routine-is-global-checkbox"]') as HTMLButtonElement
      expect(checkbox.getAttribute('aria-checked')).toBe('true')
      checkbox.click()
      await wrapper.vm.$nextTick()

      const saveButton = Array.from(dialog.querySelectorAll('button')).find((b) => b.textContent === 'Guardar')
      saveButton!.click()
      await wrapper.vm.$nextTick()
      await new Promise(resolve => setTimeout(resolve, 0))

      expect(updateRoutine).toHaveBeenCalledWith(5, expect.objectContaining({ is_global: false }))
    })

    it('is never admin-only: a non-admin user\'s form renders it unconditionally, with no confirm step nested inside', async () => {
      const auth = useAuthStore()
      expect(auth.user?.is_admin).toBe(false)

      const wrapper = build()
      await wrapper.vm.$nextTick()

      // renderiza directo, checkeable de inmediato — sin un botón previo que
      // abra un sheet de confirmación anidado (a diferencia del extinto
      // flujo globalize)
      const dialogs = document.querySelectorAll('[role="dialog"]')
      const dialog = dialogs[dialogs.length - 1] as HTMLElement
      // facelift v4: control PROPIO (BkCheck, role=checkbox) — nunca nativo
      const checkbox = dialog.querySelector('[data-testid="routine-is-global-checkbox"]') as HTMLButtonElement
      expect(checkbox.getAttribute('role')).toBe('checkbox')
      expect(checkbox.disabled).toBe(false)
    })
  })

  // v0.17.0 bloques (zurdi: "definir bloques en las rutinas, cada bloque
  // tiene unos ejercicios"): secciones por etiqueta, renombrar/disolver, y
  // flechas que en frontera CAMBIAN de bloque en vez de saltar la fila vecina
  describe('v0.17.0 bloques', () => {
    function routineWithBlocks(): RoutineOut {
      return {
        id: 5,
        name: 'Torso',
        description: null,
        rune: null,
        color: null,
        exercises: [
          { id: 10, exercise_id: 1, position: 1, target_sets: 3, target_reps: null, target_weight_kg: null, rest_seconds: 60, block_label: 'Empuje' },
          { id: 11, exercise_id: 2, position: 2, target_sets: 3, target_reps: null, target_weight_kg: null, rest_seconds: 60, block_label: 'Empuje' },
          { id: 12, exercise_id: 3, position: 3, target_sets: 3, target_reps: null, target_weight_kg: null, rest_seconds: 60, block_label: 'Tirón' },
        ],
      } as RoutineOut
    }

    it('renders one section per block label with its name in the header', async () => {
      const wrapper = build(routineWithBlocks())
      await flushPromises()

      const dialogs = document.querySelectorAll('[role="dialog"]')
      const dialog = dialogs[dialogs.length - 1] as HTMLElement
      expect(dialog.querySelector('[data-testid="routine-block-Empuje"]')).not.toBeNull()
      expect(dialog.querySelector('[data-testid="routine-block-Tirón"]')).not.toBeNull()
      // dos filas en Empuje, una en Tirón
      expect(dialog.querySelector('[data-testid="routine-block-Empuje"]')!.querySelectorAll('[data-testid^="routine-row-"]').length).toBe(2)
      wrapper.unmount()
    })

    it('moving up across a block boundary ADOPTS the block above instead of swapping rows', async () => {
      const wrapper = build(routineWithBlocks())
      await flushPromises()
      const vm = wrapper.vm as any

      vm.moveExerciseUp(2)
      await flushPromises()

      // la fila 12 no se mueve de posición: entra en "Empuje" como última
      expect(vm.exercises.map((e: any) => e.exercise_id)).toEqual([1, 2, 3])
      expect(vm.exercises[2].block_label).toBe('Empuje')
      wrapper.unmount()
    })

    it('moving down across a boundary adopts the block below', async () => {
      const wrapper = build(routineWithBlocks())
      await flushPromises()
      const vm = wrapper.vm as any

      vm.moveExerciseDown(1)
      await flushPromises()

      expect(vm.exercises.map((e: any) => e.exercise_id)).toEqual([1, 2, 3])
      expect(vm.exercises[1].block_label).toBe('Tirón')
      wrapper.unmount()
    })

    it('renaming a block updates every row and travels in the save payload', async () => {
      const { replaceRoutineExercises } = await import('@/api/domain')
      vi.mocked(replaceRoutineExercises).mockClear()
      const wrapper = build(routineWithBlocks())
      await flushPromises()
      const vm = wrapper.vm as any

      vm.openBlockEdit('Empuje')
      vm.blockNameDraft = 'Pecho y hombro'
      vm.saveBlockRename()
      await flushPromises()
      expect(vm.exercises[0].block_label).toBe('Pecho y hombro')
      expect(vm.exercises[1].block_label).toBe('Pecho y hombro')
      expect(vm.exercises[2].block_label).toBe('Tirón')

      await vm.saveRoutine()
      expect(replaceRoutineExercises).toHaveBeenCalledWith(5, [
        expect.objectContaining({ exercise_id: 1, block_label: 'Pecho y hombro' }),
        expect.objectContaining({ exercise_id: 2, block_label: 'Pecho y hombro' }),
        expect.objectContaining({ exercise_id: 3, block_label: 'Tirón' }),
      ])
      wrapper.unmount()
    })

    it('dissolving a block clears its labels but keeps the rows', async () => {
      const wrapper = build(routineWithBlocks())
      await flushPromises()
      const vm = wrapper.vm as any

      vm.openBlockEdit('Empuje')
      vm.dissolveEditorBlock()
      await flushPromises()

      expect(vm.exercises).toHaveLength(3)
      expect(vm.exercises[0].block_label).toBeNull()
      expect(vm.exercises[1].block_label).toBeNull()
      expect(vm.exercises[2].block_label).toBe('Tirón')
      wrapper.unmount()
    })

    // v0.17.2 (zurdi: "poder añadir ejercicios ya existentes a bloques ya
    // existentes o crear uno nuevo desde el propio ejercicio"): selector de
    // bloque por fila — asignar MUEVE la fila al final del bloque destino
    it('v0.17.2: assignRowToBlock moves an existing row to the END of the target block', async () => {
      const routine = routineWithBlocks()
      // fila extra SIN bloque al final (el caso real: rutina pre-bloques)
      routine.exercises.push({ id: 13, exercise_id: 4, position: 4, target_sets: 3, target_reps: null, target_weight_kg: null, rest_seconds: 60, block_label: null } as never)
      const wrapper = build(routine)
      await flushPromises()
      const vm = wrapper.vm as any

      vm.assignRowToBlock('13', 'Empuje')
      await flushPromises()

      expect(vm.exercises.map((e: any) => e.exercise_id)).toEqual([1, 2, 4, 3])
      expect(vm.exercises[2].block_label).toBe('Empuje')
      wrapper.unmount()
    })

    it('v0.17.2: assigning to null moves the row out of its block (to the end)', async () => {
      const wrapper = build(routineWithBlocks())
      await flushPromises()
      const vm = wrapper.vm as any

      vm.assignRowToBlock('10', null)
      await flushPromises()

      expect(vm.exercises.map((e: any) => e.exercise_id)).toEqual([2, 3, 1])
      expect(vm.exercises[2].block_label).toBeNull()
      wrapper.unmount()
    })

    it('v0.17.2: "new block" from a row assigns THAT row on confirm, without opening the add-exercise sheet', async () => {
      const wrapper = build(routineWithBlocks())
      await flushPromises()
      const vm = wrapper.vm as any

      vm.openNewBlockFor('12')
      vm.newBlockName = 'Aislamiento'
      vm.confirmNewBlock()
      await flushPromises()

      const moved = vm.exercises.find((e: any) => e.id === '12')
      expect(moved.block_label).toBe('Aislamiento')
      expect(vm.addSheetOpen).toBe(false)
      expect(vm.newBlockForRowId).toBeNull()
      wrapper.unmount()
    })

    it('v0.17.2: each row renders a block select with "sin bloque" + existing labels + "nuevo"', async () => {
      const wrapper = build(routineWithBlocks())
      await flushPromises()

      const dialogs = document.querySelectorAll('[role="dialog"]')
      const dialog = dialogs[dialogs.length - 1] as HTMLElement
      const rowSelect = dialog.querySelector('[data-testid="row-block-select-0"] [role="combobox"]') as HTMLElement
      expect(rowSelect).not.toBeNull()
      rowSelect.click()
      await flushPromises()
      const optionLabels = Array.from(document.querySelectorAll('[role="option"]')).map((o) => o.textContent?.trim())
      expect(optionLabels).toEqual(expect.arrayContaining(['Sin bloque', 'Empuje', 'Tirón', '+ Nuevo bloque…']))
      wrapper.unmount()
    })

    it('adding into a block inserts at the END of that block, not at the end of the list', async () => {
      const wrapper = build(routineWithBlocks())
      await flushPromises()
      const vm = wrapper.vm as any

      vm.openAddTo('Empuje')
      await vm.editorActions.addExercise(9)
      await flushPromises()

      expect(vm.exercises.map((e: any) => e.exercise_id)).toEqual([1, 2, 9, 3])
      expect(vm.exercises[2].block_label).toBe('Empuje')
      wrapper.unmount()
    })
  })

  // v0.5.0 superseries: enlazado entre filas consecutivas (botón de eslabón),
  // etiquetas A/B/C presentacionales, normalización y particiones por reorden
  describe('v0.5.0 superseries', () => {
    function lastDialog(): HTMLElement {
      const dialogs = document.querySelectorAll('[role="dialog"]')
      return dialogs[dialogs.length - 1] as HTMLElement
    }

    function routineWith(
      exercises: Array<{ id: number; exercise_id: number; superset_group?: number | null }>,
    ): RoutineOut {
      return {
        id: 5,
        name: 'Test Routine',
        description: null,
        rune: null,
        color: null,
        exercises: exercises.map((e, i) => ({
          id: e.id,
          exercise_id: e.exercise_id,
          position: i + 1,
          target_sets: 3,
          target_reps: null,
          target_weight_kg: null,
          rest_seconds: 60,
          superset_group: e.superset_group ?? null,
        })),
      } as RoutineOut
    }

    async function settle(wrapper: ReturnType<typeof build>) {
      await wrapper.vm.$nextTick()
      await new Promise(resolve => setTimeout(resolve, 100))
      await wrapper.vm.$nextTick()
    }

    // v0.10.0: los toggles de frontera murieron también aquí — las
    // superseries se CREAN con el check del AddExerciseSheet (par) y se
    // gestionan desde el contenedor del bloque, igual que en el entreno
    it('v0.10.0: adding a pair via the add sheet superset check saves superset_group [0, 0]', async () => {
      document.body.innerHTML = ''
      const { replaceRoutineExercises } = await import('@/api/domain')
      vi.mocked(replaceRoutineExercises).mockClear()

      const wrapper = build(routineWith([]))
      await settle(wrapper)
      const dialog = lastDialog()

      expect(dialog.querySelector('[data-testid^="superset-toggle-"]')).toBeNull()

      ;(dialog.querySelector('[data-testid="routine-add-exercise-btn"]') as HTMLElement).click()
      await flushPromises()
      ;(document.querySelector('[data-testid="superset-mode-checkbox"]') as HTMLInputElement).click()
      await flushPromises()
      const options = [...document.querySelectorAll('[data-testid^="exercise-result-"]')] as HTMLElement[]
      options[0].click()
      await flushPromises()
      options[1].click()
      await flushPromises()

      // contenedor del bloque con su chip único de cabecera
      expect(dialog.querySelector('[data-testid="editor-superset-container-A"]')).not.toBeNull()

      const saveButton = Array.from(dialog.querySelectorAll('button')).find((b) => b.textContent === 'Guardar')
      saveButton!.click()
      await wrapper.vm.$nextTick()
      await new Promise(resolve => setTimeout(resolve, 0))

      expect(replaceRoutineExercises).toHaveBeenCalledWith(5, [
        expect.objectContaining({ superset_group: 0 }),
        expect.objectContaining({ superset_group: 0 }),
      ])
      wrapper.unmount()
    })

    it('v0.10.0: dissolving from the block edit sheet clears the group and saves nulls', async () => {
      document.body.innerHTML = ''
      const { replaceRoutineExercises } = await import('@/api/domain')
      vi.mocked(replaceRoutineExercises).mockClear()

      const wrapper = build(routineWith([
        { id: 10, exercise_id: 1, superset_group: 0 },
        { id: 11, exercise_id: 2, superset_group: 0 },
      ]))
      await settle(wrapper)
      const dialog = lastDialog()

      expect(dialog.querySelector('[data-testid="editor-superset-container-A"]')).not.toBeNull()
      ;(dialog.querySelector('[data-testid="editor-superset-edit-A"]') as HTMLElement).click()
      await flushPromises()
      ;(document.querySelector('[data-testid="superset-dissolve-btn"]') as HTMLElement).click()
      await flushPromises()

      expect(dialog.querySelector('[data-testid="editor-superset-container-A"]')).toBeNull()

      const saveButton = Array.from(dialog.querySelectorAll('button')).find((b) => b.textContent === 'Guardar')
      saveButton!.click()
      await wrapper.vm.$nextTick()
      await new Promise(resolve => setTimeout(resolve, 0))

      expect(replaceRoutineExercises).toHaveBeenCalledWith(5, [
        expect.objectContaining({ exercise_id: 1, superset_group: null }),
        expect.objectContaining({ exercise_id: 2, superset_group: null }),
      ])
      wrapper.unmount()
    })

    it('labels a SECOND group "Superserie B" (letters follow group order)', async () => {
      const wrapper = build(routineWith([
        { id: 10, exercise_id: 1, superset_group: 0 },
        { id: 11, exercise_id: 2, superset_group: 0 },
        { id: 12, exercise_id: 1, superset_group: 1 },
        { id: 13, exercise_id: 2, superset_group: 1 },
      ]))
      await settle(wrapper)
      const dialog = lastDialog()

      expect(dialog.querySelector('[data-testid="editor-superset-container-A"]')).not.toBeNull()
      expect(dialog.querySelector('[data-testid="editor-superset-container-B"]')).not.toBeNull()
      wrapper.unmount()
    })

    it('a reorder that breaks the group contiguity partitions it (leftover singles dissolve to loose)', async () => {
      const { replaceRoutineExercises } = await import('@/api/domain')
      vi.mocked(replaceRoutineExercises).mockClear()

      const wrapper = build(routineWith([
        { id: 10, exercise_id: 1, superset_group: 0 },
        { id: 11, exercise_id: 2, superset_group: 0 },
        { id: 12, exercise_id: 1, superset_group: null },
      ]))
      await settle(wrapper)
      const dialog = lastDialog()

      // sube la TERCERA fila (suelta) al medio del grupo: A1, X, A2 — el
      // grupo pierde la contigüidad y se disuelve entero (runs de 1)
      const upButtons = Array.from(dialog.querySelectorAll('button')).filter(
        (b) => b.getAttribute('aria-label') === 'Arriba',
      )
      upButtons[upButtons.length - 1]!.click()
      await wrapper.vm.$nextTick()

      expect(dialog.querySelector('[data-testid="editor-superset-container-A"]')).toBeNull()

      const saveButton = Array.from(dialog.querySelectorAll('button')).find((b) => b.textContent === 'Guardar')
      saveButton!.click()
      await wrapper.vm.$nextTick()
      await new Promise(resolve => setTimeout(resolve, 0))

      expect(replaceRoutineExercises).toHaveBeenCalledWith(5, [
        expect.objectContaining({ superset_group: null }),
        expect.objectContaining({ superset_group: null }),
        expect.objectContaining({ superset_group: null }),
      ])
      wrapper.unmount()
    })

    it('reordering WITHIN the group keeps it intact (contiguity preserved)', async () => {
      const wrapper = build(routineWith([
        { id: 10, exercise_id: 1, superset_group: 0 },
        { id: 11, exercise_id: 2, superset_group: 0 },
      ]))
      await settle(wrapper)
      const dialog = lastDialog()

      const upButton = Array.from(dialog.querySelectorAll('button')).find(
        (b) => b.getAttribute('aria-label') === 'Arriba',
      )
      upButton!.click()
      await wrapper.vm.$nextTick()

      expect(dialog.querySelector('[data-testid="editor-superset-container-A"]')).not.toBeNull()
      wrapper.unmount()
    })

    it('removing one member of a 2-member group dissolves the leftover single', async () => {
      const wrapper = build(routineWith([
        { id: 10, exercise_id: 1, superset_group: 0 },
        { id: 11, exercise_id: 2, superset_group: 0 },
      ]))
      await settle(wrapper)
      const dialog = lastDialog()

      const removeButton = Array.from(dialog.querySelectorAll('button')).find(
        (b) => b.textContent === 'Quitar',
      )
      removeButton!.click()
      await wrapper.vm.$nextTick()

      expect(dialog.querySelector('[data-testid="superset-row-chip-0"]')).toBeNull()
      wrapper.unmount()
    })

    it('a routine loaded with broken (non-contiguous) grouping is normalized on open — no phantom chips', async () => {
      const wrapper = build(routineWith([
        { id: 10, exercise_id: 1, superset_group: 0 },
        { id: 11, exercise_id: 2, superset_group: null },
        { id: 12, exercise_id: 1, superset_group: 0 },
      ]))
      await settle(wrapper)
      const dialog = lastDialog()

      expect(dialog.querySelector('[data-testid="superset-row-chip-0"]')).toBeNull()
      expect(dialog.querySelector('[data-testid="superset-row-chip-2"]')).toBeNull()
      wrapper.unmount()
    })
  })
})

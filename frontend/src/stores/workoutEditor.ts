import { defineStore } from 'pinia'
import { ref } from 'vue'

import * as domain from '@/api/domain'
import type { ExerciseHistoryOut, SetIn, SetLogOut, WorkoutOut } from '@/api/domain'

// Store para editar un entreno YA registrado (pasado o retroactivo), por id
// de ruta — no "el activo" como activeWorkout. Mismas convenciones de
// escritura (try/catch en cada call site del componente, refresh tras cada
// mutación de sub-recurso), pero deliberadamente SIN rest timer (no hay nada
// de lo que "descansar" editando historial) ni lastRecords/celebración: un PR
// recalculado al corregir una serie pasada no se celebra con el confeti de
// BkCelebration (ver WorkoutEditView.vue, que en su lugar lanza un toast).
export const useWorkoutEditorStore = defineStore('workoutEditor', () => {
  const workout = ref<WorkoutOut | null>(null)
  const loading = ref(false)
  // item 3: mismo cache por exercise_id que activeWorkout — se limpia en
  // cada load() porque el editor puede pasar de editar un workout a otro
  // sin recrearse (misma instancia de store, otro :id de ruta)
  const historyCache = ref(new Map<number, ExerciseHistoryOut | null>())

  async function load(id: number) {
    loading.value = true
    historyCache.value.clear()
    try {
      workout.value = await domain.getWorkout(id)
    } finally {
      loading.value = false
    }
  }

  async function exerciseHistory(exerciseId: number): Promise<ExerciseHistoryOut | null> {
    if (historyCache.value.has(exerciseId)) return historyCache.value.get(exerciseId) ?? null
    const result = await domain.getExerciseHistory(exerciseId, {
      exclude_workout_id: workout.value?.id,
    })
    historyCache.value.set(exerciseId, result)
    return result
  }

  async function refresh() {
    if (workout.value) workout.value = await domain.getWorkout(workout.value.id)
  }

  async function addExercise(exercise_id: number) {
    await domain.addWorkoutExercise(workout.value!.id, { exercise_id })
    await refresh()
  }

  async function removeExercise(weid: number) {
    await domain.removeWorkoutExercise(workout.value!.id, weid)
    await refresh()
  }

  async function reorder(ids: number[]) {
    workout.value = await domain.reorderWorkoutExercises(workout.value!.id, ids)
  }

  async function logSet(weid: number, body: SetIn): Promise<SetLogOut> {
    const result = await domain.logSet(workout.value!.id, weid, body)
    await refresh()
    return result
  }

  async function updateSet(weid: number, sid: number, body: SetIn) {
    await domain.updateSet(workout.value!.id, weid, sid, body)
    await refresh()
  }

  async function deleteSet(weid: number, sid: number) {
    await domain.deleteSet(workout.value!.id, weid, sid)
    await refresh()
  }

  async function setExerciseRest(weid: number, restSeconds: number | null) {
    await domain.updateWorkoutExercise(workout.value!.id, weid, { rest_seconds: restSeconds })
    await refresh()
  }

  async function patch(body: { date?: string; note?: string | null; feeling?: number | null; stretched?: boolean }) {
    workout.value = await domain.updateWorkout(workout.value!.id, body)
  }

  function reset() {
    workout.value = null
    historyCache.value.clear()
  }

  return {
    workout,
    loading,
    load,
    refresh,
    addExercise,
    removeExercise,
    reorder,
    logSet,
    updateSet,
    deleteSet,
    exerciseHistory,
    setExerciseRest,
    patch,
    reset,
  }
})

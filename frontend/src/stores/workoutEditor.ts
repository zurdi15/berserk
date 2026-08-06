import { defineStore } from 'pinia'
import { ref } from 'vue'

import * as domain from '@/api/domain'
import type { SetIn, SetLogOut, WorkoutOut } from '@/api/domain'

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

  async function load(id: number) {
    loading.value = true
    try {
      workout.value = await domain.getWorkout(id)
    } finally {
      loading.value = false
    }
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

  async function setMuscleTags(ids: number[]) {
    // el endpoint devuelve el entreno completo actualizado: no hace falta un refresh aparte
    workout.value = await domain.setWorkoutMuscleTags(workout.value!.id, ids)
  }

  async function patch(body: { date?: string; note?: string | null; feeling?: number | null }) {
    workout.value = await domain.updateWorkout(workout.value!.id, body)
  }

  function reset() {
    workout.value = null
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
    setMuscleTags,
    patch,
    reset,
  }
})

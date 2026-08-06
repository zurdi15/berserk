import { defineStore } from 'pinia'
import { ref } from 'vue'

import { ApiError } from '@/api/client'
import * as domain from '@/api/domain'
import type { ExerciseHistoryOut, PersonalRecordOut, SetIn, SetLogOut, WorkoutOut } from '@/api/domain'
import { useRestTimerStore } from '@/stores/restTimer'

export const useActiveWorkoutStore = defineStore('activeWorkout', () => {
  const workout = ref<WorkoutOut | null>(null)
  const loading = ref(false)
  const lastRecords = ref<PersonalRecordOut[]>([])
  // item 3: cache de "última sesión" por exercise_id, vigente mientras dure
  // ESTE entreno — se limpia en cualquier punto donde `workout` pase a
  // referirse a uno distinto (start/resume/reset), porque el resultado
  // depende de qué workout se excluye de la búsqueda (ver exerciseHistory)
  const historyCache = ref(new Map<number, ExerciseHistoryOut | null>())

  async function resume() {
    loading.value = true
    historyCache.value.clear()
    try {
      workout.value = await domain.getActiveWorkout()
    } catch (error) {
      // sin entreno activo no es un error: es el estado normal
      if (!(error instanceof ApiError && error.slug === 'no_active_workout')) throw error
      workout.value = null
    } finally {
      loading.value = false
    }
  }

  async function refresh() {
    if (workout.value) workout.value = await domain.getWorkout(workout.value.id)
  }

  async function start(body: Parameters<typeof domain.startWorkout>[0]) {
    historyCache.value.clear()
    workout.value = await domain.startWorkout(body)
  }

  async function exerciseHistory(exerciseId: number): Promise<ExerciseHistoryOut | null> {
    if (historyCache.value.has(exerciseId)) return historyCache.value.get(exerciseId) ?? null
    const result = await domain.getExerciseHistory(exerciseId, {
      exclude_workout_id: workout.value?.id,
    })
    historyCache.value.set(exerciseId, result)
    return result
  }

  async function finish(): Promise<WorkoutOut> {
    const finished = await domain.finishWorkout(workout.value!.id)
    workout.value = null
    lastRecords.value = []
    return finished
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
    if (result.new_records.length) lastRecords.value = result.new_records
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

  async function discard() {
    await domain.deleteWorkout(workout.value!.id)
    workout.value = null
    lastRecords.value = []
    // el descarte cierra el entreno, así que un descanso en marcha ya no aplica
    useRestTimerStore().clear()
  }

  function reset() {
    workout.value = null
    lastRecords.value = []
    historyCache.value.clear()
  }

  return {
    workout,
    loading,
    lastRecords,
    resume,
    refresh,
    start,
    finish,
    addExercise,
    removeExercise,
    reorder,
    logSet,
    updateSet,
    deleteSet,
    discard,
    exerciseHistory,
    setExerciseRest,
    reset,
  }
})

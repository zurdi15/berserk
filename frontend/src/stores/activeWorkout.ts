import { defineStore } from 'pinia'
import { ref } from 'vue'

import { ApiError } from '@/api/client'
import * as domain from '@/api/domain'
import type { PersonalRecordOut, SetIn, SetLogOut, WorkoutOut } from '@/api/domain'

export const useActiveWorkoutStore = defineStore('activeWorkout', () => {
  const workout = ref<WorkoutOut | null>(null)
  const loading = ref(false)
  const lastRecords = ref<PersonalRecordOut[]>([])

  async function resume() {
    loading.value = true
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
    workout.value = await domain.startWorkout(body)
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

  function reset() {
    workout.value = null
    lastRecords.value = []
  }

  return { workout, loading, lastRecords, resume, refresh, start, finish, addExercise, removeExercise, reorder, logSet, updateSet, deleteSet, reset }
})

import type { SetIn, SetLogOut } from '@/api/domain'

// Contrato mínimo que WorkoutExerciseCard/AddExerciseSheet necesitan de un
// "workout store". activeWorkout (entreno en vivo) y workoutEditor (edición
// retroactiva) lo satisfacen ambos por estructura (mismas firmas, sin
// implementar la interfaz explícitamente) — así las tarjetas dejan de saber
// qué store las está usando y cada vista pasa la suya como prop (ver
// WorkoutView.vue / WorkoutEditView.vue).
export interface WorkoutActions {
  addExercise(exerciseId: number): Promise<void>
  removeExercise(weid: number): Promise<void>
  reorder(ids: number[]): Promise<void>
  logSet(weid: number, body: SetIn): Promise<SetLogOut>
  updateSet(weid: number, sid: number, body: SetIn): Promise<void>
  deleteSet(weid: number, sid: number): Promise<void>
}

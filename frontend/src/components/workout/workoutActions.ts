import type { ExerciseHistoryOut, SetIn, SetLogOut } from '@/api/domain'

// Contrato mínimo que WorkoutExerciseCard/AddExerciseSheet necesitan de un
// "workout store". activeWorkout (entreno en vivo) y workoutEditor (edición
// retroactiva) lo satisfacen ambos por estructura (mismas firmas, sin
// implementar la interfaz explícitamente) — así las tarjetas dejan de saber
// qué store las está usando y cada vista pasa la suya como prop (ver
// WorkoutView.vue / WorkoutEditView.vue).
export interface WorkoutActions {
  // v0.17.0 bloques: blockLabel opcional — quien monta decide si las altas
  // caen en un bloque (el stepper del entreno pasa el visible); un
  // implementador que lo ignore (editor retroactivo) sigue cumpliendo el
  // contrato por estructura
  addExercise(exerciseId: number, blockLabel?: string | null): Promise<void>
  // v0.8.0 (zurdi rediseña la creación de superseries): añade DOS ejercicios
  // ya enlazados como superserie — opcional a propósito: solo el entreno en
  // vivo (activeWorkout) la implementa; el editor retroactivo no agrupa (v1)
  // y AddExerciseSheet oculta el check cuando la acción no existe
  addSupersetPair?(exerciseA: number, exerciseB: number, blockLabel?: string | null): Promise<void>
  removeExercise(weid: number): Promise<void>
  reorder(ids: number[]): Promise<void>
  logSet(weid: number, body: SetIn): Promise<SetLogOut>
  updateSet(weid: number, sid: number, body: SetIn): Promise<void>
  deleteSet(weid: number, sid: number): Promise<void>
  // item 3: historial de la última sesión terminada de este ejercicio, para
  // el prefill del drawer y el hint de la tarjeta — cacheado por store (ver
  // activeWorkout.ts/workoutEditor.ts), así que abrir el drawer dos veces
  // para el mismo ejercicio no repite la petición
  exerciseHistory(exerciseId: number): Promise<ExerciseHistoryOut | null>
  // item 11: override de descanso de este ejercicio en este entreno; null
  // limpia el override (vuelve a caer al target de rutina/default)
  setExerciseRest(weid: number, restSeconds: number | null): Promise<void>
  // v0.18.1: mover el ejercicio de bloque mid-entreno (null = sin bloque) —
  // opcional a propósito: solo el entreno en vivo lo implementa; la card
  // esconde el picker de bloque cuando la acción no existe (editor retro)
  setExerciseBlock?(weid: number, blockLabel: string | null): Promise<void>
  // v0.38.0 (zurdi: "check de marcar ejercicio como completado"): dar el
  // ejercicio por hecho (o des-marcarlo) — opcional como setExerciseBlock:
  // solo el entreno en vivo lo implementa y la card esconde el check sin él
  setExerciseCompleted?(weid: number, completed: boolean): Promise<void>
  // v0.12.0: nota persistente POR USUARIO y ejercicio ("asiento en el 5") —
  // se enseña en la card la siguiente sesión. Cacheada por store como el
  // historial; guardar vacío la borra. Sin rama offline (v1: exige red).
  exerciseNote(exerciseId: number): Promise<string>
  saveExerciseNote(exerciseId: number, note: string): Promise<string>
}

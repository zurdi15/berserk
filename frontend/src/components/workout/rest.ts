import type { RoutineOut } from '@/api/domain'

export const DEFAULT_REST_SECONDS = 90

// item 11: presets del picker de descanso de la tarjeta — pasos "de gimnasio"
// habituales, no un stepper libre (menos fricción que teclear un número cada vez)
export const REST_PRESETS = [60, 90, 120, 150, 180] as const

// item 7 (v0.4.3, zurdi): entrada manual JUNTO a los presets (stepper de 5 en
// 5) — cotas espejo de WorkoutExercisePatchIn.rest_seconds en el backend
// (schemas/workouts.py: Field(None, ge=5, le=900)), para que el cliente
// nunca pueda enviar un valor que el servidor vaya a rechazar
export const REST_MIN_SECONDS = 5
export const REST_MAX_SECONDS = 900
export const REST_STEP_SECONDS = 5

/**
 * Descanso a aplicar tras registrar una serie. Prioridad (item 11):
 *   1. override guardado en ESTE WorkoutExercise de ESTE entreno (el usuario
 *      lo cambió a mano para esta sesión, ver WorkoutExerciseCard's picker)
 *   2. rest_seconds configurado para ese ejercicio en la RUTINA de origen
 *   3. default general
 *
 * No recibe el WorkoutOut completo: WorkoutExerciseCard ya no lee el workout
 * de un store propio (ver workoutActions.ts), así que esto reduce su
 * superficie a lo mínimo que de verdad usa.
 */
export function restFor(
  workoutExerciseRestSeconds: number | null | undefined,
  routineId: number | null,
  routines: RoutineOut[],
  exerciseId: number,
): number {
  if (workoutExerciseRestSeconds != null) return workoutExerciseRestSeconds
  const routine = routineId ? routines.find((r) => r.id === routineId) : undefined
  const routineExercise = routine?.exercises.find((e) => e.exercise_id === exerciseId)
  return routineExercise?.rest_seconds ?? DEFAULT_REST_SECONDS
}

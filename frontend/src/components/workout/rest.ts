import type { RoutineOut } from '@/api/domain'

const DEFAULT_REST_SECONDS = 90

/**
 * Descanso a aplicar tras registrar una serie. Si el entreno viene de una
 * rutina, se respeta el rest_seconds configurado para ese ejercicio en ella;
 * si no (entreno libre, rutina borrada o ejercicio añadido fuera de la
 * rutina), se usa el default general.
 *
 * Recibe solo el routine_id (no el WorkoutOut completo): WorkoutExerciseCard
 * ya no lee el workout de un store propio (ver workoutActions.ts), así que
 * esto reduce su superficie a lo mínimo que de verdad usa.
 */
export function restFor(
  routineId: number | null,
  routines: RoutineOut[],
  exerciseId: number,
): number {
  const routine = routineId ? routines.find((r) => r.id === routineId) : undefined
  const routineExercise = routine?.exercises.find((e) => e.exercise_id === exerciseId)
  return routineExercise?.rest_seconds ?? DEFAULT_REST_SECONDS
}

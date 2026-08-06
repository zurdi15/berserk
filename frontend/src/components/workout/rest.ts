import type { RoutineOut, WorkoutOut } from '@/api/domain'

const DEFAULT_REST_SECONDS = 90

/**
 * Descanso a aplicar tras registrar una serie. Si el entreno viene de una
 * rutina, se respeta el rest_seconds configurado para ese ejercicio en ella;
 * si no (entreno libre, rutina borrada o ejercicio añadido fuera de la
 * rutina), se usa el default general.
 */
export function restFor(
  workout: WorkoutOut | null,
  routines: RoutineOut[],
  exerciseId: number,
): number {
  const routine = workout?.routine_id
    ? routines.find((r) => r.id === workout.routine_id)
    : undefined
  const routineExercise = routine?.exercises.find((e) => e.exercise_id === exerciseId)
  return routineExercise?.rest_seconds ?? DEFAULT_REST_SECONDS
}

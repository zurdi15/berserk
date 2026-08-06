import type { ExerciseHistorySetOut, RoutineOut, SetOut } from '@/api/domain'

export interface SetDefaults {
  reps?: number | null
  weight_kg?: number | null
  duration_seconds?: number | null
  distance_m?: number | null
}

/**
 * Prefill de una serie NUEVA (item 2): "que ponga por defecto el último
 * peso/reps registrado". Prioridad, de más a menos específico:
 *   1. última serie de ESTE ejercicio en ESTE entreno (ritmo de la sesión de hoy)
 *   2. última serie de la sesión ANTERIOR terminada (item 3, ver setHistoryFormat.ts)
 *   3. objetivo de la rutina (target_reps/target_weight_kg), si el entreno viene de una
 *   4. null → SetForm cae a sus propios defaults por medición (20kg×8, etc.)
 *
 * Deliberadamente NO incluye is_warmup/rpe: son propiedades de la serie en
 * sí (esfuerzo, si es calentamiento), no algo que tenga sentido "heredar" de
 * la última — SetForm ya los deja en su default neutro (false / sin fijar).
 */
export function resolveNewSetDefaults(
  workoutSets: SetOut[],
  historySets: ExerciseHistorySetOut[] | null | undefined,
  routineId: number | null,
  routines: RoutineOut[],
  exerciseId: number,
): SetDefaults | null {
  const lastInWorkout = workoutSets.at(-1)
  if (lastInWorkout) {
    return {
      reps: lastInWorkout.reps,
      weight_kg: lastInWorkout.weight_kg,
      duration_seconds: lastInWorkout.duration_seconds,
      distance_m: lastInWorkout.distance_m,
    }
  }

  const lastInHistory = historySets?.at(-1)
  if (lastInHistory) {
    return {
      reps: lastInHistory.reps,
      weight_kg: lastInHistory.weight_kg,
      duration_seconds: lastInHistory.duration_seconds,
      distance_m: lastInHistory.distance_m,
    }
  }

  const routine = routineId ? routines.find((r) => r.id === routineId) : undefined
  const target = routine?.exercises.find((e) => e.exercise_id === exerciseId)
  if (target && (target.target_reps != null || target.target_weight_kg != null)) {
    return { reps: target.target_reps, weight_kg: target.target_weight_kg }
  }

  return null
}

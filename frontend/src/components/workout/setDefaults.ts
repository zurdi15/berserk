import type { ExerciseHistorySetOut, LoadMode, RoutineOut, SetOut } from '@/api/domain'

export interface SetDefaults {
  reps?: number | null
  weight_kg?: number | null
  duration_seconds?: number | null
  distance_m?: number | null
  // v0.18.0: el modo kg/nivel HEREDA de la última serie (el default
  // inteligente que sustituye al ajuste por-ejercicio retirado) — el
  // objetivo de rutina es siempre kg
  load_mode?: LoadMode
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
  // fix de revisión (I1): la ÚLTIMA serie sin más, is_warmup incluido, hacía
  // que un calentamiento colado al final (p.ej. registrado después del
  // trabajo real, o una tanda de calentamientos antes de la primera serie
  // de trabajo) tapase el peso real con uno de calentamiento — se prioriza
  // la última serie EFECTIVA (no-calentamiento); el `?? workoutSets.at(-1)`
  // es el mismo criterio que el resto del módulo (setHistoryFormat.ts):
  // si TODA la sesión de hoy fue calentamiento, mejor mostrar ESO que nada
  const lastInWorkout = workoutSets.filter((s) => !s.is_warmup).at(-1) ?? workoutSets.at(-1)
  if (lastInWorkout) {
    return {
      reps: lastInWorkout.reps,
      weight_kg: lastInWorkout.weight_kg,
      duration_seconds: lastInWorkout.duration_seconds,
      distance_m: lastInWorkout.distance_m,
      load_mode: lastInWorkout.load_mode ?? 'weight',
    }
  }

  // mismo criterio que arriba, sobre la sesión ANTERIOR: si esa sesión
  // terminó en un calentamiento/enfriamiento tras el trabajo real (o el
  // entreno de hoy no tiene datos y hay que mirar la anterior desde cero),
  // la última serie EFECTIVA de esa sesión es la que de verdad importa
  const lastInHistory = historySets?.filter((s) => !s.is_warmup).at(-1) ?? historySets?.at(-1)
  if (lastInHistory) {
    return {
      reps: lastInHistory.reps,
      weight_kg: lastInHistory.weight_kg,
      duration_seconds: lastInHistory.duration_seconds,
      distance_m: lastInHistory.distance_m,
      load_mode: lastInHistory.load_mode ?? 'weight',
    }
  }

  const routine = routineId ? routines.find((r) => r.id === routineId) : undefined
  const target = routine?.exercises.find((e) => e.exercise_id === exerciseId)
  if (
    target &&
    (target.target_reps != null ||
      target.target_weight_kg != null ||
      // v0.23.0: el tiempo objetivo de cardio también es un default legítimo
      // (alimenta el cronómetro de "Empezar" vía cardioTargetSeconds)
      target.target_duration_seconds != null)
  ) {
    return {
      reps: target.target_reps,
      weight_kg: target.target_weight_kg,
      duration_seconds: target.target_duration_seconds ?? null,
    }
  }

  return null
}

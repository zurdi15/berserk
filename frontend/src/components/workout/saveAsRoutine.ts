import type { RoutineExerciseIn, WorkoutOut } from '@/api/domain'

// moda (valor más frecuente) de una lista de enteros — para target_reps: el
// "modo de reps" de la sesión, no un promedio que podría no ser un entero
// real que se haya hecho nunca (p.ej. media de 8 y 10 reps = 9, que no se hizo)
function mode(values: number[]): number | null {
  if (!values.length) return null
  const counts = new Map<number, number>()
  let best = values[0]
  let bestCount = 0
  for (const value of values) {
    const count = (counts.get(value) ?? 0) + 1
    counts.set(value, count)
    if (count > bestCount) {
      bestCount = count
      best = value
    }
  }
  return best
}

/**
 * Item 5: "guardar como plantilla entrenamiento" — compone el payload de
 * RoutineExerciseIn[] a partir de las series YA registradas del entreno, en
 * el mismo orden. Por ejercicio:
 *   - target_sets: nº de series EFECTIVAS (sin calentamiento); si todas
 *     fueron calentamiento, el total de series; si no hay ninguna, 3
 *     (default de RoutineExercise en el backend)
 *   - target_reps: moda de las reps de esas series (null si la medición no
 *     tiene reps, p.ej. timed/cardio)
 *   - target_weight_kg: peso de la ÚLTIMA serie efectiva con peso registrado
 *     ("last weight", el punto en el que se quedó la progresión)
 *   - rest_seconds: el descanso efectivo de ESTE entreno para el ejercicio
 *     (override si lo hubo, si no lo que ya traía — ver item 11)
 *
 * Composición puramente frontend: el endpoint de rutinas ya acepta esta
 * forma exacta (POST /routines + PUT /routines/{id}/exercises), no hace
 * falta un endpoint de backend dedicado para esto.
 */
export function buildRoutineExercisesFromWorkout(workout: WorkoutOut): RoutineExerciseIn[] {
  return workout.exercises.map((we) => {
    const effective = we.sets.filter((s) => !s.is_warmup)
    const source = effective.length ? effective : we.sets
    const reps = source.map((s) => s.reps).filter((r): r is number => r != null)
    const lastWeight = [...source].reverse().find((s) => s.weight_kg != null)?.weight_kg ?? null

    return {
      exercise_id: we.exercise_id,
      target_sets: source.length || 3,
      target_reps: mode(reps),
      target_weight_kg: lastWeight,
      rest_seconds: we.rest_seconds,
    }
  })
}

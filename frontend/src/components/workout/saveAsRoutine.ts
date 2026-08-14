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

// fix M5 (revisión): backend/app/schemas/routines.py::RoutineExerciseIn pone
// límites duros (target_sets ge=1/le=20, target_reps ge=1/le=200,
// target_weight_kg gt=0/le=1000, rest_seconds ge=5/le=900) — un entreno con
// más de 20 series efectivas de un ejercicio (dropsets, día de alto
// volumen) o un rest_seconds fuera de rango mandaría un 422 y dejaría la
// rutina recién creada huérfana (sin ejercicios). Se clampa aquí para no
// depender de que el 422 nunca pase; el catch de SaveAsRoutineSheet además
// borra la rutina huérfana si el PUT falla de todos modos (ver ese archivo).
function clampInt(value: number | null, min: number, max: number): number | null {
  if (value == null) return null
  return Math.min(max, Math.max(min, Math.round(value)))
}

// variante no-anulable para target_sets (el tipo del payload lo exige number,
// no number | null — nunca le pasamos null de entrada, así que no hace falta
// que la firma lo permita)
function clampSets(value: number): number {
  return Math.min(20, Math.max(1, Math.round(value)))
}

/**
 * Item 5: "guardar como plantilla entrenamiento" — compone el payload de
 * RoutineExerciseIn[] a partir de las series YA registradas del entreno, en
 * el mismo orden. Por ejercicio:
 *   - target_sets: nº de series EFECTIVAS (sin calentamiento); si todas
 *     fueron calentamiento, el total de series; si no hay ninguna, 3
 *     (default de RoutineExercise en el backend) — clampado a [1, 20]
 *   - target_reps: moda de las reps de esas series (null si la medición no
 *     tiene reps, p.ej. timed/cardio) — clampado a [1, 200]
 *   - target_weight_kg: peso de la ÚLTIMA serie efectiva con peso registrado
 *     ("last weight", el punto en el que se quedó la progresión) — clampado
 *     a (0, 1000]
 *   - rest_seconds: el descanso efectivo de ESTE entreno para el ejercicio
 *     (override si lo hubo, si no lo que ya traía — ver item 11) — clampado
 *     a [5, 900]
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
      target_sets: clampSets(source.length || 3),
      target_reps: clampInt(mode(reps), 1, 200),
      target_weight_kg: lastWeight != null && lastWeight > 0 ? Math.min(1000, lastWeight) : null,
      rest_seconds: clampInt(we.rest_seconds, 5, 900),
      // v0.5.0 superseries: el grouping del entreno viaja a la rutina tal
      // cual (mismo orden de ejercicios → misma contigüidad); si un reorden
      // mid-workout lo rompió, todos los lectores normalizan por contigüidad
      // (lib/supersets.ts) así que un run de 1 se disuelve solo
      superset_group: we.superset_group ?? null,
      // v0.17.0: los bloques del entreno también viajan a la rutina
      block_label: we.block_label ?? null,
    }
  })
}

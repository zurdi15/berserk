import type { ExerciseOut, RoutineOut } from '@/api/domain'
import { normalizeSupersets } from '@/lib/supersets'
import { DEFAULT_REST_SECONDS } from './rest'

// facelift (hero de Hoy + pantalla de pre-inicio): duración ESTIMADA de una
// rutina, en minutos — el backend no guarda este dato, es una heurística de
// cliente y se presenta siempre como "~N min", nunca como promesa.
// Modelo: cada serie cuesta un trabajo fijo + su descanso configurado; las
// superseries comparten UN descanso por ronda (se descansa tras el último
// miembro, no entre miembros — mismo contrato que autoRestFires en la vista
// de entreno); el cardio va a tarifa plana (mismo default de 20 min que el
// objetivo de cardio de WorkoutExerciseCard). Redondeo hacia arriba a 5 min:
// una estimación al minuto aparenta una precisión que no existe.
const WORK_SECONDS_PER_SET = 45
const CARDIO_FLAT_MINUTES = 20

export function estimateRoutineMinutes(
  routine: Pick<RoutineOut, 'exercises'>,
  exercises: ExerciseOut[],
): number {
  const byId = new Map(exercises.map((e) => [e.id, e]))
  const rows = routine.exercises
  if (rows.length === 0) return 0

  const groups = normalizeSupersets(rows.map((r) => r.superset_group ?? null))

  let seconds = 0
  let minutes = 0
  let i = 0
  while (i < rows.length) {
    // run contiguo del mismo grupo normalizado (null = run de 1)
    let end = i
    while (end + 1 < rows.length && groups[end + 1] !== null && groups[end + 1] === groups[i]) end += 1
    const run = rows.slice(i, end + 1)

    const strengthRows = run.filter((r) => byId.get(r.exercise_id)?.measurement !== 'cardio')
    const cardioRows = run.length - strengthRows.length
    minutes += cardioRows * CARDIO_FLAT_MINUTES

    if (strengthRows.length > 0) {
      // trabajo: cada miembro paga sus series; descanso: uno por RONDA del
      // grupo (la ronda la marca el miembro con más series)
      const rounds = Math.max(...strengthRows.map((r) => r.target_sets))
      const rest = strengthRows[strengthRows.length - 1].rest_seconds ?? DEFAULT_REST_SECONDS
      for (const row of strengthRows) seconds += row.target_sets * WORK_SECONDS_PER_SET
      seconds += rounds * rest
    }
    i = end + 1
  }

  const total = minutes + seconds / 60
  return Math.max(5, Math.ceil(total / 5) * 5)
}

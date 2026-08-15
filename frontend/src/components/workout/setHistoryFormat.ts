import type { ExerciseHistorySetOut, Measurement } from '@/api/domain'
import { formatLoad } from '@/utils/units'
import { formatDuration } from './duration'

// (v0.17.0: la línea densa agrupada formatHistoryLine murió — zurdi pidió el
// hint de la tarjeta también en líneas separadas, así que el bloque
// multilínea de abajo es ya el ÚNICO formato de "última vez")

// espaciado, no comprimido: reusa el mismo formato "reps × peso" que ya usan
// las filas de series logueadas en WorkoutExerciseCard.vue (formatSetValue),
// para que "última vez" y "lo que acabas de registrar" se lean igual
function setLineLabel(
  set: ExerciseHistorySetOut,
  measurement: Measurement,
  units: 'kg' | 'lb',
): string {
  // v0.18.0: el modo viaja en CADA serie — una sesión puede mezclar kg y
  // niveles (la polea de turno), y cada línea se pinta como se registró
  const loadMode = set.load_mode ?? 'weight'
  switch (measurement) {
    case 'strength':
      return `${set.reps} × ${formatLoad(set.weight_kg ?? 0, units, loadMode)}`
    case 'bodyweight':
      return set.weight_kg != null ? `${set.reps} × ${formatLoad(set.weight_kg, units, loadMode)}` : `${set.reps}`
    case 'timed':
      return formatDuration(set.duration_seconds ?? 0)
    case 'cardio':
      return set.distance_m
        ? `${formatDuration(set.duration_seconds ?? 0)} · ${set.distance_m} m`
        : formatDuration(set.duration_seconds ?? 0)
    default:
      return ''
  }
}

/**
 * Bloque multilínea de "última vez" (item 4, ronda de pulido v0.3.0): una
 * línea por serie EFECTIVA, "Sn · reps × peso" (n = posición entre las
 * series efectivas, no el set_number crudo del backend, que puede incluir
 * calentamientos intercalados) — a diferencia de formatHistoryLine, aquí NO
 * se agrupan series consecutivas iguales: en el cajón sobra sitio vertical
 * (zurdi: "hay sitio de sobra ahí") y ver cada serie por separado es más
 * legible que un "3×8·80kg" comprimido. Ni un solo em/en-dash: el separador
 * es el punto medio "·", igual que en el resto de la app.
 *
 * Mismo criterio que formatHistoryLine para calentamiento-solo: si NINGUNA
 * serie es efectiva, se listan las de calentamiento igualmente en vez de
 * devolver un array vacío.
 */
export function formatHistorySetLines(
  sets: ExerciseHistorySetOut[],
  measurement: Measurement,
  units: 'kg' | 'lb',
): string[] {
  const effective = sets.filter((s) => !s.is_warmup)
  const source = effective.length ? effective : sets
  return source.map((set, i) => `S${i + 1} · ${setLineLabel(set, measurement, units)}`)
}

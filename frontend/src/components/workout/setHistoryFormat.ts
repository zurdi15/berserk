import type { ExerciseHistorySetOut, Measurement } from '@/api/domain'
import { formatWeight } from '@/utils/units'
import { formatDuration } from './duration'

// clave de agrupación: dos series consecutivas con la MISMA clave se funden
// en un solo "Nx" (ver formatHistoryLine) — el rpe no entra en la clave
// porque no es parte del "valor" de la serie a efectos de este resumen
function setKey(set: ExerciseHistorySetOut, measurement: Measurement): string {
  switch (measurement) {
    case 'strength':
      return `${set.reps}|${set.weight_kg}`
    case 'bodyweight':
      return `${set.reps}|${set.weight_kg ?? ''}`
    case 'timed':
      return `${set.duration_seconds}`
    case 'cardio':
      return `${set.duration_seconds}|${set.distance_m ?? ''}`
    default:
      return ''
  }
}

function setLabel(set: ExerciseHistorySetOut, measurement: Measurement, units: 'kg' | 'lb'): string {
  switch (measurement) {
    case 'strength':
      return `${set.reps}·${formatWeight(set.weight_kg ?? 0, units)}`
    case 'bodyweight':
      return set.weight_kg != null ? `${set.reps}·${formatWeight(set.weight_kg, units)}` : `${set.reps}`
    case 'timed':
      return formatDuration(set.duration_seconds ?? 0)
    case 'cardio':
      return set.distance_m
        ? `${formatDuration(set.duration_seconds ?? 0)}·${set.distance_m} m`
        : formatDuration(set.duration_seconds ?? 0)
    default:
      return ''
  }
}

/**
 * Línea densa de una sesión anterior (item 3): "4×8·80kg, 4×8·82.5kg…" — las
 * series CONSECUTIVAS con el mismo valor se funden en un solo grupo "Nx" en
 * vez de listar cada serie por separado, para que quepa en una línea bajo el
 * formulario del drawer o en el hint de la tarjeta compacta.
 *
 * Los calentamientos se excluyen del resumen si hay al menos una serie
 * efectiva (igual criterio que "efectivo" en el resto de la app); si TODA la
 * sesión fue calentamiento (raro, pero posible), se listan igualmente en vez
 * de devolver una línea vacía.
 */
export function formatHistoryLine(
  sets: ExerciseHistorySetOut[],
  measurement: Measurement,
  units: 'kg' | 'lb',
): string {
  const effective = sets.filter((s) => !s.is_warmup)
  const source = effective.length ? effective : sets
  const groups: { key: string; label: string; count: number }[] = []
  for (const set of source) {
    const key = setKey(set, measurement)
    const last = groups.at(-1)
    if (last && last.key === key) {
      last.count += 1
    } else {
      groups.push({ key, label: setLabel(set, measurement, units), count: 1 })
    }
  }
  return groups.map((g) => (g.count > 1 ? `${g.count}×${g.label}` : g.label)).join(', ')
}

// espaciado, no comprimido: reusa el mismo formato "reps × peso" que ya usan
// las filas de series logueadas en WorkoutExerciseCard.vue (formatSetValue),
// para que "última vez" y "lo que acabas de registrar" se lean igual
function setLineLabel(set: ExerciseHistorySetOut, measurement: Measurement, units: 'kg' | 'lb'): string {
  switch (measurement) {
    case 'strength':
      return `${set.reps} × ${formatWeight(set.weight_kg ?? 0, units)}`
    case 'bodyweight':
      return set.weight_kg != null ? `${set.reps} × ${formatWeight(set.weight_kg, units)}` : `${set.reps}`
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

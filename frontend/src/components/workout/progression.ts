import type { ExerciseHistorySetOut } from '@/api/domain'

// v0.24.0 — sugerencia de progresión (doble progresión, v1): si la ÚLTIMA
// sesión cumplió el objetivo entero de la rutina (todas las series efectivas
// al mismo peso y llegando a las reps objetivo), se sugiere subir el peso.
// Deliberadamente conservador: sesiones piramidales (pesos distintos), en
// modo nivel, sin objetivo de rutina o incompletas NO sugieren nada — mejor
// callar que sugerir un peso inventado. El incremento es fijo en kg (los
// discos pequeños de cualquier gimnasio); en lb se muestra convertido, como
// cualquier otro peso.
export const PROGRESSION_INCREMENT_KG = 2.5

export interface ProgressionTarget {
  target_sets: number
  target_reps: number | null
}

export function suggestNextLoad(
  historySets: ExerciseHistorySetOut[] | null | undefined,
  target: ProgressionTarget | undefined,
): number | null {
  if (!historySets?.length || !target || target.target_reps == null) return null
  const effective = historySets.filter(
    (s) =>
      !s.is_warmup &&
      (s.load_mode ?? 'weight') === 'weight' &&
      s.weight_kg != null &&
      s.reps != null,
  )
  // el volumen prescrito entero: menos series que el objetivo = sesión
  // incompleta, nada que subir
  if (effective.length < (target.target_sets ?? 1)) return null
  const top = Math.max(...effective.map((s) => s.weight_kg ?? 0))
  if (top <= 0) return null
  // sesión "plana" al peso de trabajo: todas las efectivas al mismo peso…
  if (!effective.every((s) => s.weight_kg === top)) return null
  // …y todas llegando (o pasando) las reps objetivo
  if (!effective.every((s) => (s.reps ?? 0) >= (target.target_reps ?? 0))) return null
  return Math.min(1000, top + PROGRESSION_INCREMENT_KG)
}

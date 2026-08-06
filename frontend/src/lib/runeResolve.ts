import type { ExerciseOut, MuscleGroupOut } from '@/api/domain'
import { RUNES, type RuneName } from '@/lib/runes'

// validar si un slug es un RuneName válido para renderizar como BkRune
export function isValidRuneName(slug: string): slug is RuneName {
  return Object.keys(RUNES).includes(slug)
}

// runa del grupo muscular primario de un ejercicio, resuelta contra el catálogo;
// null si no tiene grupo primario o su slug no mapea a una runa conocida.
// Compartida entre la tarjeta de entreno y la celebración de PR: misma regla,
// un único sitio que la sabe.
export function primaryRune(
  exercise: ExerciseOut | undefined,
  muscleGroups: MuscleGroupOut[],
): RuneName | null {
  const link = exercise?.muscle_groups.find((m) => m.is_primary)
  if (!link) return null
  const group = muscleGroups.find((g) => g.id === link.muscle_group_id)
  return group && isValidRuneName(group.slug) ? group.slug : null
}

// item 6: grupo muscular primario COMPLETO de un ejercicio (no solo su
// runa) — lo usan los tags de biblioteca/pickers que además del icono
// muestran el nombre del grupo en filas anchas. Misma búsqueda que
// primaryRune, pero sin descartar el grupo cuando su slug no mapea a runa.
export function primaryMuscleGroup(
  exercise: ExerciseOut | undefined,
  muscleGroups: MuscleGroupOut[],
): MuscleGroupOut | undefined {
  const link = exercise?.muscle_groups.find((m) => m.is_primary)
  if (!link) return undefined
  return muscleGroups.find((g) => g.id === link.muscle_group_id)
}

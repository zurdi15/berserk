import type { ExerciseOut, MuscleGroupOut } from '@/api/domain'
import { RUNES, type RuneName } from '@/lib/runes'

// validar si un slug es un RuneName válido para renderizar como BkRune
export function isValidRuneName(slug: string): slug is RuneName {
  return Object.keys(RUNES).includes(slug)
}

// item 14: runa EFECTIVA de un grupo muscular — su campo `rune` dedicado si
// lo tiene (asignación libre, ya no atada al slug), si no cae al slug
// (legacy: grupos sembrados antes de la columna dedicada, o custom sin runa
// propia asignada). Punto ÚNICO de verdad: cualquier consumidor que necesite
// "la runa de este grupo" pasa por aquí, nunca lee group.slug a pelo — ver
// item 14(c): calendario, tags de biblioteca, distribución, etc.
export function groupRune(group: MuscleGroupOut | undefined): RuneName | null {
  if (!group) return null
  const candidate = group.rune ?? group.slug
  return isValidRuneName(candidate) ? candidate : null
}

// runa del grupo muscular primario de un ejercicio, resuelta contra el catálogo;
// null si no tiene grupo primario o ninguna runa (dedicada ni derivada del
// slug) mapea a una runa conocida. Compartida entre la tarjeta de entreno y
// la celebración de PR: misma regla, un único sitio que la sabe.
export function primaryRune(
  exercise: ExerciseOut | undefined,
  muscleGroups: MuscleGroupOut[],
): RuneName | null {
  const link = exercise?.muscle_groups.find((m) => m.is_primary)
  if (!link) return null
  const group = muscleGroups.find((g) => g.id === link.muscle_group_id)
  return groupRune(group)
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

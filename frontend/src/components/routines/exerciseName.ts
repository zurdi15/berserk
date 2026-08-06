import type { ExerciseOut } from '@/api/domain'

/**
 * Resuelve el nombre del ejercicio según la locale.
 * Por qué: permite reutilizar la lógica de traducción de ejercicios
 * en componentes y pruebas sin duplicar la lógica. Es null-safe por
 * si el catálogo no está cargado aún.
 */
export function exerciseName(exercise: ExerciseOut | undefined, locale: string): string {
  if (!exercise) return ''
  return locale === 'es' ? exercise.name_es : exercise.name_en
}

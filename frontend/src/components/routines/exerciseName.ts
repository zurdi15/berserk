import type { ExerciseOut } from '@/api/domain'

/**
 * Resuelve el nombre del ejercicio según la locale.
 * Por qué: permite reutilizar la lógica de traducción de ejercicios
 * en componentes y pruebas sin duplicar la lógica.
 */
export function exerciseName(exercise: ExerciseOut, locale: string): string {
  return locale === 'es' ? exercise.name_es : exercise.name_en
}

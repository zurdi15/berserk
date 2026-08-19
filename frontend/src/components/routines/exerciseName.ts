import type { ExerciseOut } from '@/api/domain'

/**
 * Resuelve el nombre del ejercicio según la locale.
 * Por qué: permite reutilizar la lógica de traducción de ejercicios
 * en componentes y pruebas sin duplicar la lógica. Es null-safe por
 * si el catálogo no está cargado aún.
 * v0.19.x (zurdi): name_en es OPCIONAL ('' = sin traducción) — con la app
 * en inglés se cae al nombre ES antes que enseñar una fila vacía.
 */
export function exerciseName(exercise: ExerciseOut | undefined, locale: string): string {
  if (!exercise) return ''
  return locale === 'es' ? exercise.name_es : exercise.name_en || exercise.name_es
}

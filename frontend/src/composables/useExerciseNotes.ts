import { ref } from 'vue'

import type { ExerciseOut } from '@/api/domain'
import { getExerciseNote } from '@/api/domain'

const cache = new Map<string, string>()

function cacheKey(scope: string | number, exerciseId: number): string {
  return `${String(scope)}:${exerciseId}`
}

export function useExerciseNotes() {
  const notes = ref(new Map<number, string>())

  async function load(exercises: ExerciseOut[], scope: string | number = 'me'): Promise<void> {
    const missing = exercises.filter((exercise) => !cache.has(cacheKey(scope, exercise.id)))
    if (missing.length > 0) {
      const loaded = await Promise.all(
        missing.map(async (exercise) => [exercise.id, (await getExerciseNote(exercise.id)).note] as const),
      )
      for (const [exerciseId, note] of loaded) {
        cache.set(cacheKey(scope, exerciseId), note)
      }
    }

    notes.value = new Map(
      exercises
        .map((exercise) => [exercise.id, cache.get(cacheKey(scope, exercise.id)) ?? ''] as const),
    )
  }

  function noteFor(exerciseId: number): string {
    return notes.value.get(exerciseId) ?? ''
  }

  return { notes, load, noteFor }
}

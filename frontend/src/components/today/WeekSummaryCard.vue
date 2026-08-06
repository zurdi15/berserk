<script setup lang="ts">
import { computed } from 'vue'
import type { RuneName } from '@/lib/runes'
import type { WorkoutOut, ExerciseOut, MuscleGroupOut } from '@/api/domain'

import BkCard from '@/lib/BkCard.vue'
import BkRune from '@/lib/BkRune.vue'

const props = withDefaults(
  defineProps<{
    workouts: WorkoutOut[]
    exercises: ExerciseOut[]
    muscleGroups: MuscleGroupOut[]
  }>(),
  {
    workouts: () => [],
    exercises: () => [],
    muscleGroups: () => [],
  },
)

const validRunes = new Set<string>(['chest', 'back', 'biceps', 'triceps', 'shoulders', 'legs', 'core'])

const workoutDays = computed(() => {
  const uniqueDates = new Set(props.workouts.map((w) => w.date))
  return uniqueDates.size
})

// calcular series efectivas (no-warmup) desde los entrenamientos ya obtenidos,
// una única ventana temporal para precisión
const effectiveSets = computed(() => {
  let total = 0
  for (const workout of props.workouts) {
    for (const exercise of workout.exercises) {
      for (const set of exercise.sets) {
        if (!set.is_warmup) {
          total += 1
        }
      }
    }
  }
  return total
})

// derivar grupos musculares de muscle_tag_ids + grupos primarios de ejercicios del entrenamiento
const muscleGroupsInWeek = computed(() => {
  const muscleGroupMap = new Map(props.muscleGroups.map((mg) => [mg.id, mg]))
  const exerciseMap = new Map(props.exercises.map((e) => [e.id, e]))
  const seenMuscleGroupIds = new Set<number>()

  // recolectar de muscle_tag_ids explícitos en entrenamientos
  for (const workout of props.workouts) {
    for (const mgId of workout.muscle_tag_ids) {
      seenMuscleGroupIds.add(mgId)
    }
  }

  // recolectar grupos primarios de ejercicios
  for (const workout of props.workouts) {
    for (const exercise of workout.exercises) {
      const ex = exerciseMap.get(exercise.exercise_id)
      if (ex) {
        for (const link of ex.muscle_groups) {
          if (link.is_primary) {
            seenMuscleGroupIds.add(link.muscle_group_id)
          }
        }
      }
    }
  }

  const result: MuscleGroupOut[] = []
  for (const mgId of seenMuscleGroupIds) {
    const mg = muscleGroupMap.get(mgId)
    if (mg && validRunes.has(mg.slug)) {
      result.push(mg)
    }
  }
  return result
})
</script>

<template>
  <BkCard :title="$t('today.weekSummary')">
    <div class="space-y-4">
      <div class="flex justify-between text-sm">
        <div>
          <p class="text-ink-muted">{{ $t('today.workoutDays') }}</p>
          <p class="text-xl font-semibold text-ink">{{ workoutDays }}</p>
        </div>
        <div>
          <p class="text-ink-muted">{{ $t('today.effectiveSets') }}</p>
          <p class="text-xl font-semibold text-ink">{{ effectiveSets }}</p>
        </div>
      </div>

      <div v-if="muscleGroupsInWeek.length > 0" class="pt-2 border-t border-line">
        <p class="text-ink-muted text-sm mb-2">{{ $t('today.muscleGroupsTouched') }}</p>
        <div class="flex flex-wrap gap-2">
          <BkRune
            v-for="mg in muscleGroupsInWeek"
            :key="mg.id"
            :name="(mg.slug as RuneName)"
            :size="24"
          />
        </div>
      </div>
    </div>
  </BkCard>
</template>

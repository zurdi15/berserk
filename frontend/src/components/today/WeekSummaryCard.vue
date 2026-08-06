<script setup lang="ts">
import { computed } from 'vue'
import type { RuneName } from '@/lib/runes'

import BkCard from '@/lib/BkCard.vue'
import BkRune from '@/lib/BkRune.vue'

interface Workout {
  id: number
  date: string
}

interface DistributionItem {
  muscle_group_id: number
  sets: number
}

interface MuscleGroup {
  id: number
  slug: string
  name_es: string
  name_en: string
}

const props = withDefaults(
  defineProps<{
    workouts: Workout[]
    distribution: DistributionItem[]
    muscleGroups: MuscleGroup[]
  }>(),
  {
    workouts: () => [],
    distribution: () => [],
    muscleGroups: () => [],
  },
)

const validRunes = new Set<string>(['chest', 'back', 'biceps', 'triceps', 'shoulders', 'legs', 'core'])

const workoutDays = computed(() => {
  const uniqueDates = new Set(props.workouts.map((w) => w.date))
  return uniqueDates.size
})

const effectiveSets = computed(() =>
  props.distribution.reduce((sum, item) => sum + item.sets, 0),
)

const muscleGroupsInDistribution = computed(() => {
  const muscleGroupMap = new Map(props.muscleGroups.map((mg) => [mg.id, mg]))
  return props.distribution
    .map((item) => muscleGroupMap.get(item.muscle_group_id))
    .filter((mg) => mg !== undefined && validRunes.has(mg.slug)) as MuscleGroup[]
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

      <div v-if="muscleGroupsInDistribution.length > 0" class="pt-2 border-t border-line">
        <p class="text-ink-muted text-sm mb-2">{{ $t('today.muscleGroupsTouched') }}</p>
        <div class="flex flex-wrap gap-2">
          <BkRune
            v-for="mg in muscleGroupsInDistribution"
            :key="mg.id"
            :name="(mg.slug as RuneName)"
            :size="24"
          />
        </div>
      </div>
    </div>
  </BkCard>
</template>

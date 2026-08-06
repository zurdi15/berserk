<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'

import BkCard from '@/lib/BkCard.vue'
import type { PersonalRecordOut, ExerciseOut } from '@/api/domain'
import { useDisplayUnits } from '@/composables/useDisplayUnits'
import { formatWeight } from '@/utils/units'

const props = withDefaults(
  defineProps<{
    records: PersonalRecordOut[]
    exercises: ExerciseOut[]
  }>(),
  {
    records: () => [],
    exercises: () => [],
  },
)

const { locale } = useI18n()
const units = useDisplayUnits()

const recentRecords = computed(() => props.records.slice(0, 5))

const exerciseMap = computed(() => new Map(props.exercises.map((e) => [e.id, e])))

function getExerciseName(exerciseId: number): string {
  const ex = exerciseMap.value.get(exerciseId)
  if (!ex) return '–'
  return locale.value === 'es' ? ex.name_es : ex.name_en
}

// los 3 kinds de PR son magnitudes en kg: todos pasan por formatWeight (ver
// PrList/BkCelebration — antes max_volume se mostraba sin convertir)
function formatRecordValue(record: PersonalRecordOut): string {
  return formatWeight(record.value, units.value)
}

function formatAchievedDate(dateStr: string): string {
  const date = new Date(dateStr)
  return new Intl.DateTimeFormat(locale.value, { month: 'short', day: 'numeric' }).format(date)
}
</script>

<template>
  <BkCard v-if="recentRecords.length > 0" :title="$t('today.recentPrs')">
    <div class="space-y-2">
      <div v-for="record in recentRecords" :key="record.id" class="flex items-center justify-between py-2 px-3 bg-stone rounded">
        <div class="flex-1">
          <p class="text-sm font-medium text-ink-muted">
            {{ $t(`progress.kinds.${record.kind}`) }}
          </p>
          <p class="font-medium text-ink">{{ getExerciseName(record.exercise_id) }}</p>
        </div>
        <div class="text-right">
          <p class="text-lg font-semibold text-ember">{{ formatRecordValue(record) }}</p>
          <p class="text-xs text-ink-muted">{{ formatAchievedDate(record.achieved_at) }}</p>
        </div>
      </div>
    </div>
  </BkCard>
</template>

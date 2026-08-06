<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'

import type { ExerciseOut, PersonalRecordOut } from '@/api/domain'
import { exerciseName } from '@/components/routines/exerciseName'
import BkEmpty from '@/lib/BkEmpty.vue'
import BkRune from '@/lib/BkRune.vue'
import { useAthleteStore } from '@/stores/athlete'
import { useAuthStore } from '@/stores/auth'
import { formatWeight } from '@/utils/units'

const props = withDefaults(
  defineProps<{ records: PersonalRecordOut[]; exercises: ExerciseOut[] }>(),
  { records: () => [], exercises: () => [] },
)

const { t, locale } = useI18n()
const auth = useAuthStore()
const athlete = useAthleteStore()

const units = computed(() => ((athlete.viewing?.units ?? auth.user?.units ?? 'kg') as 'kg' | 'lb'))
const exerciseMap = computed(() => new Map(props.exercises.map((e) => [e.id, e])))

function getExerciseName(exerciseId: number): string {
  return exerciseName(exerciseMap.value.get(exerciseId), locale.value) || '–'
}

// max_weight/est_1rm son magnitudes de peso (kg): pasan por formatWeight con
// la unidad de display; max_volume se muestra como número puro (mismo criterio
// que RecentPrs/FinishSummary)
function formatRecordValue(record: PersonalRecordOut): string {
  if (record.kind === 'max_weight' || record.kind === 'est_1rm') {
    return formatWeight(record.value, units.value)
  }
  return String(record.value)
}

function formatAchievedDate(dateStr: string): string {
  return new Intl.DateTimeFormat(locale.value, { month: 'short', day: 'numeric', year: 'numeric' }).format(
    new Date(dateStr),
  )
}
</script>

<template>
  <BkEmpty v-if="!records.length" :message="t('progress.noRecords')" />
  <div v-else class="space-y-2">
    <div
      v-for="record in records"
      :key="record.id"
      :data-testid="`pr-row-${record.id}`"
      class="flex items-center justify-between py-2 px-3 bg-stone rounded-sm"
    >
      <div class="flex items-center gap-2 min-w-0">
        <BkRune name="pr" :size="20" tone="ember" />
        <div class="min-w-0">
          <p class="text-sm font-medium text-ink-muted">{{ t(`progress.kinds.${record.kind}`) }}</p>
          <p class="text-sm text-ink truncate">{{ getExerciseName(record.exercise_id) }}</p>
        </div>
      </div>
      <div class="text-right shrink-0">
        <p class="text-ember font-semibold" data-testid="pr-value">{{ formatRecordValue(record) }}</p>
        <p class="text-xs text-ink-faint">{{ formatAchievedDate(record.achieved_at) }}</p>
      </div>
    </div>
  </div>
</template>

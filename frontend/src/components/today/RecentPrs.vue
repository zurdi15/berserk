<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'

import BkAnimatedNumber from '@/lib/BkAnimatedNumber.vue'
import BkCard from '@/lib/BkCard.vue'
import type { PersonalRecordOut, ExerciseOut } from '@/api/domain'
import { useDisplayUnits } from '@/composables/useDisplayUnits'
import { parseUtc } from '@/utils/datetime'
import { formatWeight, formatWeightInt } from '@/utils/units'

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
  if (!ex) return ''
  return locale.value === 'es' ? ex.name_es : ex.name_en
}

// los 3 kinds de PR son magnitudes en kg: todos pasan por formatWeight/Int
// (ver PrList/BkCelebration — antes max_volume se mostraba sin convertir).
// max_weight es un peso REAL registrado: conserva su precisión. est_1rm y
// max_volume son magnitudes DERIVADAS (estimación / suma agregada): zurdi
// pidió sin decimales para esas — ver formatWeightInt en utils/units.ts
// v0.17.0: modo nivel = número plano sin unidad (mismo criterio que PrList)
function formatRecordValue(value: number, record: PersonalRecordOut): string {
  if (exerciseMap.value.get(record.exercise_id)?.load_mode === 'level') return `${value}`
  return record.kind === 'max_weight'
    ? formatWeight(value, units.value)
    : formatWeightInt(value, units.value)
}

function formatAchievedDate(dateStr: string): string {
  const date = parseUtc(dateStr)
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
          <!-- decimals: max_weight es peso real (1 decimal, formatWeight no
               redondea en kg y el tween pintaría colas de flotante sin esto);
               est_1rm/max_volume son derivados y van a entero (0) -->
          <BkAnimatedNumber :value="record.value" :decimals="record.kind === 'max_weight' ? 1 : 0" v-slot="{ value }">
            <p class="text-lg font-semibold text-ember tabular-nums">{{ formatRecordValue(value ?? 0, record) }}</p>
          </BkAnimatedNumber>
          <p class="text-xs text-ink-muted">{{ formatAchievedDate(record.achieved_at) }}</p>
        </div>
      </div>
    </div>
  </BkCard>
</template>

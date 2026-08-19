<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'

import BkAnimatedNumber from '@/lib/BkAnimatedNumber.vue'
import BkCard from '@/lib/BkCard.vue'
import BkRune from '@/lib/BkRune.vue'
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
  // v0.19.x: name_en opcional — sin traducción se cae al ES
  return locale.value === 'es' ? ex.name_es : ex.name_en || ex.name_es
}

// los 3 kinds de PR son magnitudes en kg: todos pasan por formatWeight/Int
// (ver PrList/BkCelebration — antes max_volume se mostraba sin convertir).
// max_weight es un peso REAL registrado: conserva su precisión. est_1rm y
// max_volume son magnitudes DERIVADAS (estimación / suma agregada): zurdi
// pidió sin decimales para esas — ver formatWeightInt en utils/units.ts
// v0.18.0: modo nivel = número plano sin unidad, leído DEL récord (mismo
// criterio que PrList)
function formatRecordValue(value: number, record: PersonalRecordOut): string {
  if ((record.load_mode ?? 'weight') === 'level') return `${value}`
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
      <!-- facelift: filas estilo BkListRow (pozo de runa PR + nombre grande),
           valor ember protagonista a la derecha -->
      <div v-for="record in recentRecords" :key="record.id" class="flex items-center gap-3 rounded-lg bg-slab p-3">
        <span class="flex items-center justify-center w-10 h-10 rounded-md bg-stone shrink-0 text-ember">
          <BkRune name="pr" :size="20" />
        </span>
        <div class="flex-1 min-w-0">
          <p class="text-base font-medium text-ink truncate">{{ getExerciseName(record.exercise_id) }}</p>
          <p class="text-sm text-ink-muted">{{ $t(`progress.kinds.${record.kind}`) }}</p>
        </div>
        <div class="text-right shrink-0">
          <!-- decimals: max_weight es peso real (1 decimal, formatWeight no
               redondea en kg y el tween pintaría colas de flotante sin esto);
               est_1rm/max_volume son derivados y van a entero (0) -->
          <BkAnimatedNumber :value="record.value" :decimals="record.kind === 'max_weight' ? 1 : 0" v-slot="{ value }">
            <p class="bk-metric text-lg text-ember">{{ formatRecordValue(value ?? 0, record) }}</p>
          </BkAnimatedNumber>
          <p class="text-xs text-ink-muted">{{ formatAchievedDate(record.achieved_at) }}</p>
        </div>
      </div>
    </div>
  </BkCard>
</template>

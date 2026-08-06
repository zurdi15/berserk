<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'

import type { ExerciseOut, PersonalRecordOut } from '@/api/domain'
import { exerciseName } from '@/components/routines/exerciseName'
import { useDisplayUnits } from '@/composables/useDisplayUnits'
import BkAnimatedNumber from '@/lib/BkAnimatedNumber.vue'
import BkEmpty from '@/lib/BkEmpty.vue'
import BkRune from '@/lib/BkRune.vue'
import { parseUtc } from '@/utils/datetime'
import { formatWeight, formatWeightInt } from '@/utils/units'

const props = withDefaults(
  defineProps<{ records: PersonalRecordOut[]; exercises: ExerciseOut[] }>(),
  { records: () => [], exercises: () => [] },
)

const { t, locale } = useI18n()
const units = useDisplayUnits()
const exerciseMap = computed(() => new Map(props.exercises.map((e) => [e.id, e])))

function getExerciseName(exerciseId: number): string {
  return exerciseName(exerciseMap.value.get(exerciseId), locale.value) || ''
}

// los 3 kinds de PR (max_weight, est_1rm, max_volume) son magnitudes en kg —
// mismo criterio que BkCelebration: todos pasan por formatWeight/Int, sin
// caso especial de conversión para max_volume (antes se mostraba como número
// pelado). max_weight es un peso REAL registrado: conserva su precisión.
// est_1rm/max_volume son DERIVADOS (estimación/suma agregada): sin decimales
function formatRecordValue(value: number, kind: string): string {
  return kind === 'max_weight' ? formatWeight(value, units.value) : formatWeightInt(value, units.value)
}

function formatAchievedDate(dateStr: string): string {
  return new Intl.DateTimeFormat(locale.value, { month: 'short', day: 'numeric', year: 'numeric' }).format(
    parseUtc(dateStr),
  )
}
</script>

<template>
  <BkEmpty v-if="!records.length" :message="t('progress.noRecords')" />
  <div v-else class="space-y-2 flex-1 min-h-0 overflow-y-auto">
    <!-- item 8: sin tope propio (max-h-72) — el padre (ProgressView, pestaña
         Récords) le da el hueco vía flex-1 min-h-0, mismo patrón que la lista
         de ExercisePicker en la pestaña Entrenos (item 3c). (comentario
         DENTRO de la raíz condicional: como hermano de nivel superior sería
         un nodo extra en el fragmento y rompería la resolución de root del
         componente, ver el comentario equivalente en ProgressView.vue) -->
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
        <!-- decimals: max_weight es peso real (1 decimal, formatWeight no
             redondea en kg); est_1rm/max_volume son derivados y van a entero -->
        <BkAnimatedNumber :value="record.value" :decimals="record.kind === 'max_weight' ? 1 : 0" v-slot="{ value }">
          <p class="text-ember font-semibold tabular-nums" data-testid="pr-value">{{ formatRecordValue(value ?? 0, record.kind) }}</p>
        </BkAnimatedNumber>
        <p class="text-xs text-ink-faint">{{ formatAchievedDate(record.achieved_at) }}</p>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'

import type { ExerciseOut, PersonalRecordOut } from '@/api/domain'
import { exerciseName } from '@/components/routines/exerciseName'
import { useDisplayUnits } from '@/composables/useDisplayUnits'
import BkAnimatedNumber from '@/lib/BkAnimatedNumber.vue'
import BkEmpty from '@/lib/BkEmpty.vue'
import BkRune from '@/lib/BkRune.vue'
import BkTabs from '@/lib/BkTabs.vue'
import { parseUtc } from '@/utils/datetime'
import { formatWeight, formatWeightInt } from '@/utils/units'

const props = withDefaults(
  defineProps<{ records: PersonalRecordOut[]; exercises: ExerciseOut[] }>(),
  { records: () => [], exercises: () => [] },
)

const { t, locale } = useI18n()
const units = useDisplayUnits()
const exerciseMap = computed(() => new Map(props.exercises.map((e) => [e.id, e])))

// item 7 (v0.4.0): selector Todos/Peso Máx/Volumen Máx/Est. 1RM sobre los
// records YA cargados — mismo idioma que el selector de métrica de Entrenos
// (mini BkTabs, ver ProgressView metricTabs): un toggle de DATO, no una
// sección nueva, así que filtra en cliente (sin refetch) y NO debe remontar
// la lista al cambiar (ver test de identidad de nodo en progress.spec.ts)
type KindFilter = 'all' | 'max_weight' | 'max_volume' | 'est_1rm'
const kindFilter = ref<KindFilter>('all')

const kindTabs = computed(() => [
  { value: 'all', label: t('progress.kinds.all') },
  { value: 'max_weight', label: t('progress.kinds.max_weight') },
  { value: 'max_volume', label: t('progress.kinds.max_volume') },
  { value: 'est_1rm', label: t('progress.kinds.est_1rm') },
])

const filteredRecords = computed(() =>
  kindFilter.value === 'all' ? props.records : props.records.filter((record) => record.kind === kindFilter.value),
)

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
  <div class="flex flex-col gap-2">
    <!-- item 7: root SIEMPRE presente (ya no alterna BkEmpty/lista como
         root). v0.5.0 (modelo de scroll único): la lista FLUYE — sin scroll
         propio ni cadena flex con el padre, los récords crecen con su
         contenido y scrollean contra <main> con la tira de pestañas de
         ProgressView pegada arriba. (comentario DENTRO de la raíz: como
         hermano de nivel superior del <div> sería un nodo extra en el
         fragmento y rompería tanto el fall-through de atributos como la
         resolución de root del componente)
         Todos/Peso Máx/Volumen Máx/Est. 1RM: reusa las mismas etiquetas que
         cada fila (progress.kinds.*) — da contexto cuando está en Todos
         (kinds mezclados). item 3 (v0.4.2): con un kind concreto activo el
         selector YA lo dice, así que la etiqueta de kind por fila (debajo)
         se oculta para no repetirlo; solo en Todos se muestra -->
    <BkTabs class="shrink-0" v-model="kindFilter" :tabs="kindTabs" />

    <BkEmpty v-if="!filteredRecords.length" :message="t('progress.noRecords')" />
    <div v-else class="space-y-2" data-testid="pr-list">
      <div
        v-for="record in filteredRecords"
        :key="record.id"
        :data-testid="`pr-row-${record.id}`"
        class="flex items-center justify-between py-2 px-3 bg-stone rounded-sm"
      >
        <div class="flex items-center gap-2 min-w-0">
          <BkRune name="pr" :size="20" tone="ember" />
          <div class="min-w-0">
            <!-- item 3 (v0.4.2): solo en Todos, ver comentario del selector arriba -->
            <p v-if="kindFilter === 'all'" class="text-sm font-medium text-ink-muted">{{ t(`progress.kinds.${record.kind}`) }}</p>
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
  </div>
</template>

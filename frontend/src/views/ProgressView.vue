<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'

import type { DistributionItem, ExerciseOut, MuscleGroupOut, PersonalRecordOut, SeriesPoint } from '@/api/domain'
import { getDistribution, getRecords, getSeries, listExercises, listMuscleGroups } from '@/api/domain'
import BodySection from '@/components/progress/BodySection.vue'
import DistributionBars from '@/components/progress/DistributionBars.vue'
import ExercisePicker from '@/components/progress/ExercisePicker.vue'
import PrList from '@/components/progress/PrList.vue'
import type { MetricKey } from '@/components/progress/series'
import { seriesFor } from '@/components/progress/series'
import { useDisplayUnits } from '@/composables/useDisplayUnits'
import BkCard from '@/lib/BkCard.vue'
import BkChart from '@/lib/BkChart.vue'
import BkEmpty from '@/lib/BkEmpty.vue'
import BkTabs from '@/lib/BkTabs.vue'
import { useAthleteStore } from '@/stores/athlete'
import { toastApiError } from '@/utils/apiErrors'

const { t } = useI18n()
const athlete = useAthleteStore()

const tab = ref<'training' | 'records' | 'body'>('training')
const metric = ref<MetricKey>('top_weight')
const exerciseId = ref<number | null>(null)

const exercises = ref<ExerciseOut[]>([])
const muscleGroups = ref<MuscleGroupOut[]>([])
const distribution = ref<DistributionItem[]>([])
const records = ref<PersonalRecordOut[]>([])
const series = ref<SeriesPoint[]>([])

const units = useDisplayUnits()

// Récords (PrList) y Distribución (DistributionBars) tienen su propia pestaña
// (item 3b) — "Récords" reutiliza progress.records, ya es exactamente ese
// texto en los dos idiomas (antes era solo el título de la card)
const mainTabs = computed(() => [
  { value: 'training', label: t('progress.tabs.training') },
  { value: 'records', label: t('progress.records') },
  { value: 'body', label: t('progress.tabs.body') },
])

const metricTabs = computed(() => [
  { value: 'top_weight', label: t('progress.metric.weight') },
  { value: 'volume', label: t('progress.metric.volume') },
  { value: 'est_1rm', label: t('progress.metric.est1rm') },
])

const chartPoints = computed(() => seriesFor(series.value, metric.value, units.value))

async function loadCatalogAndDistribution() {
  try {
    const [exercisesList, groupsList, dist] = await Promise.all([
      listExercises({ userId: athlete.userId }),
      listMuscleGroups(athlete.userId),
      getDistribution(4, athlete.userId),
    ])
    exercises.value = exercisesList
    muscleGroups.value = groupsList
    distribution.value = dist
  } catch (error) {
    toastApiError(error)
  }
}

async function loadRecords() {
  try {
    records.value = await getRecords({ exercise_id: exerciseId.value ?? undefined, userId: athlete.userId })
  } catch (error) {
    toastApiError(error)
  }
}

async function loadSeries() {
  if (exerciseId.value === null) {
    series.value = []
    return
  }
  try {
    const result = await getSeries(exerciseId.value, athlete.userId)
    series.value = result.series
  } catch (error) {
    toastApiError(error)
  }
}

watch(
  () => athlete.userId,
  () => {
    loadCatalogAndDistribution()
    loadRecords()
    loadSeries()
  },
  { immediate: true },
)

watch(exerciseId, () => {
  loadRecords()
  loadSeries()
})
</script>

<template>
  <!-- h-full: <main> del shell ya acota la altura real (ver ShellView.vue) —
       sin ese tope, "ocupa el resto del viewport" no tiene contra qué medirse -->
  <div class="h-full flex flex-col gap-4 p-4">
    <h1 class="shrink-0 text-2xl font-bold text-ink">{{ $t('app.nav.progress') }}</h1>

    <BkTabs class="shrink-0" v-model="tab" :tabs="mainTabs" />

    <!-- Entrenos: la lista de ejercicios ocupa TODO el resto del alto (scroll
         interno); el chart + selector de métrica quedan anclados abajo, justo
         encima de la nav — nunca se meten debajo de ella (item 3c) -->
    <div v-if="tab === 'training'" class="flex-1 min-h-0 flex flex-col gap-4 bk-stagger">
      <div class="flex-1 min-h-0" :style="{ '--bk-stagger-i': 0 }">
        <ExercisePicker v-model="exerciseId" />
      </div>

      <div v-if="exerciseId !== null" class="shrink-0 space-y-3" :style="{ '--bk-stagger-i': 1 }">
        <BkTabs v-model="metric" :tabs="metricTabs" />
        <!-- :key="exerciseId" (item 2): remonta el chart al cambiar de
             ejercicio para repetir el barrido bk-reveal — el metric NO va en
             la key, así que cambiar peso/volumen/1RM solo actualiza :points
             sin remontar (progress.spec.ts:563 fija justo eso) -->
        <BkChart v-if="chartPoints.length" :key="exerciseId" :points="chartPoints" color="aurora" :suffix="` ${units}`" />
        <BkEmpty v-else :message="t('progress.noSeries')" />
      </div>
    </div>

    <!-- Récords: PrList + DistributionBars, movidos aquí desde Entrenos (item 3b) -->
    <div v-else-if="tab === 'records'" class="flex-1 min-h-0 overflow-y-auto space-y-6 bk-stagger">
      <div :style="{ '--bk-stagger-i': 0 }">
        <BkCard :title="t('progress.records')">
          <PrList :records="records" :exercises="exercises" />
        </BkCard>
      </div>
      <div :style="{ '--bk-stagger-i': 1 }">
        <BkCard :title="t('progress.distribution')">
          <DistributionBars :items="distribution" :groups="muscleGroups" />
        </BkCard>
      </div>
    </div>

    <!-- Cuerpo: un único bloque, bk-rise en vez de bk-stagger (no hay
         hermanos que escalonar) — mismo mecanismo de reproducción al
         cambiar de pestaña (item 7) -->
    <Transition v-else name="bk-rise" appear>
      <BodySection class="flex-1 min-h-0 overflow-y-auto" />
    </Transition>
  </div>
</template>

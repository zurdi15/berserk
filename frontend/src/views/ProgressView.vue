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
import BkCard from '@/lib/BkCard.vue'
import BkChart from '@/lib/BkChart.vue'
import BkEmpty from '@/lib/BkEmpty.vue'
import BkTabs from '@/lib/BkTabs.vue'
import { useAthleteStore } from '@/stores/athlete'
import { useAuthStore } from '@/stores/auth'
import { toastApiError } from '@/utils/apiErrors'

const { t } = useI18n()
const athlete = useAthleteStore()
const auth = useAuthStore()

const tab = ref<'training' | 'body'>('training')
const metric = ref<MetricKey>('top_weight')
const exerciseId = ref<number | null>(null)

const exercises = ref<ExerciseOut[]>([])
const muscleGroups = ref<MuscleGroupOut[]>([])
const distribution = ref<DistributionItem[]>([])
const records = ref<PersonalRecordOut[]>([])
const series = ref<SeriesPoint[]>([])

const units = computed(() => ((athlete.viewing?.units ?? auth.user?.units ?? 'kg') as 'kg' | 'lb'))

const mainTabs = computed(() => [
  { value: 'training', label: t('progress.tabs.training') },
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
  <div class="space-y-4 p-4">
    <h1 class="text-2xl font-bold text-ink">{{ $t('app.nav.progress') }}</h1>

    <BkTabs v-model="tab" :tabs="mainTabs" />

    <div v-if="tab === 'training'" class="space-y-6 bk-stagger">
      <div :style="{ '--bk-stagger-i': 0 }">
        <ExercisePicker v-model="exerciseId" />
      </div>

      <div v-if="exerciseId !== null" :style="{ '--bk-stagger-i': 1 }" class="space-y-3">
        <BkTabs v-model="metric" :tabs="metricTabs" />
        <BkChart v-if="chartPoints.length" :points="chartPoints" color="aurora" :suffix="` ${units}`" />
        <BkEmpty v-else :message="t('progress.noSeries')" />
      </div>

      <div :style="{ '--bk-stagger-i': 2 }">
        <BkCard :title="t('progress.records')">
          <PrList :records="records" :exercises="exercises" />
        </BkCard>
      </div>

      <div :style="{ '--bk-stagger-i': 3 }">
        <BkCard :title="t('progress.distribution')">
          <DistributionBars :items="distribution" :groups="muscleGroups" />
        </BkCard>
      </div>
    </div>

    <BodySection v-else />
  </div>
</template>

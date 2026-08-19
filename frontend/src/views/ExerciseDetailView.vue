<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute, useRouter } from 'vue-router'

import type {
  ExerciseOut,
  ExerciseSessionOut,
  MuscleGroupOut,
  PersonalRecordOut,
  SeriesPoint,
} from '@/api/domain'
import {
  getExerciseSessions,
  getRecords,
  getSeries,
  listExercises,
  listMuscleGroups,
} from '@/api/domain'
import RangeChips from '@/components/progress/RangeChips.vue'
import type { MetricKey, RangeKey } from '@/components/progress/series'
import {
  METRIC_LABEL_KEY,
  filterRange,
  metricOptionsFor,
  metricSuffix,
  seriesFor,
} from '@/components/progress/series'
import { exerciseName } from '@/components/routines/exerciseName'
import { formatHistorySetLines } from '@/components/workout/setHistoryFormat'
import { useDisplayUnits } from '@/composables/useDisplayUnits'
import BkChart from '@/lib/BkChart.vue'
import BkEmpty from '@/lib/BkEmpty.vue'
import BkMedia from '@/lib/BkMedia.vue'
import BkRune from '@/lib/BkRune.vue'
import BkTabs from '@/lib/BkTabs.vue'
import { groupRune, primaryMuscleGroup, primaryRune } from '@/lib/runeResolve'
import { useAthleteStore } from '@/stores/athlete'
import { toastApiError } from '@/utils/apiErrors'
import { formatDateShort } from '@/utils/dates'
import { formatWeight } from '@/utils/units'
import { SHARED_MEDIA_NAME } from '@/utils/viewTransition'

// v0.24.0 (zurdi: "vista detalle por ejercicio"): TODO lo del ejercicio en
// una página — foto grande (destino del morph de view transition), chips de
// grupo, récords, gráfica con métrica+rango y el historial completo de
// sesiones. Entradas: la fila de la biblioteca y el drawer de Entrenos.
const route = useRoute()
const router = useRouter()
const { t, locale } = useI18n()
const athlete = useAthleteStore()
const units = useDisplayUnits()

const exerciseId = computed(() => Number(route.params.exerciseId))

const exercise = ref<ExerciseOut | null>(null)
const muscleGroups = ref<MuscleGroupOut[]>([])
const series = ref<SeriesPoint[]>([])
const records = ref<PersonalRecordOut[]>([])
const sessions = ref<ExerciseSessionOut[]>([])
const ready = ref(false)

async function load() {
  try {
    const [exercisesList, groups, seriesResult, recordsResult, sessionsResult] = await Promise.all([
      listExercises({ userId: athlete.userId }),
      listMuscleGroups(athlete.userId),
      getSeries(exerciseId.value, athlete.userId),
      getRecords({ exercise_id: exerciseId.value, userId: athlete.userId }),
      getExerciseSessions(exerciseId.value, athlete.userId),
    ])
    exercise.value = exercisesList.find((e) => e.id === exerciseId.value) ?? null
    muscleGroups.value = groups
    series.value = seriesResult.series
    records.value = recordsResult
    sessions.value = sessionsResult
  } catch (error) {
    toastApiError(error)
  } finally {
    ready.value = true
  }
}

onMounted(load)
watch(exerciseId, load)

const title = computed(() => exerciseName(exercise.value ?? undefined, locale.value))
const rune = computed(() => primaryRune(exercise.value ?? undefined, muscleGroups.value))
const group = computed(() => primaryMuscleGroup(exercise.value ?? undefined, muscleGroups.value))

function groupLabel(g: MuscleGroupOut): string {
  return locale.value === 'en' ? g.name_en : g.name_es
}

// mismas reglas de métricas/sufijo/rango que el panel de Entrenos
const durationBased = computed(
  () => exercise.value?.measurement === 'cardio' || exercise.value?.measurement === 'timed',
)
const metricOptions = computed(() => metricOptionsFor(series.value, durationBased.value))
const metric = ref<MetricKey>('top_weight')
const metricTabs = computed(() =>
  metricOptions.value.map((m) => ({ value: m, label: t(`progress.metric.${METRIC_LABEL_KEY[m]}`) })),
)
watch(
  metricOptions,
  (options) => {
    if (!options.includes(metric.value)) metric.value = options[0]
  },
  { immediate: true },
)
const chartRange = ref<RangeKey>('all')
const chartPoints = computed(() =>
  filterRange(seriesFor(series.value, metric.value, units.value), chartRange.value),
)

// mismos chips de máximos que el drawer de Entrenos (v0.20.x)
const maxWeightRecord = computed(
  () =>
    records.value
      .filter((r) => r.kind === 'max_weight' && (r.load_mode ?? 'weight') === 'weight')
      .sort((a, b) => b.value - a.value)[0] ?? null,
)
const maxLevelRecord = computed(
  () =>
    records.value
      .filter((r) => r.kind === 'max_weight' && r.load_mode === 'level')
      .sort((a, b) => b.value - a.value)[0] ?? null,
)

function sessionLines(session: ExerciseSessionOut): string[] {
  return formatHistorySetLines(session.sets, exercise.value?.measurement ?? 'strength', units.value)
}

function goBack() {
  // mismo criterio que el pre-inicio (v0.21.4): state.back dice si hay una
  // ruta anterior DE LA APP; sin ella, a Progresión
  if (router.options.history.state.back) router.back()
  else router.push({ name: 'progress' })
}
</script>

<template>
  <div class="space-y-4 bk-stagger" data-testid="exercise-detail">
    <div class="flex items-center gap-2" :style="{ '--bk-stagger-i': 0 }">
      <button
        type="button"
        class="bk-press w-9 h-9 rounded-full border border-line flex items-center justify-center text-ink-muted hover:text-ink"
        :aria-label="t('common.back')"
        data-testid="exercise-detail-back"
        @click="goBack"
      >
        <span aria-hidden="true">‹</span>
      </button>
      <h2 class="bk-title flex-1 min-w-0 break-words">{{ title }}</h2>
    </div>

    <template v-if="ready && exercise">
      <!-- cabecera: la foto grande es el DESTINO del morph (view transition)
           desde el thumb de la lista; a su derecha los chips y récords -->
      <div class="bk-slab p-4 flex items-start gap-4" :style="{ '--bk-stagger-i': 1 }">
        <BkMedia
          :exercise="exercise"
          :rune="rune"
          size="tall"
          class="self-start"
          :style="{ viewTransitionName: SHARED_MEDIA_NAME }"
          data-testid="exercise-detail-media"
        />
        <div class="flex-1 min-w-0 space-y-2">
          <div class="flex items-center gap-1.5 flex-wrap">
            <span
              v-if="group"
              class="inline-flex items-center gap-1 rounded-full border border-line px-1.5 py-0.5 text-2xs text-ink-faint"
            >
              <BkRune v-if="groupRune(group)" :name="groupRune(group)!" :size="12" />
              <span>{{ groupLabel(group) }}</span>
            </span>
            <span
              v-if="exercise.measurement !== 'strength'"
              class="inline-flex items-center rounded-full border border-aurora/40 px-1.5 py-0.5 text-2xs text-aurora"
            >
              {{ t(`library.measurements.${exercise.measurement}`) }}
            </span>
          </div>
          <div v-if="maxWeightRecord || maxLevelRecord" class="flex flex-wrap gap-2">
            <span
              v-if="maxWeightRecord"
              class="inline-flex items-center gap-1.5 rounded-full border border-ember/50 text-ember px-2.5 py-1 text-xs bk-metric"
              data-testid="detail-max-weight"
            >{{ t('progress.maxWeightChip', { value: formatWeight(maxWeightRecord.value, units) }) }}</span>
            <span
              v-if="maxLevelRecord"
              class="inline-flex items-center gap-1.5 rounded-full border border-ember/50 text-ember px-2.5 py-1 text-xs bk-metric"
              data-testid="detail-max-level"
            >{{ t('progress.maxLevelChip', { n: maxLevelRecord.value }) }}</span>
          </div>
          <p class="text-sm text-ink-muted">
            {{ t('progress.detail.sessionCount', { n: sessions.length }, sessions.length) }}
          </p>
        </div>
      </div>

      <div v-if="series.length" class="bk-slab p-4 space-y-3" :style="{ '--bk-stagger-i': 2 }">
        <BkTabs v-model="metric" :tabs="metricTabs" />
        <RangeChips v-model="chartRange" />
        <BkChart
          v-if="chartPoints.length"
          :key="exerciseId"
          :points="chartPoints"
          color="aurora"
          :suffix="metricSuffix(metric, units)"
        />
        <BkEmpty v-else :message="t('progress.noSeries')" />
      </div>

      <!-- historial de sesiones: la más reciente primero, con TODAS sus
           series en el mismo formato multilínea del hint "última vez" -->
      <div class="space-y-2" :style="{ '--bk-stagger-i': 3 }">
        <h3 class="bk-eyebrow">{{ t('progress.detail.sessions') }}</h3>
        <BkEmpty v-if="!sessions.length" :message="t('progress.noSeries')" />
        <div
          v-for="session in sessions"
          :key="session.workout_id"
          class="bk-slab p-3"
          :data-testid="`detail-session-${session.workout_id}`"
        >
          <p class="text-xs text-ink-muted capitalize mb-1.5">
            {{ formatDateShort(session.date, locale) }}
          </p>
          <p v-for="line in sessionLines(session)" :key="line" class="bk-metric text-sm text-ink">
            {{ line }}
          </p>
        </div>
      </div>
    </template>

    <BkEmpty v-else-if="ready" :message="t('routines.privateExercise')" />
  </div>
</template>

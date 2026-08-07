<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'

import type { ExerciseOut, PersonalRecordOut, SeriesPoint, StatsOut } from '@/api/domain'
import { getRecords, getSeries, getStats, listExercises } from '@/api/domain'
import BodySection from '@/components/progress/BodySection.vue'
import ExercisePicker from '@/components/progress/ExercisePicker.vue'
import PrList from '@/components/progress/PrList.vue'
import type { MetricKey } from '@/components/progress/series'
import { seriesFor } from '@/components/progress/series'
import StatsGrid from '@/components/progress/StatsGrid.vue'
import { useDisplayUnits } from '@/composables/useDisplayUnits'
import { useTabHash } from '@/composables/useTabHash'
import BkCard from '@/lib/BkCard.vue'
import BkChart from '@/lib/BkChart.vue'
import BkEmpty from '@/lib/BkEmpty.vue'
import BkTabs from '@/lib/BkTabs.vue'
import { useAthleteStore } from '@/stores/athlete'
import { toastApiError } from '@/utils/apiErrors'

const { t } = useI18n()
const athlete = useAthleteStore()

type ProgressTab = 'training' | 'records' | 'stats' | 'body'
const PROGRESS_TABS: readonly ProgressTab[] = ['stats', 'body', 'training', 'records']

// item 8 (v0.3.0): orden totales → cuerpo → entreno → récords, con
// Totales como pestaña activa por defecto (antes era Entrenos)
// item 1 (v0.3.2): anclada al hash de la URL (ver useTabHash) — el selector
// de métrica (metric, debajo) es un toggle de DATO dentro de la pestaña
// Entrenos, no una sección propia, y queda fuera de esto a propósito
const tab = useTabHash<ProgressTab>('stats', () => PROGRESS_TABS)
const metric = ref<MetricKey>('top_weight')
const exerciseId = ref<number | null>(null)

const exercises = ref<ExerciseOut[]>([])
const records = ref<PersonalRecordOut[]>([])
const series = ref<SeriesPoint[]>([])
const stats = ref<StatsOut | null>(null)
// gatea el montaje de StatsGrid a datos ya resueltos (mismo patrón `ready` de
// TodayView, ver comentario allí): sin esto las cards entrarían primero con
// ceros y el roll de useAnimatedNumber se dispararía de 0 a 0, sin
// animación, y luego un segundo repintado saltaría al valor real de golpe
const statsReady = ref(false)

const units = useDisplayUnits()

// item 8 (v0.3.0): orden totales → cuerpo → entreno → récords (antes era
// entreno → récords → totales → cuerpo) — feedback de gimnasio real: lo
// primero que se quiere ver al abrir Progresión es el resumen, no la lista
// de ejercicios a filtrar
const mainTabs = computed(() => [
  { value: 'stats', label: t('progress.stats.title') },
  { value: 'body', label: t('progress.tabs.body') },
  { value: 'training', label: t('progress.tabs.training') },
  { value: 'records', label: t('progress.records') },
])

const metricTabs = computed(() => [
  { value: 'top_weight', label: t('progress.metric.weight') },
  { value: 'volume', label: t('progress.metric.volume') },
  { value: 'est_1rm', label: t('progress.metric.est1rm') },
])

const chartPoints = computed(() => seriesFor(series.value, metric.value, units.value))

// item 4 (v0.4.2): antes cargaba también grupos musculares + distribución
// para DistributionBars, que se mudó a Hoy (ver TodayView.vue) — aquí ya
// solo queda el catálogo de ejercicios que necesita PrList
async function loadCatalog() {
  try {
    exercises.value = await listExercises({ userId: athlete.userId })
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

async function loadStats() {
  try {
    stats.value = await getStats(athlete.userId)
  } catch (error) {
    toastApiError(error)
  } finally {
    // true también en error (mismo motivo que TodayView): no deja la pestaña
    // Estadísticas colgada esperando para siempre si el fetch falla
    statsReady.value = true
  }
}

watch(
  () => athlete.userId,
  () => {
    loadCatalog()
    loadRecords()
    loadSeries()
    loadStats()
  },
  { immediate: true },
)

watch(exerciseId, () => {
  loadRecords()
  loadSeries()
})
</script>

<template>
  <div class="h-full flex flex-col gap-4">
    <!-- h-full (SIN CAMBIOS de clase desde v0.4.0): <main> del shell ya acota la altura
         real con una caja de height FIJO — sin ese tope, "ocupa el resto del viewport" no
         tiene contra qué medirse.
         v0.4.1 (fix de scroll móvil, ver el comentario largo en ShellView.vue): esa caja
         fija de <main> pasó de h-full a h-[calc(100%-6rem)] — 100% MENOS la reserva del
         navbar móvil, que ahora vive en un spacer de flujo en vez de en padding. Esta raíz
         no necesita ningún cambio de CLASE: sigue siendo h-full de SU padre, que es
         justamente la caja que cambió — el 100% que hereda ahora YA EXCLUYE la reserva,
         así que el chart anclado abajo de Entrenos queda en la MISMA posición exacta que
         antes de v0.4.1 (verificado en Chromium real). Se probó primero cambiar esto a
         flex-1 min-h-0 (acompañando un wrapper min-h-full en vez de h-[calc(...)]) —
         DESCARTADO: min-height no da una referencia de altura DEFINIDA a un hijo con
         height:100%, y tampoco deja que flex-grow reparta espacio de forma fiable cuando
         el propio wrapper está en modo auto-size; en Chromium real, ExercisePicker perdía
         su scroll interno y arrastraba a <main> entero a desbordar miles de px.
         (comentario DENTRO de la raíz: como primer hijo del template crearía un
         fragmento de dos raíces y rompería el fall-through de atributos)
         Sin h1 de sección (item 3): Hoy nunca tuvo uno, mismo patrón aquí.
         Sin padding lateral propio (item 4): <main> del shell ya pone px-4,
         duplicarlo aquí desalineaba el gutter frente a Hoy. -->
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
             ejercicio para repetir el revelado progresivo de la serie — el
             metric NO va en la key, así que cambiar peso/volumen/1RM solo
             actualiza :points sin remontar (progress.spec.ts:563 fija justo eso) -->
        <BkChart v-if="chartPoints.length" :key="exerciseId" :points="chartPoints" color="aurora" :suffix="` ${units}`" />
        <BkEmpty v-else :message="t('progress.noSeries')" />
      </div>
    </div>

    <!-- Récords: solo PrList (item 4, v0.4.2 — antes también DistributionBars,
         ver comentario largo en TodayView.vue sobre por qué se mudó). Sin el
         split que anclaba Distribución abajo (shrink-0), el panel se
         simplifica a un único hijo que se lleva TODO el alto (flex-1 min-h-0,
         scroll interno vía PrList — ver PrList.vue, ya sin su tope max-h-72) -->
    <div v-else-if="tab === 'records'" class="flex-1 min-h-0 flex flex-col bk-stagger">
      <div class="flex-1 min-h-0" :style="{ '--bk-stagger-i': 0 }">
        <BkCard :title="t('progress.records')" class="h-full flex flex-col">
          <PrList :records="records" :exercises="exercises" />
        </BkCard>
      </div>
    </div>

    <!-- Estadísticas (round 8): totales de por vida, gateados a statsReady
         igual que TodayView — StatsGrid ya lleva su propio flex-1/min-h-0/
         overflow-y-auto en la raíz (mismo patrón que PrList), así que el
         wrapper del stagger solo necesita el hueco (flex-1 min-h-0) -->
    <div v-else-if="tab === 'stats'" class="flex-1 min-h-0 flex flex-col bk-stagger">
      <div class="flex-1 min-h-0 flex flex-col" :style="{ '--bk-stagger-i': 0 }">
        <StatsGrid v-if="statsReady" :stats="stats" />
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

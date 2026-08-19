<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'

import type { ExerciseOut, PersonalRecordOut, SeriesPoint, StatsOut } from '@/api/domain'
import { getRecords, getSeries, getStats, listExercises } from '@/api/domain'
import { exerciseName } from '@/components/routines/exerciseName'
import BodySection from '@/components/progress/BodySection.vue'
import ExercisePicker from '@/components/progress/ExercisePicker.vue'
import PrList from '@/components/progress/PrList.vue'
import type { MetricKey, RangeKey } from '@/components/progress/series'
import {
  METRIC_LABEL_KEY,
  filterRange,
  metricOptionsFor,
  metricSuffix,
  seriesFor,
} from '@/components/progress/series'
import RangeChips from '@/components/progress/RangeChips.vue'
import { formatWeight } from '@/utils/units'
import StatsGrid from '@/components/progress/StatsGrid.vue'
import { useDisplayUnits } from '@/composables/useDisplayUnits'
import { useTabHash } from '@/composables/useTabHash'
import { resetMainScroll } from '@/composables/useMainScroll'
import BkCard from '@/lib/BkCard.vue'
import BkChart from '@/lib/BkChart.vue'
import BkEmpty from '@/lib/BkEmpty.vue'
import BkSheet from '@/lib/BkSheet.vue'
import BkTabs from '@/lib/BkTabs.vue'
import { useAthleteStore } from '@/stores/athlete'
import { toastApiError } from '@/utils/apiErrors'
import { getViewCache, setViewCache } from '@/utils/viewCache'

const { t } = useI18n()
const athlete = useAthleteStore()
const router = useRouter()

type ProgressTab = 'training' | 'records' | 'stats' | 'body'
const PROGRESS_TABS: readonly ProgressTab[] = ['stats', 'body', 'training', 'records']

// item 8 (v0.3.0): orden totales → cuerpo → entreno → récords, con
// Totales como pestaña activa por defecto (antes era Entrenos)
// item 1 (v0.3.2): anclada al hash de la URL (ver useTabHash) — el selector
// de métrica (metric, debajo) es un toggle de DATO dentro de la pestaña
// Entrenos, no una sección propia, y queda fuera de esto a propósito
const tab = useTabHash<ProgressTab>('stats', () => PROGRESS_TABS)

// v0.5.0 (modelo de scroll único): cambiar de pestaña cambia el hash, no el
// path — el reset de ShellView no aplica y los paneles ya no remontan un
// scroller propio; sin esto el panel nuevo aparecería ya desplazado
watch(tab, () => {
  resetMainScroll()
})

const metric = ref<MetricKey>('top_weight')

// v0.8.2 (zurdi: "solo debería scrollear la lista"): la pestaña Entrenos se
// acota al hueco visible EXACTO — altura en px medida contra <main> en vez
// de un calc estático: un calc no puede conocer los banners condicionales
// (atleta/offline), el breakpoint del top bar ni el pb-24 del wrapper, y
// cualquier estimación en dvh deja o un mini-scroll o un hueco muerto (el
// bug exacto que motivó esto). Se mide al activar la pestaña y en resize;
// PB_RESERVE = los 6rem del pb-24 del wrapper del shell, que quedan FUERA
// del panel (si el panel llegara hasta el navbar, ese padding alargaría el
// scrollHeight de <main> y la página volvería a scrollear).
const trainingPanelEl = ref<HTMLElement | null>(null)
const trainingPanelHeight = ref<number | null>(null)
const PB_RESERVE = 96
function measureTrainingPanel() {
  const el = trainingPanelEl.value
  const main = document.querySelector('main')
  if (!el || !main) return
  const top = el.getBoundingClientRect().top - main.getBoundingClientRect().top + main.scrollTop
  trainingPanelHeight.value = Math.max(240, main.clientHeight - top - PB_RESERVE)
}
watch(tab, async (value) => {
  if (value !== 'training') return
  await nextTick()
  measureTrainingPanel()
}, { immediate: true })
onMounted(() => window.addEventListener('resize', measureTrainingPanel))
onUnmounted(() => window.removeEventListener('resize', measureTrainingPanel))
const exerciseId = ref<number | null>(null)

// v0.9.3 (zurdi: "sigue habiendo un scroll larguísimo bajo la gráfica —
// cámbialo a un drawer"): la gráfica vive en un BkSheet que se abre al
// elegir ejercicio — la vista queda SOLO con la lista (única superficie de
// scroll, panel acotado por medida) y la clase entera de problemas de
// alturas lista+chart desaparece. Cerrar el drawer deselecciona: la lista
// vuelve completa y los récords pierden el filtro.
const { locale } = useI18n()
const selectedExerciseName = computed(() => {
  const exercise = exercises.value.find((e) => e.id === exerciseId.value)
  return exercise ? exerciseName(exercise, locale.value) : ''
})

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

// v0.23.0 (zurdi: cardio por tiempos) + v0.24.0 (Distancia/Ritmo): el set de
// métricas válido lo deriva components/progress/series.ts::metricOptionsFor
// a partir del measurement y de los DATOS reales (Nivel solo si hay series
// de nivel; Distancia/Ritmo solo si hay distancias) — compartido con la
// vista detalle por ejercicio
const selectedIsDurationBased = computed(() => {
  const measurement = exercises.value.find((e) => e.id === exerciseId.value)?.measurement
  return measurement === 'cardio' || measurement === 'timed'
})

const metricOptions = computed(() => metricOptionsFor(series.value, selectedIsDurationBased.value))

const metricTabs = computed(() =>
  metricOptions.value.map((m) => ({ value: m, label: t(`progress.metric.${METRIC_LABEL_KEY[m]}`) })),
)

// la métrica seleccionada no puede quedarse colgada en una pestaña que ya no
// existe (cambio de ejercicio, datos sin nivel/distancia…)
watch(metricOptions, (options) => {
  if (!options.includes(metric.value)) metric.value = options[0]
})

// v0.20.x (zurdi: "el nivel/peso máximo en un chip, para no ir a Récords"):
// récords del ejercicio seleccionado — loadRecords ya trae los filtrados al
// abrir el drawer; el filtro extra es defensivo
const maxWeightRecord = computed(() => {
  if (exerciseId.value === null) return null
  return records.value
    .filter((r) => r.exercise_id === exerciseId.value && r.kind === 'max_weight' && (r.load_mode ?? 'weight') === 'weight')
    .sort((a, b) => b.value - a.value)[0] ?? null
})
const maxLevelRecord = computed(() => {
  if (exerciseId.value === null) return null
  return records.value
    .filter((r) => r.exercise_id === exerciseId.value && r.kind === 'max_weight' && r.load_mode === 'level')
    .sort((a, b) => b.value - a.value)[0] ?? null
})

const chartPoints = computed(() => seriesFor(series.value, metric.value, units.value))

// v0.24.0: rango temporal del chart (3M/6M/1A/Todo) — sticky entre
// ejercicios; el chart pinta solo los puntos dentro del rango
const chartRange = ref<RangeKey>('all')
const rangedPoints = computed(() => filterRange(chartPoints.value, chartRange.value))

// item 4 (v0.4.2): antes cargaba también grupos musculares + distribución
// para DistributionBars, que se mudó a Hoy (ver TodayView.vue) — aquí ya
// solo queda el catálogo de ejercicios que necesita PrList
// facelift v3: catálogo/récords/stats hidratan de viewCache y refrescan en
// fondo — volver a Progresión pinta al instante
function progressKey(part: string) {
  return `progress:${part}:${athlete.userId ?? 'me'}`
}

async function loadCatalog() {
  const cached = getViewCache<ExerciseOut[]>(progressKey('catalog'))
  if (cached) exercises.value = cached
  try {
    exercises.value = await listExercises({ userId: athlete.userId })
    setViewCache(progressKey('catalog'), exercises.value)
  } catch (error) {
    if (!cached) toastApiError(error)
  }
}

async function loadRecords() {
  // solo se cachea la lista SIN filtro (la vista de aterrizaje); las
  // filtradas por ejercicio son efímeras del drawer
  const cacheable = exerciseId.value === null
  const cached = cacheable ? getViewCache<PersonalRecordOut[]>(progressKey('records')) : undefined
  if (cached) records.value = cached
  try {
    records.value = await getRecords({ exercise_id: exerciseId.value ?? undefined, userId: athlete.userId })
    if (cacheable) setViewCache(progressKey('records'), records.value)
  } catch (error) {
    if (!cached) toastApiError(error)
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
    // ejercicios solo-nivel (máquinas): abrir el drawer en "Peso" enseñaría
    // el vacío teniendo datos — arranca en la métrica que sí los tiene
    const hasWeight = series.value.some((p) => p.top_weight > 0)
    const hasLevel = series.value.some((p) => (p.top_level ?? 0) > 0)
    if (!hasWeight && hasLevel && !selectedIsDurationBased.value) metric.value = 'top_level'
  } catch (error) {
    toastApiError(error)
  }
}

async function loadStats() {
  const cached = getViewCache<StatsOut>(progressKey('stats'))
  if (cached) {
    stats.value = cached
    statsReady.value = true
  }
  try {
    stats.value = await getStats(athlete.userId)
    if (stats.value) setViewCache(progressKey('stats'), stats.value)
  } catch (error) {
    if (!cached) toastApiError(error)
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
  <div class="space-y-4">
    <!-- v0.5.0 (modelo de scroll único, ver ShellView.vue): la raíz fluye
         contra <main>; toda la saga de alturas h-full/calc que vivía en este
         comentario (v0.4.0→v0.4.4) quedó obsoleta con ella. La tira de
         pestañas se pega arriba con sticky (bk-chrome-bg + -mt-4 pt-4 cubren la
         banda del pt-4 del wrapper del shell al pegarse, ver CalendarView).
         (comentario DENTRO de la raíz: como primer hijo del template crearía
         un fragmento de dos raíces y rompería el fall-through de atributos)
         Sin h1 de sección (item 3): Hoy nunca tuvo uno, mismo patrón aquí.
         Sin padding lateral propio (item 4): <main> del shell ya pone px-4,
         duplicarlo aquí desalineaba el gutter frente a Hoy. -->
    <div class="bk-sticky-chrome" data-testid="progress-tabs-sticky">
      <BkTabs v-model="tab" :tabs="mainTabs" />
    </div>

    <!-- Entrenos (v0.5.0): la lista del picker es una caja HOJA con su propia
         altura y scroll interno, y el chart la sigue.
         v0.8.2 (zurdi: "esa vista tiene un pequeño scroll que no debería —
         solo debería scrollear la lista, ocupe lo que ocupe, con o sin la
         gráfica"): el panel entero se ACOTA al hueco visible con una altura
         en px MEDIDA contra <main> (measureTrainingPanel — robusta ante
         banners condicionales, breakpoints y el pb-24 del wrapper, que un
         calc estático no puede conocer) — la página no scrollea nunca en
         esta pestaña; la lista toma el resto por flex (flex-1 min-h-0 en
         ExercisePicker) y el bloque del chart entra DESPLEGÁNDOSE
         (bk-unfold: max-height animada) para que la cesión de espacio de
         la lista sea gradual, no un salto de flex. -->
    <!-- overflow-hidden (v0.8.3, zurdi: "al salir la gráfica puedo seguir
         scrolleando hasta perder de vista todo"): backstop categórico — si
         el contenido del panel excede la altura medida (chart más alto de lo
         previsto, fuente grande, lo que sea), se RECORTA dentro del panel en
         vez de desbordar hacia <main> y devolverle el scroll a la página. -->
    <!-- v0.9.3 (zurdi): la pestaña es SOLO la lista (panel acotado por
         medida, overflow-hidden como backstop — nada puede devolverle el
         scroll a la página); la gráfica vive en el drawer de abajo -->
    <div
      v-if="tab === 'training'"
      ref="trainingPanelEl"
      class="flex flex-col bk-stagger overflow-hidden"
      :style="{ height: trainingPanelHeight !== null ? `${trainingPanelHeight}px` : undefined }"
      data-testid="training-panel"
    >
      <div class="flex-1 min-h-0 flex flex-col" :style="{ '--bk-stagger-i': 0 }">
        <!-- v0.24.1: los récords ya cargados visten cada fila con su máximo -->
        <ExercisePicker v-model="exerciseId" :records="records" />
      </div>
    </div>

    <!-- (el drawer de la gráfica vive al final del template para no romper
         la cadena v-if/v-else-if de los paneles) -->

    <!-- Récords: solo PrList (item 4, v0.4.2 — antes también DistributionBars,
         ver comentario largo en TodayView.vue sobre por qué se mudó).
         v0.5.0: la lista fluye entera contra <main> (PrList ya sin scroll
         propio), la card crece con su contenido -->
    <div v-else-if="tab === 'records'" class="bk-stagger">
      <div :style="{ '--bk-stagger-i': 0 }">
        <BkCard :title="t('progress.records')">
          <PrList :records="records" :exercises="exercises" />
        </BkCard>
      </div>
    </div>

    <!-- Estadísticas (round 8): totales de por vida, gateados a statsReady
         igual que TodayView — v0.5.0: el grid fluye, sin hueco que repartir -->
    <div v-else-if="tab === 'stats'" class="bk-stagger">
      <div :style="{ '--bk-stagger-i': 0 }">
        <StatsGrid v-if="statsReady" :stats="stats" />
      </div>
    </div>

    <!-- Cuerpo: un único bloque, bk-rise en vez de bk-stagger (no hay
         hermanos que escalonar) — mismo mecanismo de reproducción al
         cambiar de pestaña (item 7) -->
    <Transition v-else name="bk-rise" appear>
      <BodySection />
    </Transition>

    <!-- v0.9.3 (zurdi): drawer de la gráfica — se abre al elegir ejercicio,
         titulado con su nombre; cerrarlo deselecciona (la lista vuelve
         completa y los récords pierden el filtro) -->
    <BkSheet
      :open="tab === 'training' && exerciseId !== null"
      :title="selectedExerciseName"
      @close="exerciseId = null"
    >
      <div class="space-y-3 p-4" data-testid="chart-sheet-body">
        <BkTabs v-model="metric" :tabs="metricTabs" />
        <!-- v0.24.0: rango temporal — filtra los puntos, no remonta el chart -->
        <div class="flex items-center justify-between gap-2">
          <RangeChips v-model="chartRange" />
          <button
            v-if="exerciseId !== null"
            type="button"
            class="bk-press text-xs text-aurora shrink-0"
            data-testid="open-exercise-detail"
            @click="router.push({ name: 'exercise-detail', params: { exerciseId } })"
          >
            {{ t('progress.detail.open') }}
          </button>
        </div>
        <!-- v0.20.x: los máximos del ejercicio a la vista, sin ir a Récords -->
        <div v-if="maxWeightRecord || maxLevelRecord" class="flex flex-wrap gap-2">
          <span
            v-if="maxWeightRecord"
            class="inline-flex items-center gap-1.5 rounded-full border border-ember/50 text-ember px-2.5 py-1 text-xs bk-metric"
            data-testid="chart-max-weight"
          >{{ t('progress.maxWeightChip', { value: formatWeight(maxWeightRecord.value, units) }) }}</span>
          <span
            v-if="maxLevelRecord"
            class="inline-flex items-center gap-1.5 rounded-full border border-ember/50 text-ember px-2.5 py-1 text-xs bk-metric"
            data-testid="chart-max-level"
          >{{ t('progress.maxLevelChip', { n: maxLevelRecord.value }) }}</span>
        </div>
        <!-- :key="exerciseId" (item 2): remonta el chart al cambiar de
             ejercicio para repetir el revelado progresivo de la serie — el
             metric NO va en la key, así que cambiar peso/volumen/1RM solo
             actualiza :points sin remontar (el spec de metric-sin-remontar
             fija justo eso) -->
        <BkChart
          v-if="rangedPoints.length"
          :key="exerciseId ?? 0"
          :points="rangedPoints"
          color="aurora"
          :suffix="metricSuffix(metric, units)"
        />
        <BkEmpty v-else :message="t('progress.noSeries')" />
      </div>
    </BkSheet>
  </div>
</template>

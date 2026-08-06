<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { monthLabel } from '@/utils/dates'
import { getMonth, getHeatmap, listMuscleGroups } from '@/api/domain'
import { toastApiError } from '@/utils/apiErrors'
import BkHeatmap from '@/lib/BkHeatmap.vue'
import BkButton from '@/lib/BkButton.vue'
import BkRune from '@/lib/BkRune.vue'
import BkSheet from '@/lib/BkSheet.vue'
import MonthGrid from '@/components/calendar/MonthGrid.vue'
import ScheduleSheet from '@/components/calendar/ScheduleSheet.vue'
import { isValidRuneName } from '@/lib/runeResolve'
import type { RuneName } from '@/lib/runes'
import { useAthleteStore } from '@/stores/athlete'
import type { CalendarMonthOut, MuscleGroupOut } from '@/api/domain'

const athlete = useAthleteStore()
const { locale } = useI18n()

const today = new Date()
const year = ref(today.getFullYear())
const month = ref(today.getMonth() + 1)

// el idioma de la UI es el del VIEWER, no el del atleta que se está viendo
// (ver también MonthGrid.vue, mismo criterio para los headers de días)
const label = computed(() => monthLabel(year.value, month.value, locale.value))

const monthData = ref<CalendarMonthOut>({ scheduled: [], workouts: [] })
const heatmapData = ref<{ date: string; count: number }[]>([])
const muscleGroups = ref<MuscleGroupOut[]>([])
const loading = ref(false)

const selectedDate = ref<string | null>(null)
const groupMap = computed(() => {
  const map = new Map<number, string>()
  for (const group of muscleGroups.value) {
    map.set(group.id, group.slug)
  }
  return map
})

// leyenda de runas: mismo criterio de resolución que MonthGrid (isValidRuneName
// sobre el slug), pero listando el catálogo completo en vez de solo lo usado
const runeLegendOpen = ref(false)
const legendGroups = computed(() =>
  muscleGroups.value
    .filter((group) => isValidRuneName(group.slug))
    .map((group) => ({
      id: group.id,
      rune: group.slug as RuneName,
      name: locale.value === 'es' ? group.name_es : group.name_en,
    })),
)

async function loadMuscleGroups() {
  try {
    muscleGroups.value = await listMuscleGroups(athlete.userId)
  } catch (error) {
    toastApiError(error)
  }
}

async function loadMonth() {
  try {
    loading.value = true
    monthData.value = await getMonth(year.value, month.value, athlete.userId)
  } catch (error) {
    toastApiError(error)
  } finally {
    loading.value = false
  }
}

async function loadHeatmap() {
  try {
    heatmapData.value = await getHeatmap(year.value, athlete.userId)
  } catch (error) {
    toastApiError(error)
  }
}

function prevMonth() {
  if (month.value === 1) {
    year.value--
    month.value = 12
  } else {
    month.value--
  }
}

function nextMonth() {
  if (month.value === 12) {
    year.value++
    month.value = 1
  } else {
    month.value++
  }
}

function selectDay(date: string) {
  selectedDate.value = date
}

// v0.3.0 item 2 (bug): "Actividad del año no parece actualizarse con los
// entrenamientos añadidos o borrados" — el sheet emite "updated" tras
// CUALQUIER mutación que cambia workouts (borrar la tarjeta unificada,
// omitir/replanificar/crear una sesión), pero solo se recargaba el mes; el
// heatmap se quedaba con los datos con los que se montó la vista. Ambos
// fetches dependen de la misma mutación, así que ambos se recargan juntos.
function reloadCalendar() {
  loadMonth()
  loadHeatmap()
}

function closeScheduleSheet() {
  selectedDate.value = null
}

onMounted(() => {
  loadMuscleGroups()
})

watch([year, month], () => {
  loadMonth()
}, { immediate: true })

// heatmap solo se recarga si el año cambia
watch(year, () => {
  loadHeatmap()
}, { immediate: true })

// cambiar de atleta (empezar/dejar de ver a alguien) debe refrescar todo lo que
// depende de athlete.userId aunque year/month no cambien; si no, tras "dejar de
// ver" el mes y el heatmap seguían mostrando los datos del atleta anterior
watch(() => athlete.userId, () => {
  loadMuscleGroups()
  loadMonth()
  loadHeatmap()
})

// sin padding lateral propio en la raíz (item 4): <main> del shell ya pone
// px-4/py-4, tenerlo también aquí duplicaba el gutter frente a Hoy.
// (comentario aquí y no como primer hijo de <template>: un comentario ahí
// convierte la raíz en un fragmento de dos nodos y rompe wrapper.classes(), ver ShellView.vue)
</script>

<template>
  <div class="space-y-6">
    <!-- Month navigation: icon-only en móvil (el texto largo con flecha
         desbordaba y aplastaba el label en 390px), texto de vuelta desde sm.
         La leyenda de runas (item 3) vive aquí ahora: el h1 de sección que la
         acompañaba se quitó (Hoy nunca tuvo uno, es el patrón a seguir), así
         que el botón se reubica a la derecha, a la altura de los chevrons. -->
    <div class="flex items-center gap-2">
      <BkButton variant="ghost" size="sm" :aria-label="$t('calendar.prevMonth')" @click="prevMonth">
        <span aria-hidden="true">‹</span>
        <span class="hidden sm:inline">{{ $t('calendar.prevMonth') }}</span>
      </BkButton>
      <h2 class="flex-1 px-2 text-center text-lg font-semibold text-ink">{{ label }}</h2>
      <BkButton variant="ghost" size="sm" :aria-label="$t('calendar.nextMonth')" @click="nextMonth">
        <span aria-hidden="true">›</span>
        <span class="hidden sm:inline">{{ $t('calendar.nextMonth') }}</span>
      </BkButton>
      <!-- las runas de los squares no se autoexplican: leyenda a un toque -->
      <button
        type="button"
        class="bk-press flex items-center justify-center w-6 h-6 rounded-full border border-line-strong text-xs text-ink-muted hover:text-ink hover:border-aurora shrink-0"
        :aria-label="$t('calendar.runeLegend')"
        data-testid="rune-legend-btn"
        @click="runeLegendOpen = true"
      >
        i
      </button>
    </div>

    <!-- Month grid -->
    <MonthGrid
      :month="monthData"
      :year="year"
      :month-num="month"
      :group-map="groupMap"
      @select="selectDay"
    />

    <!-- Heatmap: siempre visible, incluso con datos vacíos (BkHeatmap ya
         tolera [] y dibuja la rejilla del año en blanco) -->
    <div class="mt-8">
      <h3 class="text-sm font-medium text-ink-muted mb-3 text-center">{{ $t('calendar.yearActivity') }}</h3>
      <BkHeatmap :data="heatmapData" :year="year" />
    </div>

    <!-- Schedule sheet modal: sin título genérico (amendment D, round 10) —
         el contenido mixto (tarjetas de entreno, sesiones planificadas,
         formulario) ya no encaja bajo un único "Sesiones Programadas";
         cada sección se etiqueta a su propia altura si hace falta -->
    <BkSheet :open="selectedDate !== null" @close="closeScheduleSheet">
      <ScheduleSheet
        v-if="selectedDate"
        :date="selectedDate"
        :scheduled="monthData.scheduled.filter(s => s.date === selectedDate)"
        @updated="reloadCalendar"
      />
    </BkSheet>

    <!-- Rune legend sheet -->
    <BkSheet :open="runeLegendOpen" :title="$t('calendar.runeLegend')" @close="runeLegendOpen = false">
      <div class="space-y-3 p-4">
        <p class="text-sm text-ink-muted">{{ $t('calendar.runeLegendHint') }}</p>
        <ul class="space-y-2">
          <li v-for="group in legendGroups" :key="group.id" class="flex items-center gap-3">
            <BkRune :name="group.rune" :size="20" />
            <span class="text-sm text-ink">{{ group.name }}</span>
          </li>
        </ul>
      </div>
    </BkSheet>
  </div>
</template>

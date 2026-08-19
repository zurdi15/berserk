<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute, useRouter } from 'vue-router'
import { monthLabel } from '@/utils/dates'
import { getMonth, getHeatmap, listMuscleGroups } from '@/api/domain'
import { toastApiError } from '@/utils/apiErrors'
import { getViewCache, setViewCache } from '@/utils/viewCache'
import BkHeatmap from '@/lib/BkHeatmap.vue'
import BkRune from '@/lib/BkRune.vue'
import BkSheet from '@/lib/BkSheet.vue'
import BkUser from '@/lib/BkUser.vue'
import MonthGrid from '@/components/calendar/MonthGrid.vue'
import ScheduleSheet from '@/components/calendar/ScheduleSheet.vue'
import { isValidRuneName } from '@/lib/runeResolve'
import type { RuneName } from '@/lib/runes'
import { useAthleteStore } from '@/stores/athlete'
import { useAuthStore } from '@/stores/auth'
import type { CalendarMonthOut, MuscleGroupOut } from '@/api/domain'

const athlete = useAthleteStore()
const auth = useAuthStore()
const { locale } = useI18n()
const route = useRoute()
const router = useRouter()

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

// facelift v3 (zurdi: cargas instantáneas): cada fetch hidrata primero de
// viewCache (última visita) y refresca en fondo — el mes/heatmap aparecen
// al momento al volver a la vista y se actualizan reactivamente
function monthKey() {
  return `cal:${athlete.userId ?? 'me'}:${year.value}-${month.value}`
}
function heatmapKey() {
  return `heatmap:${athlete.userId ?? 'me'}:${year.value}`
}
function groupsKey() {
  return `mgroups:${athlete.userId ?? 'me'}`
}

async function loadMuscleGroups() {
  const cached = getViewCache<MuscleGroupOut[]>(groupsKey())
  if (cached) muscleGroups.value = cached
  try {
    muscleGroups.value = await listMuscleGroups(athlete.userId)
    setViewCache(groupsKey(), muscleGroups.value)
  } catch (error) {
    if (!cached) toastApiError(error)
  }
}

async function loadMonth() {
  const cached = getViewCache<CalendarMonthOut>(monthKey())
  if (cached) monthData.value = cached
  else monthData.value = { scheduled: [], workouts: [] }
  try {
    loading.value = true
    monthData.value = await getMonth(year.value, month.value, athlete.userId)
    setViewCache(monthKey(), monthData.value)
  } catch (error) {
    if (!cached) toastApiError(error)
  } finally {
    loading.value = false
  }
}

async function loadHeatmap() {
  const cached = getViewCache<{ date: string; count: number }[]>(heatmapKey())
  if (cached) heatmapData.value = cached
  try {
    heatmapData.value = await getHeatmap(year.value, athlete.userId)
    setViewCache(heatmapKey(), heatmapData.value)
  } catch (error) {
    if (!cached) toastApiError(error)
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

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/

// polish wave item 8: "programar sesión" en Hoy navega aquí con ?day=<iso>
// para abrir directamente el sheet del día de hoy. watch con immediate
// (no solo onMounted) porque también cubre volver a esta misma vista con
// una query nueva sin remontar el componente (rutas hijas del mismo shell).
// La query se limpia con router.replace tras abrir: si no, un back/refresh
// reabriría el sheet en bucle.
watch(
  () => route.query.day,
  (day) => {
    if (typeof day !== 'string' || !ISO_DATE_RE.test(day)) return
    selectedDate.value = day
    const query = { ...route.query }
    delete query.day
    router.replace({ query })
  },
  { immediate: true },
)

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
// v0.5.0 (modelo de scroll único, ver ShellView.vue): la raíz FLUYE contra
// <main> y la fila de navegación de mes pasa de shrink-0-en-columna-acotada
// a sticky top-0 — mismo resultado (el selector de mes nunca se va de la
// vista aunque el heatmap del año empuje mucho scroll), sin cadena de
// alturas. El bloque sticky lleva -mt-4 pt-4 para cubrir también la banda
// del pt-4 del wrapper del shell cuando está pegado (si no, el contenido
// scrolleado asomaría por esos 16px por encima de la fila), y bk-chrome-bg (fondo void + réplica del grano de niebla, ver base.css) para
// que el grid pase por debajo sin transparentarse.
// (comentario aquí y no como primer hijo de <template>: un comentario ahí
// convierte la raíz en un fragmento de dos nodos y rompe wrapper.classes(), ver ShellView.vue)
</script>

<template>
  <div class="space-y-6">
    <!-- Month navigation: icon-only en móvil (el texto largo con flecha
         desbordaba y aplastaba el label en 390px), texto de vuelta desde sm.
         La leyenda de runas ya no vive aquí (item 13): se baja entre la
         rejilla y la actividad del año, como un enlace suelto en vez de un
         icono en esta fila. sticky (v0.5.0): chrome pegado arriba del
         scrollport de <main>, ver comentario del script. -->
    <!-- v0.8.3 (zurdi): la fila de mes vuelve a FLUJO normal — "no todas las
         secciones tienen que tener un header fijo"; el sticky de la v0.5.0
         se retira de aquí (queda en las tiras de tabs de Perfil/Progresión
         y el crono del entreno) -->
    <!-- facelift: mes grande a la izquierda (primer h1 de la vista) y
         chevrons circulares a la derecha — el patrón de la referencia -->
    <div class="flex items-center gap-2" data-testid="month-nav">
      <h1 class="flex-1 bk-title text-ink capitalize">{{ label }}</h1>
      <button
        type="button"
        class="bk-press w-10 h-10 rounded-full border border-line-strong text-ink flex items-center justify-center hover:border-aurora hover:text-aurora"
        :aria-label="$t('calendar.prevMonth')"
        @click="prevMonth"
      >
        <span aria-hidden="true">‹</span>
      </button>
      <button
        type="button"
        class="bk-press w-10 h-10 rounded-full border border-line-strong text-ink flex items-center justify-center hover:border-aurora hover:text-aurora"
        :aria-label="$t('calendar.nextMonth')"
        @click="nextMonth"
      >
        <span aria-hidden="true">›</span>
      </button>
    </div>

    <!-- v0.5.0: sin región de scroll propia — grid, leyenda de compartidos,
         enlace de runas y heatmap fluyen contra <main>; el div solo agrupa
         el espaciado -->
    <div class="space-y-6">
      <!-- Month grid. dot-color (v0.5.1, bug real de zurdi): "el dot propio
           lo veo siempre aurora, pero debería ser del color de usuario
           independientemente de quién esté logeado" — en modo atleta manda
           el color del observado (como siempre), y en el calendario PROPIO
           cae al color del usuario logeado en vez de directamente al aurora;
           el aurora queda como último fallback (usuario sin color) dentro de
           MonthGrid. -->
      <MonthGrid
        :month="monthData"
        :year="year"
        :month-num="month"
        :group-map="groupMap"
        :dot-color="athlete.viewing?.color ?? auth.user?.color"
        @select="selectDay"
      />

      <!-- SHARED-DOTS OVERLAY legend (v0.4.1): solo cuando el propio calendario
           trae usuarios compartidos (nunca en modo atleta, ahí monthData.shared
           llega undefined — ver api/domain.ts) — reutiliza BkUser tal cual
           (punto de color + username), mismo idiom que el resto de listados de
           usuario de la app. item 1a (v0.4.2): la etiqueta "Compartido
           contigo:" se quita — los dots ya llevan color+nombre vía BkUser, la
           fila de puntos habla por sí sola sin la muletilla de texto delante. -->
      <div
        v-if="monthData.shared && monthData.shared.length > 0"
        class="flex flex-wrap items-center justify-center gap-x-4 gap-y-1"
        data-testid="shared-legend"
      >
        <BkUser
          v-for="sharedUser in monthData.shared"
          :key="sharedUser.user_id"
          :user="{ username: sharedUser.username, color: sharedUser.color }"
          size="sm"
        />
      </div>

      <!-- Rune legend trigger (item 13): las runas de los squares no se
           autoexplican, pero ya no es un botón-icono junto a los chevrons —
           un texto pequeño y subtle, mismo idiom que otros enlaces menores de
           la app (ver el toggle de descanso en WorkoutExerciseCard.vue).
           item 7 (v0.4.2): recupera el idiom de circulito-i bordeado que tenía
           el botón ANTES de la item 13 (ver git show 60bd285), pero ahora como
           span decorativo DENTRO del texto en vez de ser el botón entero — el
           texto sigue siendo lo clicable y lo accesible, el icono es puro
           refuerzo visual (aria-hidden). -->
      <div class="flex justify-center">
        <button
          type="button"
          class="bk-press inline-flex items-center gap-1.5 text-xs text-ink-faint underline decoration-dotted"
          data-testid="rune-legend-btn"
          @click="runeLegendOpen = true"
        >
          <span
            class="flex items-center justify-center w-3.5 h-3.5 rounded-full border border-line-strong text-2xs leading-none not-italic no-underline"
            aria-hidden="true"
            data-testid="rune-legend-info-icon"
          >i</span>
          {{ $t('calendar.runeLegend') }}
        </button>
      </div>

      <!-- Heatmap: siempre visible, incluso con datos vacíos (BkHeatmap ya
           tolera [] y dibuja la rejilla del año en blanco). facelift: en su
           propia card con título a la izquierda -->
      <section class="bk-slab p-5 mt-4">
        <h3 class="bk-title text-ink mb-4">{{ $t('calendar.yearActivity') }}</h3>
        <BkHeatmap :data="heatmapData" :year="year" />
      </section>
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
        :shared="monthData.shared"
        @updated="reloadCalendar"
      />
    </BkSheet>

    <!-- Rune legend sheet: solo la lista runa+nombre (item 13, se quita el
         párrafo explicativo) -->
    <BkSheet :open="runeLegendOpen" :title="$t('calendar.runeLegend')" @close="runeLegendOpen = false">
      <div class="space-y-3 p-4">
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

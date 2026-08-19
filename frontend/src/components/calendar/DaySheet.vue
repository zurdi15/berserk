<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'

import BkButton from '@/lib/BkButton.vue'
import BkTimeField from '@/lib/BkTimeField.vue'
import BkSheet from '@/lib/BkSheet.vue'
import BkRune from '@/lib/BkRune.vue'
import BkUser from '@/lib/BkUser.vue'
import WorkoutDayInfo from './WorkoutDayInfo.vue'
import { isValidRuneName } from '@/lib/runeResolve'
import type { RuneName } from '@/lib/runes'
import { useAuthStore } from '@/stores/auth'
import type { ExerciseOut, PersonalRecordOut, RoutineOut, SharedUserOut, WorkoutOut } from '@/api/domain'
import {
  deleteWorkout,
  getRecords,
  listExercises,
  listRoutines,
  listWorkouts,
  startWorkout,
} from '@/api/domain'
import { toastApiError } from '@/utils/apiErrors'
import { formatDayLabel, isoDate, todayIso } from '@/utils/dates'
import { parseUtc } from '@/utils/datetime'
import { formatWeight, formatWeightInt } from '@/utils/units'
import { useDisplayUnits } from '@/composables/useDisplayUnits'
import { exerciseName } from '@/components/routines/exerciseName'
import { useAthleteStore } from '@/stores/athlete'

// v0.25.0: la PLANIFICACIÓN murió (zurdi: "teniendo rutinas y plan
// rotatorio no aporta nada") — este sheet (antes ScheduleSheet) queda como
// el sheet del DÍA: entrenos, PRs, retro-registro y pestañas de compartidos
const props = defineProps<{
  date: string
  // item 1b (v0.4.2): el payload `shared` del mes (CalendarMonthOut.shared),
  // reenviado tal cual desde CalendarView — undefined en modo atleta (el
  // backend omite la clave, ver api/domain.ts), igual que en MonthGrid
  shared?: SharedUserOut[]
}>()

const emit = defineEmits<{
  updated: []
}>()

const router = useRouter()
const athlete = useAthleteStore()
const auth = useAuthStore()
const { locale } = useI18n()
const units = useDisplayUnits()

const isViewingSelf = computed(() => !athlete.isViewing)
// registrar un entreno retroactivo solo tiene sentido hasta hoy — un día
// futuro no tiene nada que "registrar" todavía (el backend además 422 sin
// date, pero para un futuro sí hay date: se oculta en el cliente para no
// ofrecer una acción que no encaja conceptualmente)
const isPastOrToday = computed(() => props.date <= todayIso())
const loggingPastWorkout = ref(false)
// item 3 (v0.4.0): "Registrar entreno" ya no crea directamente un entreno
// libre — abre este picker primero (Entreno libre + rutinas propias)
const pastWorkoutPickerOpen = ref(false)

const routines = ref<RoutineOut[]>([])
const loading = ref(false)

// item 2 (round 10): info completa del/de los entreno(s) del día + catálogo
// de ejercicios (para resolver nombres) + récords logrados ese día. El
// payload del mes (monthData.workouts) es solo un resumen (WorkoutSummaryOut,
// sin ejercicios/hora/duración/nota) — hace falta este fetch propio al abrir
// el día. Gateado con infoReady (mismo patrón que RoutineList/TodayView):
// aparece completo de una vez, no en oleadas según qué promesa resuelva antes.
const infoReady = ref(false)
const workoutsDetail = ref<WorkoutOut[]>([])
const exerciseCatalog = ref<ExerciseOut[]>([])
const dayRecords = ref<PersonalRecordOut[]>([])

// item 1b (v0.4.2): "cuando abro un día, aparte de ver mi entrenamiento
// molaría que hubiese una pestaña en ese drawer POR USUARIO para poder ver
// sus entrenamientos también" (zurdi). 'self' es la pestaña por defecto (todo
// tal cual hoy: programar/retro-log/editar); un número es el user_id de un
// usuario compartido con entreno ESE día.
type SharedTab = number
const activeTab = ref<'self' | SharedTab>('self')

interface SharedDayData {
  ready: boolean
  workouts: WorkoutOut[]
  exercises: ExerciseOut[]
  records: PersonalRecordOut[]
}

// cache por usuario, vive mientras el sheet sigue abierto en ESTE día — se
// vacía en el watch de props.date de más abajo (día distinto = cache stale)
const sharedDayCache = ref<Record<SharedTab, SharedDayData>>({})

// solo en MI PROPIO calendario (isViewingSelf) y solo usuarios con un
// entreno ESE día — `dates` ya llega acotado al mes consultado (ver
// SharedUserOut/getMonth), así que basta con comprobar que el día está en
// la lista, sin filtrar por mes aquí
const sharedUsersToday = computed(() =>
  isViewingSelf.value ? (props.shared ?? []).filter((sharedUser) => sharedUser.dates.includes(props.date)) : [],
)

const activeSharedData = computed(() =>
  typeof activeTab.value === 'number' ? (sharedDayCache.value[activeTab.value] ?? null) : null,
)

function sharedExerciseNameFor(exerciseId: number): string {
  const catalog = activeSharedData.value?.exercises ?? []
  return exerciseName(catalog.find((exercise) => exercise.id === exerciseId), locale.value)
}

async function selectTab(tab: 'self' | SharedTab) {
  activeTab.value = tab
  if (tab === 'self') return
  // cache per usuario per apertura: un segundo flip a una pestaña ya
  // resuelta NO repite el fetch. El guard va ANTES del await (no solo tras
  // `ready`) para no disparar dos fetches si se clica dos veces seguidas la
  // misma pestaña todavía en vuelo. El placeholder ocupa el hueco YA (antes
  // del await) para que ese guard funcione en el segundo clic.
  if (sharedDayCache.value[tab]) return
  sharedDayCache.value[tab] = { ready: false, workouts: [], exercises: [], records: [] }
  try {
    // TargetUser-threaded (ya autorizado vía grant, ver permissions.py): el
    // mismo trío que loadDayInfo usa para mí, pero con userId del compartido.
    // Deliberadamente NO se pide listRoutines(userId) — fuera del set de
    // endpoints con los que el sheet ya sabe hablar de otro usuario, así que
    // sus tarjetas siempre caen al fallback "Entreno libre" (ver
    // WorkoutDayInfo routineName).
    const [workoutsResult, recordsResult, exercisesResult] = await Promise.all([
      listWorkouts({ from_date: props.date, to_date: props.date, userId: tab }),
      getRecords({ userId: tab }),
      listExercises({ userId: tab }),
    ])
    // reasigna el objeto ENTERO (no muta el placeholder en sitio): una
    // mutación in-place del objeto crudo saltaría el trap `set` del proxy
    // reactivo y no dispararía el rerender (gotcha clásico de Vue 3 con
    // objetos anidados dentro de un ref) — reasignar sobre
    // sharedDayCache.value[tab] sí pasa por el proxy siempre
    sharedDayCache.value[tab] = {
      ready: true,
      workouts: workoutsResult,
      records: recordsResult.filter((record) => isoDate(parseUtc(record.achieved_at)) === props.date),
      exercises: exercisesResult,
    }
  } catch (error) {
    toastApiError(error)
    sharedDayCache.value[tab] = { ready: true, workouts: [], exercises: [], records: [] }
  }
}

// confirmación de borrado de un entreno del día
const confirmAction = ref<{ id: number } | null>(null)

async function loadRoutines() {
  try {
    routines.value = await listRoutines(athlete.userId)
  } catch (error) {
    toastApiError(error)
  }
}

async function loadDayInfo() {
  infoReady.value = false
  try {
    const [workoutsResult, recordsResult, exercisesResult] = await Promise.all([
      listWorkouts({ from_date: props.date, to_date: props.date, userId: athlete.userId }),
      getRecords({ userId: athlete.userId }),
      listExercises({ userId: athlete.userId }),
    ])
    workoutsDetail.value = workoutsResult
    // récords "del día": achieved_at es un datetime UTC-naive (igual que
    // started_at/ended_at) — parseUtc + isoDate en vez de un slice del
    // string, o el día mostrado se desplazaría cerca de medianoche según el
    // offset del viewer (misma trampa que en RecentPrs/PrList)
    dayRecords.value = recordsResult.filter((record) => isoDate(parseUtc(record.achieved_at)) === props.date)
    exerciseCatalog.value = exercisesResult
  } catch (error) {
    toastApiError(error)
  } finally {
    infoReady.value = true
  }
}

function routineNameFor(workout: WorkoutOut): string | null {
  if (workout.routine_id == null) return null
  return routines.value.find((r) => r.id === workout.routine_id)?.name ?? null
}

function exerciseNameFor(exerciseId: number): string {
  return exerciseName(exerciseCatalog.value.find((e) => e.id === exerciseId), locale.value)
}

// los 3 kinds de PR son magnitudes en kg (ver FinishSummary/RecentPrs):
// max_weight es un peso REAL registrado (conserva precisión), est_1rm/
// max_volume son derivados (sin decimales)
function formatRecordValue(record: PersonalRecordOut): string {
  return record.kind === 'max_weight'
    ? formatWeight(record.value, units.value)
    : formatWeightInt(record.value, units.value)
}

function deleteWorkoutEntry(id: number) {
  confirmAction.value = { id }
}

async function confirmDelete() {
  if (!confirmAction.value) return
  const { id } = confirmAction.value
  confirmAction.value = null
  try {
    loading.value = true
    await deleteWorkout(id)
    await loadDayInfo()
    emit('updated')
  } catch (error) {
    toastApiError(error)
  } finally {
    loading.value = false
  }
}

function editWorkout(id: number) {
  router.push({ name: 'workout-edit', params: { id } })
}

// item 3 (v0.4.0): routineId ausente = "Entreno libre" (sin rutina, como
// antes); con routineId, start_workout ya compone la rutina (exercises
// precargados + rest_seconds + grupos derivados) para el camino finished
// exactamente igual que para el en vivo — no está condicionado a `finished`
// en el backend (ver routers/workouts.py::start_workout)
// v0.11.0 (zurdi: "al añadir un entrenamiento desde el calendario no se
// puede editar la hora de inicio"): hora opcional en el propio picker retro —
// local HH:MM del día elegido → UTC ISO (el backend la honra como started_at
// real, con duración 0 editable después). Sin hora: placeholder de mediodía.
const pastWorkoutTime = ref<string | null>(null)

function retroStartedAtUtc(): string | undefined {
  if (!pastWorkoutTime.value) return undefined
  const local = new Date(`${props.date}T${pastWorkoutTime.value}:00`)
  return local.toISOString().slice(0, 19)
}

async function logPastWorkout(routineId?: number) {
  pastWorkoutPickerOpen.value = false
  try {
    loggingPastWorkout.value = true
    const workout = await startWorkout({
      date: props.date,
      finished: true,
      routine_id: routineId,
      started_at: retroStartedAtUtc(),
    })
    pastWorkoutTime.value = null
    router.push({ name: 'workout-edit', params: { id: workout.id } })
  } catch (error) {
    toastApiError(error)
  } finally {
    loggingPastWorkout.value = false
  }
}

// mismo helper que WorkoutView.vue: la runa de la rutina, si es una runa
// futhark válida (columna dedicada, con fallback a slug — ver runeResolve)
function routineRune(routine: RoutineOut): RuneName | null {
  return routine.rune && isValidRuneName(routine.rune) ? (routine.rune as RuneName) : null
}

// el sheet no se remonta al cambiar de día con el sheet ya abierto (el
// v-if="selectedDate" del padre sigue siendo truthy para cualquier fecha):
// sin este watch, cambiar de día sin cerrar antes dejaría la info del día
// anterior en pantalla. item 1b: un día nuevo también resetea la pestaña a
// 'self' y vacía la cache de compartidos — la de un día ya no vale para otro.
watch(() => props.date, () => {
  activeTab.value = 'self'
  sharedDayCache.value = {}
  loadDayInfo()
})

loadRoutines()
loadDayInfo()
</script>

<template>
  <div class="space-y-4">
    <!-- Date header -->
    <div class="mb-4">
      <h3 class="font-semibold text-ink">{{ formatDayLabel(date, $i18n.locale) }}</h3>
    </div>

    <!-- item 1b (v0.4.2): tira de pestañas por usuario — "Tú" + uno por
         usuario compartido CON entreno ese día. zurdi: "cuando abro un día,
         aparte de ver mi entrenamiento molaría que hubiese una pestaña en
         ese drawer POR USUARIO para poder ver sus entrenamientos también".
         Segmentado compacto (idiom del chip is_public de RoutineList), no
         BkTabs completo — BkTabs es para navegación de nivel de vista
         (tablist con scroll/teclado), esto es un toggle de vista DENTRO de
         un sheet ya angosto. Solo aparece si hay algo que mostrar (alone =
         exactamente la UI de siempre, sin tira). -->
    <div
      v-if="sharedUsersToday.length > 0"
      data-testid="day-tabs"
      class="flex flex-wrap items-center gap-1.5 mb-4"
    >
      <!-- item 9 (v0.4.3): misma forma que las pestañas de compartidos de
           abajo (mismo padding/tamaño/BkUser) — antes "Tú" era texto suelto
           en una chip más ancha (px-3, text-xs propio), visualmente
           distinta a las de los demás usuarios. aria-label propio (en vez
           de dejar que el nombre de BkUser sea el nombre accesible por
           defecto): distingue "esta es TU pestaña" para lectores de
           pantalla, donde el color+nombre por sí solos no lo dejan claro
           (a diferencia de lo visual, donde el usuario ya sabe cuál es el suyo) -->
      <button
        v-if="auth.user"
        type="button"
        data-testid="day-tab-self"
        class="bk-press rounded-full border px-2.5 py-1 transition-colors"
        :class="activeTab === 'self'
          ? 'border-aurora bg-aurora/10'
          : 'border-line hover:border-line-strong'"
        :aria-pressed="activeTab === 'self' ? 'true' : 'false'"
        :aria-label="$t('calendar.dayTabs.selfAria', { name: auth.user.username })"
        @click="selectTab('self')"
      >
        <BkUser :user="{ username: auth.user.username, color: auth.user.color }" size="sm" />
      </button>
      <button
        v-for="sharedUser in sharedUsersToday"
        :key="sharedUser.user_id"
        type="button"
        :data-testid="`day-tab-${sharedUser.user_id}`"
        class="bk-press rounded-full border px-2.5 py-1 transition-colors"
        :class="activeTab === sharedUser.user_id
          ? 'border-aurora bg-aurora/10'
          : 'border-line hover:border-line-strong'"
        :aria-pressed="activeTab === sharedUser.user_id ? 'true' : 'false'"
        @click="selectTab(sharedUser.user_id)"
      >
        <BkUser :user="{ username: sharedUser.username, color: sharedUser.color }" size="sm" />
      </button>
    </div>

    <template v-if="activeTab === 'self'">
      <!-- Tarjetas unificadas de entreno (item 2 + amendment A): un entreno es
           un entreno, con o sin sesión programada detrás. Gateadas en
           infoReady para no aparecer campo a campo. -->
      <div v-if="infoReady && workoutsDetail.length" class="space-y-3 bk-stagger">
        <div v-for="(workout, i) in workoutsDetail" :key="workout.id" :style="{ '--bk-stagger-i': i }">
          <WorkoutDayInfo
            :workout="workout"
            :routine-name="routineNameFor(workout)"
            :exercise-catalog="exerciseCatalog"
            :can-edit="isViewingSelf"
            @edit="editWorkout(workout.id)"
            @delete="deleteWorkoutEntry(workout.id)"
          />
        </div>
      </div>

      <!-- PRs del día (nivel día, no por entreno) -->
      <div v-if="infoReady && dayRecords.length" class="space-y-2 border border-line rounded-sm p-3">
        <h4 class="bk-eyebrow">{{ $t('calendar.prsOfDay') }}</h4>
        <div v-for="record in dayRecords" :key="record.id" :data-testid="`pr-of-day-${record.id}`" class="flex items-center gap-2 text-ember text-sm">
          <BkRune name="pr" :size="18" tone="ember" />
          <span class="font-medium">
            {{ $t(`progress.kinds.${record.kind}`) }} — {{ exerciseNameFor(record.exercise_id) }} — {{ formatRecordValue(record) }}
          </span>
        </div>
      </div>

      <!-- Registrar un entreno pasado: solo hoy/pasado (ver isPastOrToday).
           amendment B: variant primary, como toda acción de "añadir algo".
           item 3 (v0.4.0): ya no registra directo — abre el picker de abajo -->
      <div v-if="isViewingSelf && isPastOrToday" class="border border-line rounded-sm p-3">
        <BkButton
          variant="primary"
          block
          data-testid="log-past-workout"
          :disabled="loggingPastWorkout"
          @click="pastWorkoutPickerOpen = true"
        >
          {{ $t('calendar.logPastWorkout') }}
        </BkButton>
      </div>

      <!-- item 3 (v0.4.0): picker de "Registrar entreno" — Entreno libre +
           rutinas propias (rune + nombre), mismo idiom que el idle de
           WorkoutView.vue. El título dobla como el del botón que lo abre. -->
      <BkSheet
        :open="pastWorkoutPickerOpen"
        :title="$t('calendar.logPastWorkout')"
        @close="pastWorkoutPickerOpen = false"
      >
        <div class="space-y-3 p-4">
          <!-- v0.11.0: hora de inicio opcional del retro, elegible YA al crear -->
          <BkTimeField
            v-model="pastWorkoutTime"
            :label="$t('workout.startTime')"
            :hint="$t('calendar.optional')"
            data-testid="past-workout-time"
          />
          <BkButton
            variant="primary"
            block
            data-testid="log-past-workout-free"
            :disabled="loggingPastWorkout"
            @click="logPastWorkout()"
          >
            {{ $t('calendar.logPastWorkoutFree') }}
          </BkButton>

          <div v-if="routines.length" class="space-y-2">
            <div class="flex items-center gap-3" aria-hidden="true">
              <span class="h-px flex-1 bg-line" />
              <span class="text-ink-faint text-sm">{{ $t('calendar.logPastWorkoutOr') }}</span>
              <span class="h-px flex-1 bg-line" />
            </div>
            <BkButton
              v-for="routine in routines"
              :key="routine.id"
              variant="ghost"
              block
              :data-testid="`log-past-workout-routine-${routine.id}`"
              :disabled="loggingPastWorkout"
              @click="logPastWorkout(routine.id)"
            >
              <BkRune v-if="routineRune(routine)" :name="routineRune(routine) as RuneName" :size="16" />
              <span>{{ routine.name }}</span>
            </BkButton>
          </div>
        </div>
      </BkSheet>

    </template>

    <!-- item 1b (v0.4.2): pestaña de un usuario compartido — SOLO LECTURA,
         reusa WorkoutDayInfo con can-edit false (sin editar/borrar/retro-log,
         nada de lo de arriba encaja: no hay sus sesiones planificadas ni sus
         rutinas en el hilo de datos, solo el trío TargetUser explícito). Sin
         routineName (no se pide listRoutines(userId) de otro usuario, ver
         selectTab): la tarjeta cae al fallback "Entreno libre" siempre. -->
    <template v-else-if="activeSharedData">
      <div
        v-if="activeSharedData.ready && activeSharedData.workouts.length"
        class="space-y-3 bk-stagger"
        data-testid="shared-day-workouts"
      >
        <div v-for="(workout, i) in activeSharedData.workouts" :key="workout.id" :style="{ '--bk-stagger-i': i }">
          <WorkoutDayInfo
            :workout="workout"
            :routine-name="null"
            :exercise-catalog="activeSharedData.exercises"
            :can-edit="false"
          />
        </div>
      </div>

      <div v-if="activeSharedData.ready && activeSharedData.records.length" class="space-y-2 border border-line rounded-sm p-3">
        <h4 class="bk-eyebrow">{{ $t('calendar.prsOfDay') }}</h4>
        <div v-for="record in activeSharedData.records" :key="record.id" :data-testid="`pr-of-day-${record.id}`" class="flex items-center gap-2 text-ember text-sm">
          <BkRune name="pr" :size="18" tone="ember" />
          <span class="font-medium">
            {{ $t(`progress.kinds.${record.kind}`) }} — {{ sharedExerciseNameFor(record.exercise_id) }} — {{ formatRecordValue(record) }}
          </span>
        </div>
      </div>
    </template>

    <!-- Confirmar borrado de un entreno del día -->
    <BkSheet
      :open="confirmAction !== null"
      :title="$t('workout.discardTitle')"
      @close="confirmAction = null"
    >
      <div v-if="confirmAction" class="space-y-4">
        <p class="text-ink-muted">{{ $t('workout.discardHint') }}</p>
        <div class="flex gap-2">
          <BkButton
            variant="ghost"
            block
            @click="confirmAction = null"
          >
            {{ $t('common.cancel') }}
          </BkButton>
          <BkButton
            data-testid="confirm-delete"
            variant="primary"
            block
            :disabled="loading"
            @click="confirmDelete()"
          >
            {{ $t('common.confirm') }}
          </BkButton>
        </div>
      </div>
    </BkSheet>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'

import BkActionBtn from '@/lib/BkActionBtn.vue'
import BkButton from '@/lib/BkButton.vue'
import BkSelect from '@/lib/BkSelect.vue'
import BkField from '@/lib/BkField.vue'
import BkTimeField from '@/lib/BkTimeField.vue'
import BkDateField from '@/lib/BkDateField.vue'
import BkSheet from '@/lib/BkSheet.vue'
import BkRune from '@/lib/BkRune.vue'
import BkUser from '@/lib/BkUser.vue'
import WorkoutDayInfo from './WorkoutDayInfo.vue'
import { statusClasses } from './statusClasses'
import { isValidRuneName } from '@/lib/runeResolve'
import type { RuneName } from '@/lib/runes'
import { useAuthStore } from '@/stores/auth'
import type { ExerciseOut, PersonalRecordOut, RoutineOut, ScheduledOut, SharedUserOut, WorkoutOut } from '@/api/domain'
import {
  deleteSchedule,
  deleteWorkout,
  getRecords,
  listExercises,
  listRoutines,
  listWorkouts,
  schedule,
  startWorkout,
  updateSchedule,
} from '@/api/domain'
import { toastApiError } from '@/utils/apiErrors'
import { formatDayLabel, formatTimeShort, isoDate, todayIso } from '@/utils/dates'
import { parseUtc } from '@/utils/datetime'
import { formatWeight, formatWeightInt } from '@/utils/units'
import { useDisplayUnits } from '@/composables/useDisplayUnits'
import { exerciseName } from '@/components/routines/exerciseName'
import { useAthleteStore } from '@/stores/athlete'

const props = defineProps<{
  date: string
  scheduled: ScheduledOut[]
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
// item 1 (round 10): "programar rutina" solo tiene sentido hoy/futuro — un
// día pasado ya ofrece registrar/editar el entreno (arriba), "programar"
// no encaja conceptualmente ahí
const isTodayOrFuture = computed(() => props.date >= todayIso())
const isToday = computed(() => props.date === todayIso())
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

// amendment D: ya no hay título genérico de sheet ("Sesiones Programadas");
// las sesiones planificadas se agrupan bajo un eyebrow ligero solo cuando
// hay alguna PLANIFICADA de verdad (una lista solo de omitidas no lo lleva,
// "Planificado" sería engañoso ahí)
const plannedSessions = computed(() => props.scheduled.filter((s) => s.status !== 'done'))
const showPlannedEyebrow = computed(() => plannedSessions.value.some((s) => s.status === 'planned'))

// item 1: al programar HOY, las horas/minutos ya pasados se deshabilitan en
// el BkTimeField (min). Un día futuro no pasa min (cualquier hora vale).
const minTimeToday = computed(() => {
  if (!isToday.value) return undefined
  const now = new Date()
  return `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`
})

// Form state for creating new session
// null (no ''): BkTimeField emite null al limpiar/nunca elegir hora — el ''
// del campo de hora nativo que sustituye ya no aplica
const newTime = ref<string | null>(null)
const newRoutineId = ref<string>('')
const newNote = ref('')

// Replan state
const editingId = ref<number | null>(null)
const editDate = ref('')
const editTime = ref<string | null>(null)

// Confirm dialog state: 'kind' distingue qué API llamar en un delete —
// amendment A unifica la tarjeta de entreno con la de sesión, pero borrar
// cada una sigue siendo una operación distinta (deleteWorkout vs deleteSchedule)
const confirmAction = ref<
  | { type: 'skip'; id: number }
  | { type: 'delete'; id: number; kind: 'session' | 'workout' }
  | null
>(null)

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

async function skipSession(id: number) {
  confirmAction.value = { type: 'skip', id }
}

async function confirmSkip() {
  if (!confirmAction.value || confirmAction.value.type !== 'skip') return
  const id = confirmAction.value.id
  confirmAction.value = null

  try {
    loading.value = true
    await updateSchedule(id, { status: 'skipped' })
    emit('updated')
  } catch (error) {
    toastApiError(error)
  } finally {
    loading.value = false
  }
}

function deleteSession(id: number) {
  confirmAction.value = { type: 'delete', id, kind: 'session' }
}

function deleteWorkoutEntry(id: number) {
  confirmAction.value = { type: 'delete', id, kind: 'workout' }
}

function startReplan(session: ScheduledOut) {
  editingId.value = session.id
  editDate.value = session.date
  // I1: pydantic serializa la hora con segundos ("18:00:00") — pasarla tal
  // cual al trigger de BkTimeField enseñaría "18:00:00" en vez de "18:00"
  editTime.value = formatTimeShort(session.time)
}

async function saveReplan() {
  if (!editingId.value) return
  try {
    loading.value = true
    await updateSchedule(editingId.value, {
      date: editDate.value,
      time: editTime.value,
    })
    editingId.value = null
    editDate.value = ''
    editTime.value = null
    emit('updated')
  } catch (error) {
    toastApiError(error)
  } finally {
    loading.value = false
  }
}

function cancelReplan() {
  editingId.value = null
  editDate.value = ''
  editTime.value = null
}

async function confirmDelete() {
  if (!confirmAction.value || confirmAction.value.type !== 'delete') return
  const { id, kind } = confirmAction.value
  confirmAction.value = null

  try {
    loading.value = true
    if (kind === 'workout') {
      // amendment A: borrar la tarjeta unificada borra el ENTRENO. El
      // backend revierte la sesión vinculada (si la había) a 'planned' —
      // comportamiento menos sorprendente: tras recargar el mes, esa sesión
      // vuelve a aparecer en la lista de planificadas de arriba, como si el
      // entreno nunca se hubiera registrado. Un standalone (sin sesión) solo
      // desaparece, sin nada que reaparezca.
      await deleteWorkout(id)
      await loadDayInfo()
    } else {
      await deleteSchedule(id)
    }
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

async function createSession() {
  try {
    loading.value = true
    await schedule({
      date: props.date,
      time: newTime.value,
      routine_id: newRoutineId.value ? Number(newRoutineId.value) : null,
      note: newNote.value || null,
    })
    newTime.value = null
    newRoutineId.value = ''
    newNote.value = ''
    emit('updated')
  } catch (error) {
    toastApiError(error)
  } finally {
    loading.value = false
  }
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

      <!-- Sesiones planificadas/omitidas: las completadas ya se muestran arriba
           como tarjeta unificada (amendment A), no aquí -->
      <div v-if="plannedSessions.length" class="space-y-3">
        <p v-if="showPlannedEyebrow" class="bk-eyebrow">{{ $t('calendar.plannedEyebrow') }}</p>
        <div
          v-for="session in plannedSessions"
          :key="session.id"
          class="border border-line rounded-sm p-3 space-y-2"
        >
          <div class="flex items-center justify-between">
            <div class="flex-1">
              <p class="font-medium text-ink">{{ formatTimeShort(session.time) || '–' }}</p>
              <p v-if="session.note" class="text-sm text-ink-muted">{{ session.note }}</p>
            </div>
            <div class="flex items-center gap-2">
              <span
                :data-status="session.status"
                :class="['w-2.5 h-2.5', statusClasses(session.status)]"
              />
            </div>
          </div>

          <!-- Actions: v0.3.0 item 5 — "Botón en calendario de borrar, omitir y
               replanificar con iconos", mismo patrón icon-only que las tarjetas
               de entreno (WorkoutDayInfo) en vez de botones de texto -->
          <div v-if="isViewingSelf" class="flex items-center gap-1">
            <BkActionBtn
              v-if="session.status === 'planned'"
              icon="replan"
              :data-testid="`replan-session-${session.id}`"
              :aria-label="$t('calendar.replan')"
              @click="startReplan(session)"
            />
            <BkActionBtn
              v-if="session.status === 'planned'"
              icon="skip"
              :data-testid="`skip-session-${session.id}`"
              :aria-label="$t('calendar.skip')"
              @click="skipSession(session.id)"
            />
            <BkActionBtn
              icon="delete"
              :data-testid="`delete-session-${session.id}`"
              :aria-label="$t('common.delete')"
              @click="deleteSession(session.id)"
            />
          </div>
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

      <!-- Create new session form: solo hoy/futuro (item 1) -->
      <div v-if="isViewingSelf && isTodayOrFuture" class="border border-line rounded-sm p-3 space-y-3">
        <h4 class="font-medium text-ink">{{ $t('calendar.newSession') }}</h4>
        <div class="space-y-2">
          <BkTimeField
            v-model="newTime"
            :label="$t('calendar.time')"
            :hint="$t('calendar.optional')"
            :min="minTimeToday"
          />
          <BkSelect
            v-model="newRoutineId"
            :options="[{ value: '', label: $t('calendar.selectRoutine'), disabled: true }, ...routines.map(r => ({ value: String(r.id), label: r.name }))]"
            :label="$t('calendar.routine')"
          />
          <BkField
            v-model="newNote"
            type="text"
            :label="$t('calendar.note')"
            :hint="$t('calendar.optional')"
          />
          <BkButton
            variant="primary"
            block
            :disabled="loading"
            @click="createSession"
          >
            {{ $t('calendar.schedule') }}
          </BkButton>
        </div>
      </div>
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

    <!-- Replan sheet -->
    <BkSheet :open="editingId !== null" :title="$t('calendar.replan')" @close="cancelReplan">
      <div v-if="editingId !== null" class="space-y-3">
        <BkDateField
          v-model="editDate"
          :label="$t('calendar.date')"
        />
        <BkTimeField
          v-model="editTime"
          :label="$t('calendar.time')"
          :hint="$t('calendar.optional')"
        />
        <div class="flex gap-2">
          <BkButton
            variant="ghost"
            block
            @click="cancelReplan"
          >
            {{ $t('common.cancel') }}
          </BkButton>
          <BkButton
            variant="primary"
            block
            :disabled="loading"
            @click="saveReplan"
          >
            {{ $t('common.save') }}
          </BkButton>
        </div>
      </div>
    </BkSheet>

    <!-- Confirm sheet -->
    <BkSheet
      :open="confirmAction !== null"
      :title="confirmAction?.type === 'skip' ? $t('calendar.confirmSkip') : (confirmAction?.kind === 'workout' ? $t('workout.discardTitle') : $t('calendar.confirmDelete'))"
      @close="confirmAction = null"
    >
      <div v-if="confirmAction" class="space-y-4">
        <p class="text-ink-muted">
          {{ confirmAction.type === 'skip'
            ? $t('calendar.confirmSkipMessage')
            : (confirmAction.kind === 'workout' ? $t('workout.discardHint') : $t('calendar.confirmDeleteMessage')) }}
        </p>
        <div class="flex gap-2">
          <BkButton
            variant="ghost"
            block
            @click="confirmAction = null"
          >
            {{ $t('common.cancel') }}
          </BkButton>
          <BkButton
            :data-testid="`confirm-${confirmAction.type}`"
            variant="primary"
            block
            :disabled="loading"
            @click="confirmAction.type === 'skip' ? confirmSkip() : confirmDelete()"
          >
            {{ $t('common.confirm') }}
          </BkButton>
        </div>
      </div>
    </BkSheet>
  </div>
</template>

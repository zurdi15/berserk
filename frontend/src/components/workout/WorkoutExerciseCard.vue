<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'

import type {
  ExerciseHistoryOut,
  ExerciseOut,
  MuscleGroupOut,
  PersonalRecordOut,
  RoutineOut,
  SetIn,
  SetOut,
  WorkoutExerciseOut,
} from '@/api/domain'
import { primaryRune as resolvePrimaryRune } from '@/lib/runeResolve'
import { exerciseName } from '@/components/routines/exerciseName'
import { toastApiError } from '@/utils/apiErrors'
import { useRestTimerStore } from '@/stores/restTimer'
import { exerciseImageUrl } from '@/api/domain'
import {
  cancelNativeCardioEndAlarm,
  onWearTimerCancelled,
  scheduleNativeCardioEndAlarm,
  startNativeCardioCountdown,
  stopNativeCardioCountdown,
  syncWearTimer,
  type WearStopReason,
} from '@/utils/nativeShell'
import {
  clearPersistedCardioCountdown,
  getPersistedCardioCountdown,
  setPersistedCardioCountdown,
  type PersistedCardioCountdown,
} from '@/utils/uiPrefs'
import { formatLoad } from '@/utils/units'
import BkButton from '@/lib/BkButton.vue'
import BkCard from '@/lib/BkCard.vue'
import BkCheck from '@/lib/BkCheck.vue'
import BkMedia from '@/lib/BkMedia.vue'
import BkRune from '@/lib/BkRune.vue'
import BkSheet from '@/lib/BkSheet.vue'
import BkStepper from '@/lib/BkStepper.vue'
import type { RuneName } from '@/lib/runes'
import CardioCountdown from './CardioCountdown.vue'
import CardioStartSheet from './CardioStartSheet.vue'
import { formatDuration } from './duration'
import { REST_MAX_SECONDS, REST_MIN_SECONDS, REST_PRESETS, REST_STEP_SECONDS, restFor } from './rest'
import { suggestNextLoad } from './progression'
import { resolveNewSetDefaults } from './setDefaults'
import { formatHistorySetLines } from './setHistoryFormat'
import SetForm from './SetForm.vue'
import type { WorkoutActions } from './workoutActions'

const props = withDefaults(
  defineProps<{
    workoutExercise: WorkoutExerciseOut
    exercise?: ExerciseOut
    muscleGroups?: MuscleGroupOut[]
    routines?: RoutineOut[]
    // solo hace falta para el cálculo del descanso (ver rest.ts); null en el
    // editor retroactivo, donde restEnabled ya lo deja sin usar
    routineId?: number | null
    exerciseIds: number[]
    units?: 'kg' | 'lb'
    locale?: string
    // store-agnóstico (round 8): quien monta la tarjeta decide si las
    // acciones van contra activeWorkout (entreno en vivo) o workoutEditor
    // (edición retroactiva) — ver workoutActions.ts
    actions: WorkoutActions
    // el descanso post-serie (y su control, item 11) es un concepto de
    // entreno EN VIVO: el editor retroactivo no lo quiere (no hay nada de
    // lo que "descansar" editando historial, ni countdown de cardio con
    // sentido — ver el prop `live` de abajo)
    restEnabled?: boolean
    // v0.9.4: "¿es el entreno EN VIVO?" separado de restEnabled — antes el
    // countdown de cardio colgaba de restEnabled, así que apagar el toggle
    // de descanso automático también escondía "Empezar". Con el descanso
    // fuera de cardio (zurdi) esa carambola ya no tiene ninguna lógica:
    // WorkoutView deja el default (true) y el editor retroactivo pasa false
    live?: boolean
    // v0.3.2 CARDIO-COUNTDOWN PERSISTENCE: id del entreno activo — hace
    // falta para poder persistir {workoutId, workoutExerciseId, ...} al
    // arrancar un countdown de cardio (ver uiPrefs.ts). Opcional (null en
    // vez de requerido) para no romper otros consumidores/tests de esta
    // tarjeta que no tienen ni necesitan cardio-countdown; sin él, sencillamente
    // no se persiste nada (ver startCardio).
    workoutId?: number | null
    // countdown de cardio que WorkoutView detectó al montar como "todavía
    // corriendo" (endsAt en el futuro) tras volver de una pestaña evictada —
    // null si no hay ninguno, o si el que hay no es de ESTE ejercicio (el
    // filtro por workoutExerciseId vive en el watch de abajo)
    resumedCountdown?: PersistedCardioCountdown | null
    // v0.5.0 superseries: quien monta la tarjeta (WorkoutView) computa el
    // agrupado por contigüidad (lib/supersets.ts) y lo baja ya resuelto —
    // la tarjeta no ve a sus hermanas, así que no puede computarlo sola.
    // supersetLabel: 'A'/'B'… o null = suelto (sin frame ni chip).
    supersetLabel?: string | null
    // ¿es el ÚLTIMO miembro (por orden) de su grupo? Regla posicional del
    // auto-descanso: SOLO el último miembro dispara descanso al registrar
    // una serie; los demás encadenan al siguiente sin descansar. true por
    // defecto (un suelto siempre "cierra su ronda" y descansa normal).
    supersetLast?: boolean
    // marcado como "siguiente" tras registrar una serie en el miembro
    // anterior del grupo — chip pequeño, puramente presentacional
    supersetNext?: boolean
    // v0.18.1 (zurdi: "los bloques deberían poder cambiarse también mid
    // entreno"): etiquetas de bloque existentes en el entreno — alimentan
    // el picker "Bloque: X" (solo en vivo y si actions.setExerciseBlock
    // existe)
    blockLabels?: string[]
  }>(),
  {
    muscleGroups: () => [],
    routines: () => [],
    routineId: null,
    units: 'kg',
    locale: 'es',
    restEnabled: true,
    live: true,
    workoutId: null,
    resumedCountdown: null,
    supersetLabel: null,
    supersetLast: true,
    supersetNext: false,
    blockLabels: () => [],
  },
)

const emit = defineEmits<{
  recorded: [records: PersonalRecordOut[]]
  // item 9: cada serie NUEVA logueada con éxito, sea o no récord — el padre
  // decide si dispara el pulso neón (se salta cuando gana la celebración de PR)
  logged: [hasNewRecords: boolean]
  // v0.18.1: "+ Nuevo bloque…" del picker — el padre (WorkoutView) abre su
  // sheet de nombre y asigna al confirmar
  newBlock: []
}>()

const { t } = useI18n()
const restTimer = useRestTimerStore()

const removeConfirming = ref(false)
const deleteConfirming = ref<number | null>(null)
const drawerOpen = ref(false)
const editingSet = ref<SetOut | null>(null)
const restPickerOpen = ref(false)
const history = ref<ExerciseHistoryOut | null>(null)
// facelift: sheet kebab del ejercicio — reordenar, descanso, bloque y quitar
// viven ahí; la card queda para lo que pasa en el banco (series y nota)
const menuOpen = ref(false)

// v0.3.2 CARDIO-COUNTDOWN PERSISTENCE: countdown "resucitado" que esta
// tarjeta (y no el cajón/SetForm) muestra directamente en el cuerpo de la
// tarjeta — ver la nota de diseño en CardioCountdown más abajo. `watch` en
// vez de una lectura de una sola vez en el setup: el prop puede llegar tras
// el primer render (WorkoutView decide qué reabrir de forma asíncrona, ver
// WorkoutView.vue::checkPersistedCardioCountdown), así que hace falta
// reaccionar cuando aparece, no solo leerlo al crear el componente.
const resumedActive = ref<PersistedCardioCountdown | null>(null)
watch(
  () => props.resumedCountdown,
  (value) => {
    if (value && value.workoutExerciseId === props.workoutExercise.id) resumedActive.value = value
  },
  { immediate: true },
)

const name = computed(() => exerciseName(props.exercise, props.locale))
// v0.30.0: la imagen del ejercicio viaja a las notificaciones del móvil (descanso y cardio)
const exerciseImage = computed(() => (props.exercise?.has_image ? exerciseImageUrl(props.exercise.id) : undefined))

// v0.28.0 reloj + shell (zurdi: "vamos directamente a por la C"): el
// countdown de cardio sale de la web — cuenta atrás ongoing en la barra del
// móvil y alarma sonora a cero (como el descanso) y estado en la Data Layer
// para el Galaxy Watch. Cuelga de resumedActive porque es el ÚNICO estado
// que refleja un countdown vivo en esta tarjeta (arranque fresco, resume
// tras evicción, cancelación, auto-log): un solo watcher cubre todos los
// caminos. Todo no-op en web.
// v0.29.0: por qué se apaga el countdown — el reloj solo calla la alarma si
// lo paró el usuario (cancelled); si terminó solo (finished, auto-log) sigue
// vibrando hasta su OK
let cardioStopReason: WearStopReason = 'cancelled'
watch(resumedActive, (timer, previous) => {
  if (timer) {
    const title = `${t('timer.cardioOngoingTitle')} · ${name.value}`
    // en el móvil el ejercicio va como subtítulo: el título es solo el tipo
    void startNativeCardioCountdown(timer.endsAt, t('timer.cardioOngoingTitle'), { subtitle: name.value, imageUrl: exerciseImage.value })
    void scheduleNativeCardioEndAlarm(
      timer.endsAt,
      t('workout.cardio.timeUp'),
      t('timer.notifyBodyWithExercise', { exercise: name.value }),
      { subtitle: name.value, imageUrl: exerciseImage.value },
    )
    void syncWearTimer({
      kind: 'cardio',
      state: 'running',
      targetEpochMs: timer.endsAt,
      totalMs: timer.targetSeconds * 1000,
      title,
    })
  } else if (previous) {
    void stopNativeCardioCountdown()
    void cancelNativeCardioEndAlarm()
    void syncWearTimer({ kind: 'cardio', state: 'stopped', reason: cardioStopReason })
    cardioStopReason = 'cancelled'
  }
})
// cancelado desde la muñeca: misma salida que el botón cancelar de la tarjeta
const stopWearCancel = onWearTimerCancelled((kind) => {
  if (kind === 'cardio' && resumedActive.value) onResumedCancel()
})
onBeforeUnmount(stopWearCancel)

// runa del grupo muscular primario del ejercicio, si el catálogo lo resuelve
const primaryRune = computed<RuneName | null>(() => resolvePrimaryRune(props.exercise, props.muscleGroups))

const index = computed(() => props.exerciseIds.indexOf(props.workoutExercise.id))
const isFirst = computed(() => index.value <= 0)
const isLast = computed(() => index.value === -1 || index.value === props.exerciseIds.length - 1)

// item 6: los ejercicios de cardio se leen como un bloque distinto (sin
// numerar, con acento de borde) en vez de series numeradas de fuerza
const isCardio = computed(() => props.exercise?.measurement === 'cardio')
// (v0.18.0: el modo kg/nivel vive en CADA SERIE — set.load_mode; el modo
// por-ejercicio de la v0.17.x murió)

// fix M10a (revisión): el contador del header debe ser el nº de series
// EFECTIVAS (sin calentamiento), como en el resto de la app (FinishSummary,
// saveAsRoutine.ts...) — antes contaba workoutExercise.sets.length a secas
const effectiveSetCount = computed(
  () => props.workoutExercise.sets.filter((s) => !s.is_warmup).length,
)

// item 11: descanso efectivo (override del entreno > target de rutina > default)
const effectiveRestSeconds = computed(() =>
  restFor(props.workoutExercise.rest_seconds, props.routineId, props.routines, props.workoutExercise.exercise_id),
)

// v0.5.0 superseries: el auto-descanso solo salta al cerrar la ronda del
// grupo — un miembro que NO es el último encadena al siguiente sin descanso.
// Regla posicional pura: da igual cuántas series lleve cada miembro. El
// descanso MANUAL (picker de arriba) y la cancelación no cambian.
// En el template, las cards de un grupo comparten el frame de borde lateral
// aurora (mismo idiom que el acento de cardio) + chip "Superserie A" — el
// comentario vive AQUÍ y no como primer hijo del <template> (gotcha: un
// comentario raíz convierte la raíz en fragmento y rompe fallthrough).
const autoRestFires = computed(() => props.supersetLabel == null || props.supersetLast)

// v0.9.4: gatea el formulario inline de cardio hasta que la historia
// resolvió — SetForm siembra sus valores UNA vez al montar (no reacciona a
// cambios de initialSet), así que montarlo antes de conocer la historia lo
// dejaría con los defaults genéricos aunque hubiera una sesión previa de la
// que precargar duración/distancia. true también en error, como `ready` en
// el resto de la app: sin historia sigue habiendo formulario.
const historyLoaded = ref(false)

// item 3: se pide en cuanto se conoce el exercise_id (no solo al abrir el
// drawer): también alimenta el hint de la tarjeta cuando aún no hay series
watch(
  () => props.workoutExercise.exercise_id,
  async (exerciseId) => {
    // v0.12.0: la nota persistente viaja con el historial — misma política
    // de "hint de fondo, jamás un toast" (sin red simplemente no aparece)
    props.actions
      .exerciseNote(exerciseId)
      .then((value) => {
        note.value = value
      })
      .catch(() => {})
    try {
      history.value = await props.actions.exerciseHistory(exerciseId)
    } catch {
      // hint no crítico de fondo: si falla, simplemente no se muestra — no
      // interrumpe el flujo de logueo con un toast por esto
      history.value = null
    } finally {
      historyLoaded.value = true
    }
  },
  { immediate: true },
)

// v0.12.0 (backlog "notas por ejercicio"): nota por usuario+ejercicio,
// visible en la card y editable en un sheet — guardar vacía = borrar
const note = ref('')
const noteSheetOpen = ref(false)
const noteDraft = ref('')
const noteSaving = ref(false)

function openNoteEdit() {
  noteDraft.value = note.value
  noteSheetOpen.value = true
}

async function saveNote() {
  try {
    noteSaving.value = true
    note.value = await props.actions.saveExerciseNote(
      props.workoutExercise.exercise_id,
      noteDraft.value,
    )
    noteSheetOpen.value = false
  } catch (error) {
    toastApiError(error)
  } finally {
    noteSaving.value = false
  }
}

// item 4d + v0.17.0 (zurdi: "las series x reps de las últimas veces están en
// una sola línea, ponlas en distintas líneas como en el drawer"): el MISMO
// bloque multilínea sirve al cajón y al hint de la tarjeta — la línea densa
// agrupada (formatHistoryLine) murió con su último consumidor
const historyLines = computed(() => {
  if (!props.exercise || !history.value?.sets.length) return []
  return formatHistorySetLines(history.value.sets, props.exercise.measurement, props.units)
})

const historyDateLabel = computed(() => {
  if (!history.value) return ''
  return new Intl.DateTimeFormat(props.locale, { day: 'numeric', month: 'short' }).format(
    new Date(`${history.value.date}T00:00:00`),
  )
})

// v0.24.0 — sugerencia de progresión (doble progresión): solo en vivo, solo
// fuerza, solo ANTES de la primera serie efectiva de hoy (la sugerencia es
// el peso con el que empezar). Ver progression.ts para las reglas.
const routineTargetRow = computed(() => {
  const routine = props.routineId ? props.routines.find((r) => r.id === props.routineId) : undefined
  return routine?.exercises.find((e) => e.exercise_id === props.workoutExercise.exercise_id)
})

const progressionSuggestion = computed<number | null>(() => {
  if (!props.live || props.exercise?.measurement !== 'strength') return null
  if (props.workoutExercise.sets.some((s) => !s.is_warmup)) return null
  return suggestNextLoad(history.value?.sets, routineTargetRow.value ?? undefined)
})

// la chip abre el cajón YA prefijado con el peso sugerido — se aplica solo
// mientras ese cajón está abierto (cerrar restablece el prefill normal)
const suggestionActive = ref(false)

function openSuggested() {
  suggestionActive.value = true
  openNew()
}

// item 2: prioridad de defaults para una serie NUEVA; en edición, los
// valores EXACTOS de la serie que se corrige (ver setDefaults.ts)
const drawerDefaults = computed(() => {
  if (editingSet.value) return editingSet.value
  const base = resolveNewSetDefaults(
    props.workoutExercise.sets,
    history.value?.sets,
    props.routineId,
    props.routines,
    props.workoutExercise.exercise_id,
  )
  if (suggestionActive.value && progressionSuggestion.value != null) {
    return { ...(base ?? {}), weight_kg: progressionSuggestion.value, load_mode: 'weight' as const }
  }
  return base
})

function formatSetValue(set: SetOut): string {
  const measurement = props.exercise?.measurement
  if (measurement === 'strength' || (measurement === 'bodyweight' && set.weight_kg)) {
    return `${set.reps} × ${formatLoad(set.weight_kg ?? 0, props.units, set.load_mode ?? 'weight')}`
  }
  if (measurement === 'bodyweight') {
    return `${set.reps} ${t('workout.reps')}`
  }
  if (measurement === 'timed') {
    return formatDuration(set.duration_seconds ?? 0)
  }
  if (measurement === 'cardio') {
    const base = formatDuration(set.duration_seconds ?? 0)
    return set.distance_m ? `${base} · ${set.distance_m} m` : base
  }
  return ''
}

function openNew() {
  editingSet.value = null
  drawerOpen.value = true
}

function openEdit(set: SetOut) {
  editingSet.value = set
  drawerOpen.value = true
}

function closeDrawer() {
  drawerOpen.value = false
  editingSet.value = null
  suggestionActive.value = false
}

// item 1: "Registrar serie" (keepOpen=false) cierra el cajón; "Registrar y
// otra" (keepOpen=true) lo deja abierto para series consecutivas rápidas —
// nunca se auto-abre un formulario tras añadir un ejercicio (bug de zurdi)
// porque el cajón solo se abre desde openNew/openEdit, nunca solo
async function onDrawerSubmit(value: SetIn, keepOpen: boolean) {
  try {
    if (editingSet.value) {
      await props.actions.updateSet(props.workoutExercise.id, editingSet.value.id, value)
      closeDrawer()
      return
    }
    await submitNewSet(value)
    if (!keepOpen) closeDrawer()
  } catch (error) {
    toastApiError(error)
  }
}

// núcleo compartido del logueo de una serie NUEVA: cajón (onDrawerSubmit) y
// check de ghost (quickLog) pasan por aquí — descanso, PRs y NeonPulse salen
// idénticos vengan de donde vengan
async function submitNewSet(value: SetIn) {
  const result = await props.actions.logSet(props.workoutExercise.id, value)
  // v0.3.2 CARDIO-COUNTDOWN PERSISTENCE: cualquier serie logueada para
  // este ejercicio limpia un countdown persistido para él — venga del
  // countdown recién terminado solo (onCountdownDone → submit) o de un
  // registro MANUAL mientras corría (el usuario no esperó, logueó a
  // mano): nunca debe quedar una entrada "zombie" en localStorage tras un
  // logueo real de este mismo ejercicio
  clearPersistedCardioCountdownForThisExercise()
  // v0.9.4 (zurdi): un bloque de cardio no descansa — ni control ni timer
  if (props.restEnabled && autoRestFires.value && !isCardio.value) {
    // nombre del ejercicio → cuerpo de la notificación de fin de descanso
    restTimer.start(effectiveRestSeconds.value, name.value, exerciseImage.value)
  }
  if (result.new_records.length) emit('recorded', result.new_records)
  emit('logged', result.new_records.length > 0)
}

// ── facelift: GHOST ROWS — la serie pendiente como fila con check ─────────
// La rutina define el objetivo (target_sets); las series que faltan se
// pintan como filas "fantasma" prefijadas con resolveNewSetDefaults (esta
// sesión > sesión anterior > objetivo de rutina). Tocar el CHECK registra la
// serie tal cual, de un toque, por el MISMO camino que el cajón (descanso,
// PR, neón — ver submitNewSet); tocar la FILA abre el cajón para ajustarla.
// Ejercicios libres (sin objetivo) y el editor retro pintan UNA ghost (la
// "siguiente serie"); cardio nunca (su modelo son las dos acciones).
const targetSets = computed<number | null>(() => routineTargetRow.value?.target_sets ?? null)

const pendingGhostCount = computed(() => {
  if (isCardio.value || !props.exercise) return 0
  if (props.live && targetSets.value != null) {
    return Math.max(0, targetSets.value - effectiveSetCount.value)
  }
  return 1
})

// SetIn listo para el check de un toque; null = el prefill no alcanza para
// loguear a ciegas (se abre el cajón en su lugar)
const ghostQuickBody = computed<SetIn | null>(() => {
  const defaults = drawerDefaults.value
  if (!defaults || editingSet.value) return null
  const measurement = props.exercise?.measurement
  const body: SetIn = { is_warmup: false }
  if (measurement === 'strength') {
    if (defaults.reps == null || defaults.weight_kg == null) return null
    body.reps = defaults.reps
    body.weight_kg = defaults.weight_kg
    if (defaults.load_mode) body.load_mode = defaults.load_mode
  } else if (measurement === 'bodyweight') {
    if (defaults.reps == null) return null
    body.reps = defaults.reps
    if (defaults.weight_kg != null) {
      body.weight_kg = defaults.weight_kg
      if (defaults.load_mode) body.load_mode = defaults.load_mode
    }
  } else if (measurement === 'timed') {
    if (defaults.duration_seconds == null) return null
    body.duration_seconds = defaults.duration_seconds
  } else {
    return null
  }
  return body
})

// etiqueta de la fila ghost: el prefill formateado como se formatearía la
// serie ya hecha (mismo idiom que formatSetValue)
const ghostLabel = computed(() => {
  const body = ghostQuickBody.value
  const measurement = props.exercise?.measurement
  if (!body) return t('workout.nextSet')
  if (measurement === 'strength' || (measurement === 'bodyweight' && body.weight_kg != null)) {
    return `${body.reps} × ${formatLoad(body.weight_kg ?? 0, props.units, body.load_mode ?? 'weight')}`
  }
  if (measurement === 'bodyweight') return `${body.reps} ${t('workout.reps')}`
  if (measurement === 'timed') return formatDuration(body.duration_seconds ?? 0)
  return t('workout.nextSet')
})

const quickLogging = ref(false)

async function quickLog() {
  if (quickLogging.value) return
  const body = ghostQuickBody.value
  if (!body) {
    openNew()
    return
  }
  quickLogging.value = true
  try {
    await submitNewSet(body)
  } catch (error) {
    toastApiError(error)
  } finally {
    quickLogging.value = false
  }
}

// v0.3.2 CARDIO-COUNTDOWN PERSISTENCE: solo limpia si lo persistido es
// literalmente de ESTE ejercicio — defensivo aunque solo pueda existir un
// countdown a la vez app-wide (una única clave global, ver uiPrefs.ts), para
// no depender de esa invariante desde cada punto de limpieza
function clearPersistedCardioCountdownForThisExercise() {
  const persisted = getPersistedCardioCountdown()
  if (persisted?.workoutExerciseId === props.workoutExercise.id) clearPersistedCardioCountdown()
}

// (v0.11.6: los handlers onCountdownStart/onCountdownCancel del countdown
// del CAJÓN murieron con el botón "Empezar" de SetForm — arrancar cardio es
// exclusivo del "Empezar" de la card, ver startCardio)

// countdown RESUMIDO (superficie compacta en el cuerpo de la tarjeta, no en
// el cajón — ver la nota de diseño junto al <CardioCountdown> del template):
// llegó a 0 mientras la app seguía abierta y el usuario lo vio terminar
async function onResumedDone() {
  const persisted = resumedActive.value
  if (!persisted) return
  try {
    const body: SetIn = { duration_seconds: persisted.targetSeconds }
    if (persisted.distanceM) body.distance_m = persisted.distanceM
    const result = await props.actions.logSet(persisted.workoutExerciseId, body)
    clearPersistedCardioCountdown()
    cardioStopReason = 'finished'
    resumedActive.value = null
    // v0.9.4: sin descanso tras cardio — este camino SIEMPRE es cardio
    if (result.new_records.length) emit('recorded', result.new_records)
    emit('logged', result.new_records.length > 0)
  } catch (error) {
    // NO se limpia aquí: si fue un fallo transitorio (red caída al volver),
    // el countdown ya terminado (mostrando 0:00) se queda con su botón de
    // cancelar como vía de escape en vez de perder en silencio una serie que
    // de verdad se corrió
    toastApiError(error)
  }
}

function onResumedCancel() {
  clearPersistedCardioCountdown()
  resumedActive.value = null
}

// v0.10.0 (zurdi: "o una entrada con el tiempo hecho y ya, o empezar timer y
// que se añada solo — no inline controls y formulario"): la card de cardio
// pasa de formulario inline permanente (v0.9.4) a DOS acciones limpias —
// "Registrar tiempo" abre el cajón (entrada directa del tiempo hecho) y
// "Empezar" arranca el countdown con el objetivo por defecto (última vez /
// rutina) REUTILIZANDO la superficie de resume tal cual: se siembra el mismo
// estado persistido y CardioCountdown + onResumedDone (auto-log al llegar a
// 0) hacen el resto. Ajustar el objetivo fino se hace desde el cajón, que
// también sabe arrancar countdown.
const cardioTargetSeconds = computed(() => drawerDefaults.value?.duration_seconds ?? 20 * 60)

// v0.11.5 (zurdi: "cuando se inicia un ejercicio de cardio se tiene que poder
// elegir cuánto tiempo vas a hacer ese cardio"): "Empezar" ya no arranca a
// ciegas con cardioTargetSeconds — abre el picker (ver CardioStartSheet.vue),
// que parte de ese mismo objetivo y devuelve el elegido. El objetivo heredado
// sigue siendo el default y la etiqueta del botón, así que el caso normal es
// abrir y confirmar.
const cardioStartOpen = ref(false)

function startCardio(seconds: number) {
  cardioStartOpen.value = false
  if (props.workoutId == null) return
  const persisted: PersistedCardioCountdown = {
    endsAt: Date.now() + Math.max(1, seconds) * 1000,
    workoutId: props.workoutId,
    workoutExerciseId: props.workoutExercise.id,
    targetSeconds: seconds,
    distanceM: drawerDefaults.value?.distance_m ?? undefined,
  }
  setPersistedCardioCountdown(persisted)
  resumedActive.value = persisted
}

// v0.10.0 (zurdi): "cuánto se hizo las últimas 4 veces" — llega con el
// historial (recent_cardio, solo para cardio; ver backend progress.py)
const recentCardio = computed(() => history.value?.recent_cardio ?? [])

function formatCardioEntry(entry: { date: string; duration_seconds: number | null; distance_m: number | null }): string {
  const day = new Intl.DateTimeFormat(props.locale, { day: 'numeric', month: 'short' }).format(
    new Date(`${entry.date}T00:00:00`),
  )
  const base = `${day} · ${formatDuration(entry.duration_seconds ?? 0)}`
  return entry.distance_m ? `${base} · ${entry.distance_m} m` : base
}

// facelift v2 (zurdi: "que se puedan des-seleccionar"): quitar el check de
// una serie HECHA la borra — el gesto simétrico del check que la creó. Va
// por el store (outbox) y la fila sale con la animación bk-remove; volver a
// marcarla es un toque en el ghost que reaparece.
async function uncheckSet(setId: number) {
  try {
    await props.actions.deleteSet(props.workoutExercise.id, setId)
  } catch (error) {
    toastApiError(error)
  }
}

async function onDeleteSet(setId: number) {
  deleteConfirming.value = null
  try {
    await props.actions.deleteSet(props.workoutExercise.id, setId)
    // facelift: borrar vive en el pie del cajón de edición — la serie ya no
    // existe, así que el cajón se cierra con ella
    closeDrawer()
  } catch (error) {
    toastApiError(error)
  }
}

// ── v0.18.1 picker de bloque (mismo idiom que el de descanso: línea
// punteada que revela chips) ───────────────────────────────────────────────
const blockPickerOpen = ref(false)

const currentBlockName = computed(
  () => props.workoutExercise.block_label ?? t('routines.blockNone'),
)

async function pickBlock(label: string | null) {
  blockPickerOpen.value = false
  if ((props.workoutExercise.block_label ?? null) === label) return
  try {
    await props.actions.setExerciseBlock?.(props.workoutExercise.id, label)
  } catch (error) {
    toastApiError(error)
  }
}

function requestNewBlock() {
  blockPickerOpen.value = false
  emit('newBlock')
}

async function pickRest(seconds: number) {
  restPickerOpen.value = false
  try {
    await props.actions.setExerciseRest(props.workoutExercise.id, seconds)
  } catch (error) {
    toastApiError(error)
  }
}

// item 7 (v0.4.3, zurdi): entrada manual vía stepper, JUNTO a los presets —
// a diferencia de pickRest() (chip de preset), esto NO cierra el picker: un
// stepper se pulsa varias veces seguidas para afinar el valor (mismo motivo
// por el que los steppers de peso/reps del cajón de series tampoco cierran
// nada al tocarlos), cerrar en cada tap obligaría a reabrir el picker entre
// cada +5s
async function pickRestManual(seconds: number) {
  try {
    await props.actions.setExerciseRest(props.workoutExercise.id, seconds)
  } catch (error) {
    toastApiError(error)
  }
}

// v0.11.5 (zurdi: "ya que aún no se ha registrado nada, ese botón debería
// cancelar directamente"): la confirmación existe para proteger TRABAJO YA
// HECHO — un ejercicio sin ninguna serie registrada no tiene nada que
// proteger, así que la X lo quita de un toque. Se nota sobre todo en cardio
// (un bloque de cardio no acumula nada hasta que se registra el tiempo, así
// que la X era casi siempre un "me he equivocado al añadirlo"), pero la regla
// es general: lo que decide es si hay series, no la medición.
function onRemoveClick() {
  if (props.workoutExercise.sets.length) {
    removeConfirming.value = true
    return
  }
  confirmRemove()
}

async function confirmRemove() {
  removeConfirming.value = false
  menuOpen.value = false
  try {
    await props.actions.removeExercise(props.workoutExercise.id)
  } catch (error) {
    toastApiError(error)
  }
}

function swap(a: number, b: number): number[] {
  const copy = [...props.exerciseIds]
  ;[copy[a], copy[b]] = [copy[b], copy[a]]
  return copy
}

async function moveUp() {
  if (isFirst.value) return
  try {
    await props.actions.reorder(swap(index.value, index.value - 1))
  } catch (error) {
    toastApiError(error)
  }
}

async function moveDown() {
  if (isLast.value) return
  try {
    await props.actions.reorder(swap(index.value, index.value + 1))
  } catch (error) {
    toastApiError(error)
  }
}
</script>

<template>
  <!-- v0.23.0 (zurdi: "la card de cardio tiene el borde más ancho a la
       izquierda"): el acento lateral de cardio (item 6 v0.3.0) muere — con
       el facelift leía como un borde descuadrado, no como acento -->
  <BkCard>
    <!-- v0.7.0 (feedback de zurdi): el chip "Superserie A" y el acento del
         grupo suben al CONTENEDOR del bloque (ver WorkoutView.vue) — la card
         ya no pinta nada de superserie salvo el chip "Siguiente"; el acento
         lateral queda solo para cardio. supersetLabel se conserva como prop
         porque sigue gobernando el gating del auto-descanso (autoRestFires). -->
    <!-- facelift: header estilo referencia — la FOTO del ejercicio como
         protagonista (BkMedia, con pozo rúnico de fallback: v0.12.0 "que se
         vea la imagen" elevado a pieza central), nombre en caja mixta y una
         sublínea con runa + progreso de series. Los controles de gestión
         (reordenar, descanso, bloque, quitar) se mudan al sheet kebab -->
    <div class="flex items-start justify-between gap-3 mb-3">
      <div class="flex items-center gap-3 min-w-0">
        <!-- facelift v4: la foto grande vive junto a las SERIES (abajo); el
             header solo conserva el thumb en cardio, que no tiene esa zona -->
        <BkMedia
          v-if="isCardio"
          :exercise="exercise"
          :rune="primaryRune"
          size="md"
          :data-testid="`exercise-image-${workoutExercise.id}`"
        />
        <div class="min-w-0">
          <h3 class="bk-subtitle text-lg text-ink truncate">{{ name }}</h3>
          <p class="flex items-center gap-1.5 text-xs text-ink-faint">
            <BkRune v-if="primaryRune" :name="primaryRune" :size="12" />
            <span
              v-if="effectiveSetCount"
              class="bk-metric"
              :data-testid="`set-count-${workoutExercise.id}`"
            >{{ effectiveSetCount }}<template v-if="live && targetSets != null && targetSets >= effectiveSetCount">/{{ targetSets }}</template></span>
            <span
              v-if="supersetNext"
              :data-testid="`superset-next-${workoutExercise.id}`"
              class="text-xs text-aurora bg-aurora/15 border border-aurora rounded-full px-1.5 py-0.5 shrink-0"
            >{{ t('workout.supersetNext') }}</span>
          </p>
        </div>
      </div>
      <button
        type="button"
        :data-testid="`exercise-menu-${workoutExercise.id}`"
        class="bk-press w-10 h-10 rounded-full text-xl text-ink-muted hover:text-ink hover:bg-slab shrink-0"
        :aria-label="t('workout.exerciseMenu')"
        @click="menuOpen = true"
      >
        ⋯
      </button>
    </div>

    <!-- v0.12.0: nota persistente del ejercicio ("asiento en el 5") — la
         línea entera es el botón de edición; sin nota queda el affordance
         tenue de añadirla -->
    <button
      v-if="exercise"
      type="button"
      :data-testid="`exercise-note-${workoutExercise.id}`"
      class="bk-press block w-full text-left mb-2 text-xs italic border-l-2 pl-2 truncate"
      :class="note ? 'text-ink-muted border-aurora/40' : 'text-ink-faint border-line'"
      :aria-label="t('workout.noteTitle')"
      @click="openNoteEdit"
    >
      {{ note || t('workout.noteAdd') }}
    </button>

    <!-- v0.11.7: borrar una serie difumina su fila mientras las de abajo
         suben a cerrar el hueco (bk-remove) -->
    <!-- facelift: filas de serie estilo referencia — valor grande + CHECK
         lleno a la derecha; tocar la FILA abre el cajón de edición (borrar
         vive en el pie del cajón). Las acciones inline de editar/borrar de
         antes mueren: una fila = un gesto. -->
    <!-- facelift v4 (zurdi: "la imagen a la izquierda y a la derecha las
         series, aspect ratio 9:16"): la foto VERTICAL del ejercicio con peso
         real junto a la checklist — el patrón del player de la referencia.
         Solo en no-cardio (cardio no tiene checklist de series). -->
    <!-- v0.23.1 (zurdi: "deja más espacio entre la imagen y las series — no
         hagas la imagen más pequeña, acorta las series y hazlas más
         estrechas"): gap-3→gap-6 y la columna de series se acota (max-w-48)
         en vez de estirarse hasta el borde de la card -->
    <div
      v-if="workoutExercise.sets.length || pendingGhostCount"
      class="border-b border-line pb-3 mb-3"
      :class="!isCardio && 'flex items-center gap-6'"
    >
      <BkMedia
        v-if="!isCardio"
        :exercise="exercise"
        :rune="primaryRune"
        size="tall"
        class="self-start"
        :data-testid="`exercise-image-${workoutExercise.id}`"
      />
      <div class="relative space-y-1.5" :class="!isCardio && 'flex-1 min-w-0 max-w-48'">
      <!-- v0.24.0: sugerencia de progresión — cumplido el objetivo entero la
           última sesión, la chip propone subir; tocarla abre el cajón con el
           peso sugerido ya puesto -->
      <button
        v-if="progressionSuggestion != null"
        type="button"
        class="bk-press w-full flex items-center gap-1.5 rounded-lg border border-aurora/40 bg-aurora/5 px-2 py-1 text-left"
        :title="t('workout.progressionTitle')"
        :data-testid="`progression-hint-${workoutExercise.id}`"
        @click="openSuggested"
      >
        <span class="text-aurora text-xs" aria-hidden="true">↑</span>
        <span class="bk-metric text-sm text-aurora">{{ formatLoad(progressionSuggestion, units, 'weight') }}</span>
        <span class="text-2xs text-ink-faint">{{ t('workout.progressionHint') }}</span>
      </button>
      <TransitionGroup name="bk-remove">
      <div
        v-for="set in workoutExercise.sets"
        :key="set.id"
        :data-testid="`set-row-${set.id}`"
        class="flex items-center gap-2"
        :class="set.is_warmup && 'text-ink-faint'"
      >
        <button
          v-if="exercise"
          type="button"
          :data-testid="`edit-set-${set.id}`"
          class="bk-press flex-1 min-w-0 text-left rounded-md px-2 py-1 hover:bg-slab"
          :aria-label="t('common.edit')"
          @click="openEdit(set)"
        >
          <span class="bk-metric text-sm">
            <template v-if="!isCardio">{{ set.set_number }}. </template>{{ formatSetValue(set) }}
            <span v-if="set.rpe" class="text-ink-faint text-sm"> · RPE {{ set.rpe }}</span>
          </span>
        </button>
        <span v-else class="flex-1 min-w-0 bk-metric text-sm px-2 py-1">
          <template v-if="!isCardio">{{ set.set_number }}. </template>{{ formatSetValue(set) }}
        </span>
        <!-- des-marcar = borrar la serie (facelift v2) — el pie del cajón
             de edición sigue existiendo como camino explícito -->
        <BkCheck
          :model-value="true"
          size="md"
          :aria-label="t('workout.setDone', { n: set.set_number })"
          :data-testid="`uncheck-set-${set.id}`"
          @update:model-value="uncheckSet(set.id)"
        />
      </div>
      </TransitionGroup>
      <!-- GHOSTS: las series que faltan hasta el objetivo de la rutina (o la
           "siguiente serie" en libres/editor), prefijadas — el check las
           registra de un toque, la fila abre el cajón para ajustar. La
           primera es la "serie activa" (resaltada, como en la referencia). -->
      <div
        v-for="g in pendingGhostCount"
        :key="`ghost-${g}`"
        :data-testid="`ghost-set-${workoutExercise.id}-${g - 1}`"
        class="flex items-center gap-2 rounded-lg"
        :class="g === 1 && 'bg-aurora/5 outline outline-1 outline-aurora/30 p-1.5 -mx-1.5'"
      >
        <button
          v-if="exercise"
          type="button"
          class="bk-press flex-1 min-w-0 text-left rounded-md px-2 py-1"
          :aria-label="t('workout.nextSet')"
          @click="openNew"
        >
          <!-- numeración continua con set_number (que cuenta TODAS las
               series, calentamientos incluidos), no con las efectivas -->
          <span class="bk-metric text-sm" :class="g === 1 ? 'text-ink-muted' : 'text-ink-faint'">
            <template v-if="!isCardio">{{ workoutExercise.sets.length + g }}. </template>{{ ghostLabel }}
          </span>
        </button>
        <BkCheck
          v-if="g === 1"
          :model-value="false"
          size="md"
          :disabled="quickLogging || !exercise"
          :data-testid="`ghost-check-${workoutExercise.id}`"
          :aria-label="t('workout.logSet')"
          @update:model-value="quickLog"
        />
        <span v-else class="w-7 h-7 shrink-0" aria-hidden="true" />
      </div>
      </div>
    </div>
    <!-- v0.17.0 (zurdi): el hint de "última vez" deja la línea densa truncada
         y pasa al mismo bloque multilínea del drawer — fecha en su línea y
         cada serie en la suya, menos densidad en la card. facelift v3
         (zurdi: "que ese bloque se quede siempre visible aunque hagas
         check"): visible SIEMPRE que haya historial — es la referencia
         contra la que se entrena hoy, no solo el arranque -->
    <div
      v-if="historyLines.length"
      class="text-xs text-ink-faint mb-3 space-y-0.5"
      data-testid="card-history-hint"
    >
      <p class="text-ink-muted">{{ t('workout.lastTime', { date: historyDateLabel }) }}</p>
      <p v-for="(line, i) in historyLines" :key="i" class="bk-metric">{{ line }}</p>
    </div>

    <!-- v0.3.2 CARDIO-COUNTDOWN PERSISTENCE — superficie de RESUME: se
         reutiliza CardioCountdown.vue directo aquí en el CUERPO de la
         tarjeta, no dentro del cajón/SetForm. Reabrir vía el cajón habría
         significado enseñarle a SetForm un modo "arrancar ya activo con un
         endsAt sembrado", metiéndose más hondo en un archivo fuera del
         alcance de este lane; además el cajón representa "estoy rellenando
         una serie nueva ahora", mientras que un countdown resucitado es un
         proceso de fondo que debería verse aunque el usuario no haya tocado
         nada todavía — visible de inmediato en la tarjeta es mejor UX que
         escondido tras un toque en "+ Cardio". -->
    <Transition name="bk-timer-swap">
      <div v-if="resumedActive" class="mb-3" :data-testid="`resumed-cardio-countdown-${workoutExercise.id}`">
        <CardioCountdown
          :target-seconds="resumedActive.targetSeconds"
          :ends-at="resumedActive.endsAt"
          @done="onResumedDone"
          @cancel="onResumedCancel"
        />
      </div>
    </Transition>

    <!-- v0.10.0 (zurdi: "no inline controls y formulario"): el formulario
         inline permanente de la v0.9.4 muere — la card de cardio son las
         últimas 4 veces + DOS acciones: registrar el tiempo hecho (cajón) o
         empezar el countdown con el objetivo por defecto (auto-registra al
         llegar a 0, reutilizando la superficie de resume de arriba). -->
    <div
      v-if="isCardio && recentCardio.length"
      class="mb-3 space-y-0.5"
      :data-testid="`cardio-recent-${workoutExercise.id}`"
    >
      <p
        v-for="(entry, i) in recentCardio"
        :key="i"
        class="bk-metric text-xs text-ink-faint"
      >
        {{ formatCardioEntry(entry) }}
      </p>
    </div>
    <!-- facelift: el pie queda para el trabajo del banco — añadir serie
         extra (superar el objetivo) o las dos acciones de cardio (v0.10.0
         "no inline controls y formulario"); quitar el ejercicio vive en el
         kebab (acción de gestión, no de banco) -->
    <div class="mt-3 flex items-center gap-2">
      <BkButton
        v-if="exercise && !isCardio"
        variant="ghost"
        size="sm"
        :data-testid="`add-set-${workoutExercise.id}`"
        @click="openNew"
      >
        {{ t('workout.addSet') }}
      </BkButton>
      <!-- v0.23.0 (zurdi): las dos acciones ocupan TODA la fila a partes
           iguales (grid de 2 columnas; en el editor retro, sin "Empezar",
           registrar toma la fila entera) -->
      <div
        v-else-if="isCardio && exercise && !resumedActive && historyLoaded"
        class="grid gap-2 flex-1 min-w-0"
        :class="live ? 'grid-cols-2' : 'grid-cols-1'"
        :data-testid="`cardio-actions-${workoutExercise.id}`"
      >
        <BkButton
          variant="ghost"
          size="sm"
          block
          :data-testid="`cardio-log-${workoutExercise.id}`"
          @click="openNew"
        >
          {{ t('workout.cardioLog') }}
        </BkButton>
        <BkButton
          v-if="live"
          variant="primary"
          size="sm"
          block
          :data-testid="`cardio-start-${workoutExercise.id}`"
          @click="cardioStartOpen = true"
        >
          {{ t('workout.cardioStart', { duration: formatDuration(cardioTargetSeconds) }) }}
        </BkButton>
      </div>
    </div>

    <!-- v0.11.5 (zurdi): el "cuánto tiempo" que faltaba antes del countdown —
         solo se monta en cardio, y parte del mismo objetivo que anuncia el
         botón "Empezar" -->
    <CardioStartSheet
      v-if="isCardio"
      :open="cardioStartOpen"
      :target-seconds="cardioTargetSeconds"
      @close="cardioStartOpen = false"
      @start="startCardio"
    />

    <!-- facelift: sheet kebab del ejercicio — la gestión que antes se apilaba
         en el cuerpo de la card (reordenar, descanso con presets+stepper,
         bloque, quitar), con los mismos testids/aria de siempre -->
    <BkSheet :open="menuOpen" :title="t('workout.exerciseMenu')" @close="menuOpen = false">
      <div class="space-y-4" :data-testid="`exercise-menu-sheet-${workoutExercise.id}`">
        <!-- reordenar: mismos move-up/move-down, ahora como filas del sheet -->
        <div v-if="!isFirst || !isLast" class="flex gap-2">
          <BkButton
            v-if="!isFirst"
            variant="ghost"
            class="flex-1"
            :data-testid="`move-up-${workoutExercise.id}`"
            :aria-label="t('workout.moveUp')"
            @click="moveUp"
          >
            ↑ {{ t('workout.moveUp') }}
          </BkButton>
          <BkButton
            v-if="!isLast"
            variant="ghost"
            class="flex-1"
            :data-testid="`move-down-${workoutExercise.id}`"
            :aria-label="t('workout.moveDown')"
            @click="moveDown"
          >
            ↓ {{ t('workout.moveDown') }}
          </BkButton>
        </div>

        <!-- v0.9.1: el control de descanso solo en quien cierra la ronda
             (autoRestFires); v0.9.4: cardio no descansa. item 7 (v0.4.3):
             presets + stepper manual, mismo revelado de un nivel. -->
        <div v-if="restEnabled && autoRestFires && !isCardio">
          <button
            type="button"
            class="bk-press text-sm text-ink-muted underline decoration-dotted"
            :data-testid="`rest-toggle-${workoutExercise.id}`"
            :aria-expanded="restPickerOpen ? 'true' : 'false'"
            @click="restPickerOpen = !restPickerOpen"
          >
            {{ t('workout.restLabel', { seconds: effectiveRestSeconds }) }}
          </button>
          <div
            v-if="restPickerOpen"
            class="flex flex-wrap gap-1 mt-2"
            :data-testid="`rest-picker-${workoutExercise.id}`"
          >
            <button
              v-for="preset in REST_PRESETS"
              :key="preset"
              type="button"
              class="bk-press px-2 py-1 rounded-full border text-xs transition-colors"
              :class="preset === effectiveRestSeconds ? 'border-aurora text-aurora bg-aurora/10' : 'border-line text-ink-muted'"
              :aria-pressed="preset === effectiveRestSeconds ? 'true' : 'false'"
              :data-testid="`rest-preset-${workoutExercise.id}-${preset}`"
              @click="pickRest(preset)"
            >
              {{ preset }}s
            </button>
          </div>
          <div v-if="restPickerOpen" class="w-40 mt-2" :data-testid="`rest-manual-${workoutExercise.id}`">
            <BkStepper
              :model-value="effectiveRestSeconds"
              size="compact"
              :step="REST_STEP_SECONDS"
              :min="REST_MIN_SECONDS"
              :max="REST_MAX_SECONDS"
              suffix="s"
              @update:model-value="pickRestManual"
            />
          </div>
        </div>

        <!-- v0.18.1: picker de bloque (solo en vivo) — mismo idiom -->
        <div v-if="live && actions.setExerciseBlock">
          <button
            type="button"
            class="bk-press text-sm text-ink-muted underline decoration-dotted"
            :data-testid="`block-toggle-${workoutExercise.id}`"
            :aria-expanded="blockPickerOpen ? 'true' : 'false'"
            @click="blockPickerOpen = !blockPickerOpen"
          >
            {{ t('workout.blockLabel', { name: currentBlockName }) }}
          </button>
          <div
            v-if="blockPickerOpen"
            class="flex flex-wrap gap-1 mt-2"
            :data-testid="`block-picker-${workoutExercise.id}`"
          >
            <button
              v-if="workoutExercise.block_label != null"
              type="button"
              class="bk-press px-2 py-1 rounded-full border text-xs border-line text-ink-muted transition-colors"
              :data-testid="`block-pick-none-${workoutExercise.id}`"
              @click="pickBlock(null)"
            >
              {{ t('routines.blockNone') }}
            </button>
            <button
              v-for="label in blockLabels"
              :key="label"
              type="button"
              class="bk-press px-2 py-1 rounded-full border text-xs transition-colors"
              :class="label === workoutExercise.block_label ? 'border-aurora text-aurora bg-aurora/10' : 'border-line text-ink-muted'"
              :aria-pressed="label === workoutExercise.block_label ? 'true' : 'false'"
              :data-testid="`block-pick-${workoutExercise.id}-${label}`"
              @click="pickBlock(label)"
            >
              {{ label }}
            </button>
            <button
              type="button"
              class="bk-press px-2 py-1 rounded-full border border-line text-xs text-ink-muted transition-colors"
              :data-testid="`block-new-${workoutExercise.id}`"
              @click="requestNewBlock"
            >
              {{ t('routines.newBlockOption') }}
            </button>
          </div>
        </div>

        <!-- quitar el ejercicio: swap confirmar/cancelar de siempre (item 7);
             v0.11.5: sin series registradas quita directo, nada que proteger -->
        <Transition name="bk-pop-soft" mode="out-in">
          <BkButton
            v-if="!removeConfirming"
            key="remove"
            variant="danger"
            block
            :data-testid="`remove-exercise-${workoutExercise.id}`"
            :aria-label="t('workout.remove')"
            @click="onRemoveClick"
          >
            {{ t('workout.remove') }}
          </BkButton>
          <div v-else key="confirm" class="flex gap-2">
            <BkButton
              variant="danger"
              class="flex-1"
              :data-testid="`confirm-remove-exercise-${workoutExercise.id}`"
              @click="confirmRemove"
            >
              {{ t('common.confirm') }}
            </BkButton>
            <BkButton variant="ghost" class="flex-1" @click="removeConfirming = false">
              {{ t('common.cancel') }}
            </BkButton>
          </div>
        </Transition>
      </div>
    </BkSheet>

    <!-- v0.12.0: edición de la nota del ejercicio (sheets al FINAL del
         template, la regla de siempre) -->
    <BkSheet :open="noteSheetOpen" :title="t('workout.noteTitle')" @close="noteSheetOpen = false">
      <div class="space-y-3">
        <textarea
          v-model="noteDraft"
          rows="3"
          maxlength="500"
          class="bk-form-control w-full rounded-sm border border-line bg-stone px-3 py-2.5 text-ink text-sm placeholder:text-ink-faint focus:border-aurora"
          :placeholder="t('workout.notePlaceholder')"
          data-testid="note-input"
        />
        <BkButton variant="primary" block :loading="noteSaving" data-testid="note-save" @click="saveNote">
          {{ t('common.save') }}
        </BkButton>
      </div>
    </BkSheet>

    <BkSheet :open="drawerOpen" :title="name" @close="closeDrawer">
      <div v-if="exercise" class="space-y-3">
        <SetForm
          :measurement="exercise.measurement"
          :units="units"
          :initial-set="drawerDefaults"
          :editing="editingSet !== null"
          @submit="onDrawerSubmit"
        />
        <!-- item 4d: bloque multilínea en vez de una línea cramped — fecha en
             su propia línea, cada serie efectiva en la suya (Sn · reps × peso).
             Hay sitio vertical de sobra aquí (a diferencia del hint compacto
             de la tarjeta, que sigue siendo card-history-hint más abajo) -->
        <div v-if="historyLines.length" class="text-xs text-ink-faint space-y-0.5" data-testid="drawer-history-hint">
          <p class="text-ink-muted">{{ t('workout.lastTime', { date: historyDateLabel }) }}</p>
          <p v-for="(line, i) in historyLines" :key="i" class="bk-metric">{{ line }}</p>
        </div>
        <!-- facelift: borrar la serie vive en el PIE del cajón de edición —
             la fila de la card ya no lleva icono de borrar (una fila = un
             gesto); mismo swap de confirmación de siempre -->
        <div v-if="editingSet" class="border-t border-line pt-3">
          <Transition name="bk-pop-soft" mode="out-in">
            <BkButton
              v-if="deleteConfirming !== editingSet.id"
              key="delete"
              variant="danger"
              block
              :data-testid="`delete-set-${editingSet.id}`"
              :aria-label="t('workout.deleteSet')"
              @click="deleteConfirming = editingSet.id"
            >
              {{ t('workout.deleteSet') }}
            </BkButton>
            <div v-else key="confirm" class="flex gap-2">
              <BkButton
                variant="danger"
                class="flex-1"
                :data-testid="`confirm-delete-set-${editingSet.id}`"
                @click="onDeleteSet(editingSet.id)"
              >
                {{ t('common.confirm') }}
              </BkButton>
              <BkButton
                variant="ghost"
                class="flex-1"
                :data-testid="`cancel-delete-set-${editingSet.id}`"
                @click="deleteConfirming = null"
              >
                {{ t('common.cancel') }}
              </BkButton>
            </div>
          </Transition>
        </div>
      </div>
    </BkSheet>
  </BkCard>
</template>

<script setup lang="ts">
import { computed, nextTick, onActivated, onBeforeUnmount, onDeactivated, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute, useRouter } from 'vue-router'

import { ApiError } from '@/api/client'
import type { ExerciseOut, MuscleGroupOut, PersonalRecordOut, RoutineOut, WorkoutExerciseOut, WorkoutOut } from '@/api/domain'
import { getRotation, listExercises, listMuscleGroups, listRoutines } from '@/api/domain'
import { isValidRuneName, primaryRune } from '@/lib/runeResolve'
import { isLastOfSuperset, nextSupersetIndex, normalizeSupersets, supersetLabels } from '@/lib/supersets'
import BkActionBtn from '@/lib/BkActionBtn.vue'
import { parseUtc } from '@/utils/datetime'
import { toastApiError } from '@/utils/apiErrors'
import { useActiveWorkoutStore } from '@/stores/activeWorkout'
import { useAuthStore } from '@/stores/auth'
import { useToastStore } from '@/stores/toast'
import {
  clearPersistedCardioCountdown,
  getPersistedCardioCountdown,
  getRestAutoEnabled,
  setRestAutoEnabled,
  type PersistedCardioCountdown,
} from '@/utils/uiPrefs'
import AddExerciseSheet from '@/components/workout/AddExerciseSheet.vue'
import SupersetEditSheet from '@/components/workout/SupersetEditSheet.vue'
import { exerciseName } from '@/components/routines/exerciseName'
import type { WorkoutActions } from '@/components/workout/workoutActions'
import FinishSummary from '@/components/workout/FinishSummary.vue'
import NeonPulse from '@/components/workout/NeonPulse.vue'
import WorkoutExerciseCard from '@/components/workout/WorkoutExerciseCard.vue'
import BkCelebration from '@/components/celebration/BkCelebration.vue'
import BkButton from '@/lib/BkButton.vue'
import BkRune from '@/lib/BkRune.vue'
import BkSheet from '@/lib/BkSheet.vue'
import type { RuneName } from '@/lib/runes'

// v0.17.0 keep-alive: el include de <KeepAlive> en ShellView casa por ESTE
// nombre — explícito en vez de confiar en la inferencia por nombre de
// fichero, que un rename silencioso rompería sin error
defineOptions({ name: 'WorkoutView' })

const { t, locale } = useI18n()
const route = useRoute()
const router = useRouter()
const auth = useAuthStore()
const activeWorkout = useActiveWorkoutStore()
const toast = useToastStore()

// item 4 (post-0.3.0): opt-out de descanso automático, pref de cliente
// (localStorage, ver uiPrefs.ts) — WorkoutExerciseCard.restEnabled combina
// esta preferencia con la señal intrínseca de la vista (aquí siempre true:
// esto es el entreno EN VIVO; el editor retroactivo pasa false aparte y no
// pregunta esta preferencia)
const restAutoEnabled = ref(getRestAutoEnabled())

function toggleRestAuto() {
  restAutoEnabled.value = !restAutoEnabled.value
  setRestAutoEnabled(restAutoEnabled.value)
}

const routines = ref<RoutineOut[]>([])
const exercises = ref<ExerciseOut[]>([])
const muscleGroups = ref<MuscleGroupOut[]>([])
// gatea la lista de "empezar desde rutina" hasta que el catálogo carga: sin
// esto la lista aparece de golpe ~100ms después de montar, encima del botón
// de entreno libre — mismo patrón que TodayView. true también en error.
const catalogReady = ref(false)
const addSheetOpen = ref(false)
const discardConfirmOpen = ref(false)
const finishedWorkout = ref<WorkoutOut | null>(null)
// item 9: pulso aurora de feedback tras registrar una serie ordinaria
const neonPulse = ref(false)
const sessionRecords = ref<PersonalRecordOut[]>([])
const now = ref(Date.now())
let ticker: ReturnType<typeof setInterval> | null = null
// v0.3.2 CARDIO-COUNTDOWN PERSISTENCE: countdown detectado al montar como
// "todavía corriendo" (endsAt en el futuro) — se pasa a CADA
// WorkoutExerciseCard, y cada tarjeta filtra por su propio
// workoutExerciseId (ver ese componente); null si no había nada persistido
// o si lo que había ya se resolvió (mismatch limpiado, o ya expiró y se
// auto-logueó — ver checkPersistedCardioCountdown)
const resumedCardioCountdown = ref<PersistedCardioCountdown | null>(null)

const units = computed(() => ((auth.user?.units as 'kg' | 'lb') || 'kg'))
const exerciseMap = computed(() => new Map(exercises.value.map((e) => [e.id, e])))
const exerciseIds = computed(() => activeWorkout.workout?.exercises.map((e) => e.id) ?? [])

// v0.5.0 superseries: el agrupado se computa AQUÍ por contigüidad (la
// tarjeta no ve a sus hermanas) y baja resuelto como props — ver
// lib/supersets.ts para la semántica (runs contiguos, singles disueltos)
const supersetValues = computed(() =>
  (activeWorkout.workout?.exercises ?? []).map((e) => e.superset_group ?? null),
)
const supersetLabelByIndex = computed(() => supersetLabels(supersetValues.value))
const supersetLastByIndex = computed(() =>
  supersetValues.value.map((_, i) => isLastOfSuperset(supersetValues.value, i)),
)
// id del WorkoutExercise marcado como "siguiente" del grupo (chip pequeño)
// tras registrar una serie en el miembro anterior — ver onLogged
const supersetNextUpId = ref<number | null>(null)

// v0.7.0 (feedback de zurdi sobre el diseño): los miembros de una superserie
// se renderizan DENTRO de un contenedor con borde aurora y el chip
// "Superserie A" como cabecera del bloque (antes: acento y chip por card) —
// la lista se trocea en bloques contiguos para el template
type WorkoutBlock = {
  grouped: boolean
  label: string | null
  entries: { we: WorkoutExerciseOut; index: number }[]
}
const workoutBlocks = computed<WorkoutBlock[]>(() => {
  const exercises = activeWorkout.workout?.exercises ?? []
  const labels = supersetLabelByIndex.value
  const blocks: WorkoutBlock[] = []
  exercises.forEach((we, index) => {
    const label = labels[index]
    const last = blocks[blocks.length - 1]
    if (label !== null && last?.grouped && last.label === label) {
      last.entries.push({ we, index })
    } else {
      blocks.push({ grouped: label !== null, label, entries: [{ we, index }] })
    }
  })
  return blocks
})

// v0.8.0 (zurdi): las superseries se CREAN desde el sheet de añadir
// ejercicio (check → eliges dos). v0.9.1 (zurdi: "en vez de un icono que la
// deshaga, un botón de editar"): la cabecera del bloque abre el sheet de
// edición (SupersetEditSheet) — desde ahí se cambia cualquiera de los
// miembros o se deshace el grupo entero.
const editingBlock = ref<WorkoutBlock | null>(null)

// ── v0.17.0 STEPPER POR BLOQUES (zurdi: "la vista de entrenamiento está un
// poco densa — cada step del stepper es un bloque molaría") ────────────────
// Un "step" agrupa los contenedores de workoutBlocks por la ETIQUETA de
// bloque de su primera fila (block_label, definido en el editor de rutinas y
// copiado al entreno). Agrupación por etiqueta y NO por contigüidad a
// propósito: un alta ad-hoc aterriza al final de la lista del servidor, y
// agrupar por etiqueta la recoloca sola en su step. Los sin-bloque (null)
// forman el step "General".
type WorkoutStep = {
  label: string | null
  blocks: WorkoutBlock[]
}
const workoutSteps = computed<WorkoutStep[]>(() => {
  const steps: WorkoutStep[] = []
  const byLabel = new Map<string | null, WorkoutStep>()
  for (const block of workoutBlocks.value) {
    const label = block.entries[0].we.block_label ?? null
    let step = byLabel.get(label)
    if (!step) {
      step = { label, blocks: [] }
      byLabel.set(label, step)
      steps.push(step)
    }
    step.blocks.push(block)
  }
  return steps
})

// el stepper solo aparece con ≥2 steps y algún bloque REAL definido — un
// entreno sin bloques (todo null) se ve como siempre, en lista plana
const stepperActive = computed(
  () => workoutSteps.value.length > 1 && workoutSteps.value.some((s) => s.label !== null),
)

const currentStep = ref(0)
// clamp defensivo: quitar el último ejercicio de un bloque puede hacer
// desaparecer su step con el puntero encima
const currentStepSafe = computed(() =>
  Math.min(currentStep.value, Math.max(0, workoutSteps.value.length - 1)),
)

// cambiar de entreno (empezar otro, descartar y arrancar de cero) resetea el
// puntero — con keep-alive la vista sobrevive entre entrenos
watch(
  () => activeWorkout.workout?.id,
  () => {
    currentStep.value = 0
  },
)

const visibleBlocks = computed<WorkoutBlock[]>(() =>
  stepperActive.value ? workoutSteps.value[currentStepSafe.value]?.blocks ?? [] : workoutBlocks.value,
)

function stepTitle(step: WorkoutStep): string {
  return step.label ?? t('workout.blockGeneral')
}

// progreso del chip: ejercicios del step con al menos una serie efectiva
function stepProgress(step: WorkoutStep): string {
  const entries = step.blocks.flatMap((b) => b.entries)
  const done = entries.filter((e) => e.we.sets.some((s) => !s.is_warmup)).length
  return `${done}/${entries.length}`
}

// etiqueta del bloque visible: las altas hechas desde el stepper caen en él
const currentBlockLabel = computed<string | null>(() =>
  stepperActive.value ? workoutSteps.value[currentStepSafe.value]?.label ?? null : null,
)

// acciones que ve AddExerciseSheet: mismas del store, pero el alta lleva el
// bloque visible. Objeto explícito (no spread del store: esparcir un store
// de pinia congela el estado reactivo leído en ese instante).
const sheetActions = computed<WorkoutActions>(() => ({
  addExercise: (id: number) => activeWorkout.addExercise(id, currentBlockLabel.value),
  addSupersetPair: (a: number, b: number) => activeWorkout.addSupersetPair(a, b, currentBlockLabel.value),
  removeExercise: (weid: number) => activeWorkout.removeExercise(weid),
  reorder: (ids: number[]) => activeWorkout.reorder(ids),
  logSet: (weid: number, body: Parameters<WorkoutActions['logSet']>[1]) => activeWorkout.logSet(weid, body),
  updateSet: (weid: number, sid: number, body: Parameters<WorkoutActions['updateSet']>[2]) =>
    activeWorkout.updateSet(weid, sid, body),
  deleteSet: (weid: number, sid: number) => activeWorkout.deleteSet(weid, sid),
  exerciseHistory: (id: number) => activeWorkout.exerciseHistory(id),
  setExerciseRest: (weid: number, rest: number | null) => activeWorkout.setExerciseRest(weid, rest),
  exerciseNote: (id: number) => activeWorkout.exerciseNote(id),
  saveExerciseNote: (id: number, note: string) => activeWorkout.saveExerciseNote(id, note),
}))

const editingMembers = computed(() =>
  (editingBlock.value?.entries ?? []).map((entry) => {
    const exercise = exerciseMap.value.get(entry.we.exercise_id)
    return {
      weid: entry.we.id,
      name: exercise ? exerciseName(exercise, auth.user?.locale || 'es') : '',
      rune: primaryRune(exercise, muscleGroups.value) ?? null,
      hasSets: entry.we.sets.length > 0,
    }
  }),
)

async function dissolveBlock(block: WorkoutBlock) {
  const values = [...supersetValues.value]
  for (const entry of block.entries) values[entry.index] = null
  try {
    await activeWorkout.setSupersetGroups(normalizeSupersets(values))
  } catch (error) {
    toastApiError(error)
  }
}

async function swapMember(oldWeid: number, newExerciseId: number) {
  try {
    await activeWorkout.swapSupersetMember(oldWeid, newExerciseId)
  } catch (error) {
    toastApiError(error)
  }
}

// runa del ejercicio que acaba de batir el récord — 'pr' es el comodín cuando
// el catálogo no resuelve un grupo muscular primario (nunca dejar el prop sin runa)
const celebrationRune = computed<RuneName>(() => {
  const exercise = exerciseMap.value.get(activeWorkout.lastRecords[0]?.exercise_id)
  return primaryRune(exercise, muscleGroups.value) ?? 'pr'
})

// ticks cada segundo con setInterval, pero el cálculo parte siempre de started_at:
// si la pestaña estuvo dormida el número salta a lo correcto en el próximo tick
const elapsedLabel = computed(() => {
  if (!activeWorkout.workout?.started_at) return '0:00'
  const totalSeconds = Math.max(
    0,
    Math.floor((now.value - parseUtc(activeWorkout.workout.started_at).getTime()) / 1000),
  )
  const h = Math.floor(totalSeconds / 3600)
  const m = Math.floor((totalSeconds % 3600) / 60)
  const s = String(totalSeconds % 60).padStart(2, '0')
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${s}` : `${m}:${s}`
})

const dateLabel = computed(() => {
  if (!activeWorkout.workout) return ''
  return new Intl.DateTimeFormat(locale.value, { weekday: 'long', day: 'numeric', month: 'long' }).format(
    new Date(`${activeWorkout.workout.date}T00:00:00`),
  )
})

// item 4: grupos musculares derivados de los ejercicios del entreno — de
// solo lectura, el backend ya los recalcula en cada alta/baja de ejercicio
// (ver services/workouts.py::sync_derived_muscle_groups); ya no hay editor manual
const derivedMuscleGroups = computed(() =>
  muscleGroups.value.filter((g) => activeWorkout.workout?.muscle_tag_ids.includes(g.id)),
)

// v0.14.0: la rutina que toca según el plan rotatorio — chip en la lista de
// arranque. Petición aparte y tolerante a fallo: el chip es un hint, no
// puede bloquear el catálogo.
const rotationNextId = ref<number | null>(null)

async function loadCatalog() {
  // Promise.resolve().then(...): también captura un throw SÍNCRONO (p.ej. un
  // mock parcial de domain en tests sin getRotation) — el hint jamás tumba
  // el catálogo
  Promise.resolve()
    .then(() => getRotation())
    .then((rotation) => {
      rotationNextId.value =
        rotation.next_position !== null
          ? rotation.routines[rotation.next_position]?.id ?? null
          : null
    })
    .catch(() => {})
  try {
    const [routinesList, exercisesList, muscleGroupsList] = await Promise.all([
      listRoutines(),
      listExercises({}),
      listMuscleGroups(),
    ])
    routines.value = routinesList
    exercises.value = exercisesList
    muscleGroups.value = muscleGroupsList
  } catch (error) {
    toastApiError(error)
  } finally {
    catalogReady.value = true
  }
}

async function startFree() {
  try {
    await activeWorkout.start({})
  } catch (error) {
    toastApiError(error)
  }
}

async function startFromRoutine(routineId: number) {
  try {
    await activeWorkout.start({ routine_id: routineId })
  } catch (error) {
    toastApiError(error)
  }
}

async function onFinish() {
  try {
    finishedWorkout.value = await activeWorkout.finish()
    // v0.3.2 CARDIO-COUNTDOWN PERSISTENCE: para cuando esto se ejecuta, lo
    // que hubiera persistido ya pasó por checkPersistedCardioCountdown al
    // montar (mismatches se limpian ahí), así que si queda algo es
    // literalmente de este entreno — limpiar sin condicionar es seguro
    clearPersistedCardioCountdown()
  } catch (error) {
    toastApiError(error)
  }
}

function onRecorded(records: PersonalRecordOut[]) {
  sessionRecords.value.push(...records)
}

async function confirmDiscard() {
  discardConfirmOpen.value = false
  try {
    await activeWorkout.discard()
    clearPersistedCardioCountdown()
    router.push({ name: 'today' })
  } catch (error) {
    toastApiError(error)
  }
}

// v0.3.2 CARDIO-COUNTDOWN PERSISTENCE: h:mm:ss / m:ss, duplicado local a
// propósito — mismo criterio que WorkoutExerciseCard.vue/
// setHistoryFormat.ts, que ya tienen cada uno su propia copia en vez de un
// util compartido para una función de 5 líneas
function formatCardioDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = String(seconds % 60).padStart(2, '0')
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${s}` : `${m}:${s}`
}

// item 7 (v0.3.2 CARDIO-COUNTDOWN PERSISTENCE): única vez, al montar la
// vista EN VIVO (el editor retroactivo ni monta este componente) — decide
// qué hacer con un countdown que se dejó corriendo antes de que el sistema
// matara la pestaña.
async function checkPersistedCardioCountdown() {
  const persisted = getPersistedCardioCountdown()
  if (!persisted) return

  const workout = activeWorkout.workout
  const exerciseStillExists = workout?.exercises.some((we) => we.id === persisted.workoutExerciseId) ?? false
  if (!workout || workout.id !== persisted.workoutId || !exerciseStillExists) {
    // el entreno activo (si hay alguno) ya no es el mismo, o el ejercicio se
    // quitó mientras tanto: countdown huérfano, se limpia sin loguear nada —
    // nunca se registra a ciegas contra un entreno que no es literalmente el
    // que sigue activo aquí y ahora
    clearPersistedCardioCountdown()
    return
  }

  if (persisted.endsAt > Date.now()) {
    // sigue corriendo: se reabre (superficie compacta en la propia tarjeta,
    // ver WorkoutExerciseCard.vue) en el remaining correcto en vez de
    // perderlo y forzar a empezar de cero
    resumedCardioCountdown.value = persisted
    return
  }

  // terminó mientras la app no estaba: la promesa del item 7 — la carrera
  // contó aunque el sistema matara la pestaña. Se loguea con la duración
  // OBJETIVO completa: no hay forma de saber cuánto corrió de verdad tras el
  // cierre, y es exactamente eso lo que se promete
  try {
    const body: { duration_seconds: number; distance_m?: number } = { duration_seconds: persisted.targetSeconds }
    if (persisted.distanceM) body.distance_m = persisted.distanceM
    await activeWorkout.logSet(persisted.workoutExerciseId, body)
    toast.push('info', t('workout.cardio.loggedWhileAway', { duration: formatCardioDuration(persisted.targetSeconds) }))
  } catch (error) {
    // el backend SÍ permite loguear contra un entreno ya terminado (mismo
    // workout_id, solo ended_at relleno) — pero uno DESCARTADO ya no existe
    // y esto 404: si el mismatch de arriba no lo cazó (carrera entre
    // dispositivos/pestañas), no hay dónde loguear, así que se limpia en
    // silencio en vez de mostrar un error sobre un entreno que el usuario ya
    // ni ve. Cualquier OTRO error sí se avisa como siempre — esto no debe
    // esconder un fallo real (p.ej. de red) tras la máscara de "descartado"
    if (!(error instanceof ApiError && error.status === 404)) toastApiError(error)
  } finally {
    clearPersistedCardioCountdown()
  }
}

// runa de la rutina: mismo criterio de resolución que el calendario
// (isValidRuneName sobre el slug), null si no tiene o no mapea a una runa
// conocida — nunca se inventa una runa que no está en el catálogo
function routineRune(routine: RoutineOut): RuneName | null {
  return routine.rune && isValidRuneName(routine.rune) ? routine.rune : null
}

// misma etiqueta bilingüe que MuscleGroupManager: el nombre viene del catálogo,
// no de i18n, así que se elige por locale en vez de traducirse
function muscleTagLabel(group: MuscleGroupOut): string {
  return locale.value === 'en' ? group.name_en : group.name_es
}

// item 9: el pulso neón es para series ORDINARIAS — cuando la misma serie
// también dispara la celebración de PR (ember, ver BkCelebration arriba),
// esa celebración gana siempre y el pulso se salta
//
// fix M4 (revisión): un segundo logueo mientras el pulso anterior seguía
// animándose (neonPulse ya en `true`) no disparaba nada — v-if="show" con
// show ya en true no remonta el nodo, así que la animación no reinicia. Se
// fuerza un ciclo false→true real (NeonPulse solo se desmonta con `false`,
// respetando su propio contrato de "done" para cerrar el ciclo anterior)
async function triggerNeonPulse() {
  neonPulse.value = false
  await nextTick()
  neonPulse.value = true
}

function onLogged(index: number, hasNewRecords: boolean) {
  // v0.5.0 superseries: cada serie registrada re-evalúa el "siguiente" —
  // en un miembro no-último, se marca el siguiente del grupo (se encadena
  // sin descanso); en el último (la ronda se cierra y arranca el descanso)
  // o en un suelto, se limpia cualquier marca anterior
  const nextIdx =
    supersetLastByIndex.value[index] === false ? nextSupersetIndex(supersetValues.value, index) : null
  supersetNextUpId.value =
    nextIdx != null ? (activeWorkout.workout?.exercises[nextIdx]?.id ?? null) : null

  if (hasNewRecords) return
  triggerNeonPulse()
}

// la celebración solo sale del logueo en vivo (logSet rellena lastRecords);
// al cerrarse, limpiamos para que no reaparezca en el siguiente render
function onCelebrationDone() {
  activeWorkout.lastRecords = []
}

function closeSummary() {
  finishedWorkout.value = null
  sessionRecords.value = []
  router.push({ name: 'today' })
}

function startTicker() {
  if (ticker) return
  ticker = setInterval(() => {
    now.value = Date.now()
  }, 1000)
}

function stopTicker() {
  if (ticker) clearInterval(ticker)
  ticker = null
}

// arranque desde ?session= (calendario → "Empezar"): compartido entre el
// montaje inicial y las re-activaciones del keep-alive — el query param
// puede llegar en cualquiera de los dos caminos
async function maybeStartFromSession() {
  if (activeWorkout.workout) return
  const sessionParam = route.query.session
  if (!sessionParam) return
  try {
    await activeWorkout.start({ scheduled_session_id: Number(sessionParam) })
  } catch (error) {
    toastApiError(error)
  }
}

onMounted(async () => {
  await loadCatalog()
  try {
    await activeWorkout.resume()
  } catch (error) {
    toastApiError(error)
  }
  await maybeStartFromSession()
  // v0.3.2 CARDIO-COUNTDOWN PERSISTENCE: después de que activeWorkout.workout
  // ya refleje su estado final para este montaje (resume, y el auto-start
  // desde ?session si aplicaba) — antes de esto, un countdown "todavía
  // corriendo" no tendría con qué workout compararse
  await checkPersistedCardioCountdown()
  startTicker()
})

// v0.17.0 keep-alive (zurdi: "no desmontar el entrenamiento"): la vista
// sobrevive a la navegación, así que volver NO pasa por onMounted — el DOM
// retenido pinta al instante y ESTE hook refresca en fondo sin bloquear
// nada. onActivated también dispara tras el primer onMounted; ese primer
// disparo se salta (el montaje ya hizo todo el trabajo).
let activatedOnce = false
onActivated(() => {
  if (!activatedOnce) {
    activatedOnce = true
    return
  }
  // catálogo/rotación en fondo: una rutina editada mientras tanto se refleja
  // sin costar nada al pintado instantáneo (loadCatalog solo reemplaza refs)
  void loadCatalog()
  void (async () => {
    try {
      // con entreno vivo basta el GET ligero (refresh no limpia el cache de
      // historial); sin él, resume() re-deriva el estado (activo del
      // servidor, snapshot offline o nada)
      if (activeWorkout.workout) await activeWorkout.refresh()
      else await activeWorkout.resume()
    } catch {
      // refresco de fondo: el estado retenido sigue siendo válido — nunca un
      // toast por volver a la pestaña
    }
    await maybeStartFromSession()
    await checkPersistedCardioCountdown()
  })()
  startTicker()
})

// pausar el crono de re-render mientras la vista vive oculta bajo el
// keep-alive: el elapsed se recalcula desde started_at al volver, así que
// no se pierde nada por no tickear en fondo
onDeactivated(stopTicker)

onBeforeUnmount(stopTicker)

// v0.5.0 (modelo de scroll único, ver ShellView.vue): las tres ramas del
// v-if/else-if/else (FinishSummary / entreno en curso / idle) FLUYEN contra
// <main> — BkCelebration/NeonPulse son <Teleport to="body"> y no ocupan
// flujo. El header del entreno (crono+fecha) es sticky: el cronómetro sigue
// visible mientras se scrollea la lista de ejercicios (mismo criterio que
// las tiras de tabs — es EL chrome de esta vista). El slab del header vive
// dentro de un wrapper sticky con bk-chrome-bg (void + grano, ver base.css) y -mt-4 pt-4 (cubre la banda del
// pt-4 del wrapper del shell al pegarse, ver CalendarView). El wrapper es
// hijo directo de bk-stagger: su entrada anima transform, pero el fill es
// backwards — al terminar, el transform computa a none y el sticky funciona
// (verificado en Chromium; si algún día una animación retiene transform,
// el sticky de dentro muere con ella — no cambiar el fill alegremente).
</script>

<template>
  <div>
    <BkCelebration
      v-if="activeWorkout.lastRecords.length"
      :records="activeWorkout.lastRecords"
      :rune-name="celebrationRune"
      :units="units"
      @done="onCelebrationDone"
    />

    <NeonPulse :show="neonPulse" @done="neonPulse = false" />

    <FinishSummary
      v-if="finishedWorkout"
      :workout="finishedWorkout"
      :records="sessionRecords"
      @close="closeSummary"
    />

    <div v-else-if="activeWorkout.workout" class="space-y-4 bk-stagger">
      <!-- item 3 (ola de pulido v0.3.0): la fecha pasa a la MISMA fila que el
           cronómetro, a su derecha (antes iba apilada arriba) — flex-wrap se
           conserva como red de seguridad: una fecha larga (locale EN con
           weekday+month largos) más el cronómetro en formato h:mm:ss podría
           no caber en los ~328px de contenido de un viewport de 360px, y
           aquí es preferible que la fecha baje a su propia línea a que se
           corte o se solape con el cronómetro.
           v0.5.0: wrapper sticky alrededor del slab — ver el comentario del
           script (crono visible mientras se scrollea la lista). -->
      <div
        class="sticky top-0 z-10 bk-chrome-bg -mt-4 -mx-4 px-4 pt-4 pb-1"
        data-testid="workout-header-sticky"
        :style="{ '--bk-stagger-i': 0 }"
      >
        <div class="bk-slab p-4 space-y-3" data-testid="workout-header">
          <div class="flex flex-wrap items-center justify-between gap-3">
            <p class="bk-metric text-2xl text-ink" data-testid="elapsed">{{ elapsedLabel }}</p>
            <!-- item 6 (v0.4.3, zurdi): el chip "M:SS ✕" que vivía AQUÍ se retira
                 — cancelar el descanso se mueve DENTRO del propio CTA del shell
                 (tocar el CTA mientras se descansa en /workout lo expande y
                 revela el botón ✕, ver ShellView.vue). El countdown en sí (el
                 timer.label del header/nav) ya era visible desde ahí; este chip
                 era la única superficie de CANCELAR fuera del CTA, y con el CTA
                 ya haciendo de tap-target siempre visible, mantenerla aquí
                 además duplicaba la acción en dos sitios. -->
            <p class="text-sm text-ink-muted capitalize" data-testid="workout-date">{{ dateLabel }}</p>
          </div>
          <!-- v0.9.4 (zurdi): los grupos musculares derivados suben del slab
               propio que tenían más abajo a ESTE header, bajo el cronómetro —
               chips más compactos que los de antes (esto es chrome sticky, no
               una card de contenido), sin el título "Grupos musculares": los
               nombres se explican solos.
               v0.9.5 (zurdi: "el check de descanso automático debería estar
               en el header, quizá debajo de la fecha"): el toggle (item 4
               post-0.3.0, mismo idiom que el de calentamiento de SetForm;
               item 5 v0.4.3: autodescriptivo, sin etiqueta al lado) comparte
               esta segunda fila con los chips — ml-auto lo pinna a la
               derecha, bajo la fecha, haya chips o no. -->
          <div class="flex flex-wrap items-center gap-3">
            <div
              v-if="derivedMuscleGroups.length"
              class="flex flex-wrap gap-1.5"
              data-testid="workout-header-muscle-tags"
            >
              <span
                v-for="group in derivedMuscleGroups"
                :key="group.id"
                :data-testid="`muscle-tag-${group.id}`"
                class="px-2 py-0.5 rounded-sm border border-line text-xs text-ink-muted"
              >
                {{ muscleTagLabel(group) }}
              </span>
            </div>
            <button
              type="button"
              data-testid="rest-auto-toggle"
              class="bk-press ml-auto px-3 py-1.5 rounded-sm border text-sm shrink-0"
              :class="restAutoEnabled ? 'border-aurora text-aurora bg-aurora/10' : 'border-line text-ink-muted'"
              :aria-pressed="restAutoEnabled ? 'true' : 'false'"
              :aria-label="t('timer.autoRest')"
              @click="toggleRestAuto"
            >
              {{ t('timer.autoRest') }}
            </button>
          </div>
        </div>
      </div>

      <!-- v0.17.0 STEPPER POR BLOQUES (zurdi: "cada step del stepper es un
           bloque molaría"): con bloques definidos en la rutina, la lista se
           trocea en steps — chips navegables arriba y SOLO el bloque visible
           renderizado (menos densidad); sin bloques, lista plana de siempre -->
      <div
        v-if="stepperActive"
        class="flex gap-1.5 overflow-x-auto"
        data-testid="block-stepper"
        :style="{ '--bk-stagger-i': 1 }"
      >
        <button
          v-for="(step, si) in workoutSteps"
          :key="step.label ?? '__general__'"
          type="button"
          class="bk-press px-3 py-1.5 rounded-sm border text-xs shrink-0 flex items-center gap-1.5"
          :class="si === currentStepSafe ? 'border-aurora text-aurora bg-aurora/10' : 'border-line text-ink-muted'"
          :aria-pressed="si === currentStepSafe ? 'true' : 'false'"
          :data-testid="`block-step-${si}`"
          @click="currentStep = si"
        >
          <span>{{ stepTitle(step) }}</span>
          <span class="bk-metric text-2xs opacity-80">{{ stepProgress(step) }}</span>
        </button>
      </div>

      <!-- v0.8.0: bloques de superserie — los miembros van DENTRO de un
           contenedor con borde aurora ("los dos ejercicios en una card más
           grande me gusta, déjalo así" — zurdi), con el chip de cabecera y
           el ÚNICO control de gestión: editar (v0.9.1 — abre el sheet donde
           se cambia un miembro o se deshace el grupo; el icono directo de
           deshacer de la v0.8.0 se sustituye por esto). Las superseries se
           crean desde el sheet de añadir ejercicio. -->
      <!-- v0.11.7 (zurdi: "mete animaciones a lo que se borra"): los bloques
           viven en un TransitionGroup bk-remove — quitar un ejercicio difumina
           su card mientras las demás cierran el hueco (-move). El contenedor
           relative es el ancla del position:absolute de la que sale; las keys
           van en AMBAS ramas (mismo valor) porque TransitionGroup necesita
           hijos-elemento keyados, no fragments de template -->
      <!-- v0.17.0: :key del contenedor por step — cambiar de step REMONTA la
           lista entera de golpe (sin animaciones bk-remove de salida, que
           leerían como borrados) y el bk-stagger del padre re-anima la
           entrada del bloque nuevo -->
      <div :key="`step-${currentBlockLabel ?? '__all__'}`" class="relative space-y-4">
      <TransitionGroup name="bk-remove">
      <template v-for="(block, vi) in visibleBlocks">
        <div
          v-if="block.grouped"
          :key="`block-${block.entries[0].we.id}`"
          class="border border-aurora/50 rounded-sm p-2 space-y-3"
          :data-testid="`superset-container-${block.label}`"
          :style="{ '--bk-stagger-i': vi + 2 }"
        >
          <div class="flex items-center justify-center gap-2">
            <span class="text-xs text-aurora border border-aurora/40 rounded-sm px-1.5 py-0.5">
              {{ t('workout.superset', { label: block.label }) }}
            </span>
            <BkActionBtn
              icon="edit"
              :data-testid="`superset-edit-${block.label}`"
              :aria-label="t('workout.supersetEdit')"
              @click="editingBlock = block"
            />
          </div>
          <template v-for="entry in block.entries" :key="entry.we.id">
            <WorkoutExerciseCard
              :workout-exercise="entry.we"
              :exercise="exerciseMap.get(entry.we.exercise_id)"
              :muscle-groups="muscleGroups"
              :routines="routines"
              :routine-id="activeWorkout.workout.routine_id"
              :exercise-ids="exerciseIds"
              :units="units"
              :locale="locale"
              :actions="activeWorkout"
              :rest-enabled="restAutoEnabled"
              :workout-id="activeWorkout.workout.id"
              :resumed-countdown="resumedCardioCountdown"
              :superset-label="supersetLabelByIndex[entry.index]"
              :superset-last="supersetLastByIndex[entry.index]"
              :superset-next="entry.we.id === supersetNextUpId"
              @recorded="onRecorded"
              @logged="onLogged(entry.index, $event)"
            />
          </template>
        </div>
        <WorkoutExerciseCard
          v-else
          :key="`block-${block.entries[0].we.id}`"
          :style="{ '--bk-stagger-i': vi + 2 }"
          :workout-exercise="block.entries[0].we"
          :exercise="exerciseMap.get(block.entries[0].we.exercise_id)"
          :muscle-groups="muscleGroups"
          :routines="routines"
          :routine-id="activeWorkout.workout.routine_id"
          :exercise-ids="exerciseIds"
          :units="units"
          :locale="locale"
          :actions="activeWorkout"
          :rest-enabled="restAutoEnabled"
          :workout-id="activeWorkout.workout.id"
          :resumed-countdown="resumedCardioCountdown"
          :superset-label="null"
          :superset-last="true"
          :superset-next="false"
          @recorded="onRecorded"
          @logged="onLogged(block.entries[0].index, $event)"
        />
      </template>
      </TransitionGroup>
      </div>

      <!-- v0.17.0: navegación anterior/siguiente entre bloques, bajo la
           lista del step visible — complementa los chips de arriba para el
           flujo natural de "terminé este bloque, al siguiente" -->
      <div
        v-if="stepperActive"
        class="flex items-center justify-between gap-2"
        data-testid="block-nav"
        :style="{ '--bk-stagger-i': visibleBlocks.length + 2 }"
      >
        <BkButton
          v-if="currentStepSafe > 0"
          variant="ghost"
          size="sm"
          data-testid="block-prev"
          @click="currentStep = currentStepSafe - 1"
        >
          ‹ {{ stepTitle(workoutSteps[currentStepSafe - 1]) }}
        </BkButton>
        <span v-else />
        <BkButton
          v-if="currentStepSafe < workoutSteps.length - 1"
          variant="ghost"
          size="sm"
          data-testid="block-next"
          @click="currentStep = currentStepSafe + 1"
        >
          {{ stepTitle(workoutSteps[currentStepSafe + 1]) }} ›
        </BkButton>
        <span v-else />
      </div>

      <BkButton
        variant="ghost"
        block
        :style="{ '--bk-stagger-i': visibleBlocks.length + 3 }"
        @click="addSheetOpen = true"
      >
        {{ t('workout.addExercise') }}
      </BkButton>

      <AddExerciseSheet :open="addSheetOpen" :actions="sheetActions" @close="addSheetOpen = false" />

      <SupersetEditSheet
        :open="editingBlock !== null"
        :label="editingBlock?.label ?? null"
        :members="editingMembers"
        @close="editingBlock = null"
        @dissolve="editingBlock && dissolveBlock(editingBlock)"
        @swap="swapMember"
      />

      <!-- item 3: Descartar/Terminar salen de la cabecera y bajan al fondo
           del contenido, tras una línea divisoria — ya no compiten por
           espacio con la fecha/cronómetro, y quedan lejos del pulgar en el
           flujo normal de "añadir ejercicio, registrar series", donde una
           acción destructiva junto al cronómetro invitaba al toque accidental -->
      <div
        class="border-t border-line pt-4 flex flex-wrap items-center gap-2"
        data-testid="workout-actions"
        :style="{ '--bk-stagger-i': visibleBlocks.length + 4 }"
      >
        <BkButton
          variant="danger"
          data-testid="discard-workout"
          @click="discardConfirmOpen = true"
        >
          {{ t('workout.discard') }}
        </BkButton>
        <BkButton variant="primary" @click="onFinish">{{ t('workout.finish') }}</BkButton>
      </div>

      <BkSheet
        :open="discardConfirmOpen"
        :title="t('workout.discardTitle')"
        @close="discardConfirmOpen = false"
      >
        <div class="space-y-4 p-4" data-testid="discard-confirm-sheet">
          <p>{{ t('workout.discardHint') }}</p>
          <div class="flex gap-2">
            <BkButton
              variant="ghost"
              data-testid="discard-cancel-btn"
              @click="discardConfirmOpen = false"
            >
              {{ t('common.cancel') }}
            </BkButton>
            <BkButton
              variant="danger"
              data-testid="discard-confirm-btn"
              @click="confirmDiscard"
            >
              {{ t('workout.discard') }}
            </BkButton>
          </div>
        </div>
      </BkSheet>
    </div>

    <!-- item 4: sin bk-stagger propio, esta rama entraba desnuda (nunca tuvo
         entrada propia — dependía del ahora-eliminado Transition de ShellView) -->
    <div v-else class="space-y-4 bk-stagger">
      <BkButton variant="primary" block data-testid="start-free" :style="{ '--bk-stagger-i': 0 }" @click="startFree">
        {{ t('workout.freeWorkout') }}
      </BkButton>

      <div v-if="catalogReady && routines.length" class="space-y-2" :style="{ '--bk-stagger-i': 1 }">
        <!-- separador "o" entre el CTA de entreno libre y la lista de
             rutinas, en vez del párrafo plano que había antes -->
        <div class="flex items-center gap-3" aria-hidden="true">
          <span class="h-px flex-1 bg-line" />
          <span data-testid="or-separator" class="text-ink-faint text-sm">{{ t('workout.or') }}</span>
          <span class="h-px flex-1 bg-line" />
        </div>
        <BkButton
          v-for="routine in routines"
          :key="routine.id"
          variant="ghost"
          block
          :data-testid="`start-routine-${routine.id}`"
          @click="startFromRoutine(routine.id)"
        >
          <BkRune v-if="routineRune(routine)" :name="routineRune(routine) as RuneName" :size="16" />
          <span>{{ routine.name }}</span>
          <!-- v0.14.0: chip del plan rotatorio en la rutina que toca -->
          <span
            v-if="routine.id === rotationNextId"
            class="text-2xs text-aurora border border-aurora/50 bg-aurora/10 rounded-sm px-1.5 py-0.5"
            :data-testid="`rotation-chip-${routine.id}`"
          >{{ t('rotation.chip') }}</span>
        </BkButton>
      </div>
    </div>
  </div>
</template>

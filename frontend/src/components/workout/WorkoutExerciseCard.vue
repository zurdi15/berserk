<script setup lang="ts">
import { computed, ref, watch } from 'vue'
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
import {
  clearPersistedCardioCountdown,
  getPersistedCardioCountdown,
  setPersistedCardioCountdown,
  type PersistedCardioCountdown,
} from '@/utils/uiPrefs'
import { formatWeight } from '@/utils/units'
import BkActionBtn from '@/lib/BkActionBtn.vue'
import BkButton from '@/lib/BkButton.vue'
import BkCard from '@/lib/BkCard.vue'
import BkRune from '@/lib/BkRune.vue'
import BkSheet from '@/lib/BkSheet.vue'
import BkStepper from '@/lib/BkStepper.vue'
import type { RuneName } from '@/lib/runes'
import CardioCountdown from './CardioCountdown.vue'
import { REST_MAX_SECONDS, REST_MIN_SECONDS, REST_PRESETS, REST_STEP_SECONDS, restFor } from './rest'
import { resolveNewSetDefaults } from './setDefaults'
import { formatHistoryLine, formatHistorySetLines } from './setHistoryFormat'
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
    // sentido — ver SetForm's `live` prop)
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
    // no se persiste nada (ver onCountdownStart).
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
  },
)

const emit = defineEmits<{
  recorded: [records: PersonalRecordOut[]]
  // item 9: cada serie NUEVA logueada con éxito, sea o no récord — el padre
  // decide si dispara el pulso neón (se salta cuando gana la celebración de PR)
  logged: [hasNewRecords: boolean]
}>()

const { t } = useI18n()
const restTimer = useRestTimerStore()

const removeConfirming = ref(false)
const deleteConfirming = ref<number | null>(null)
const drawerOpen = ref(false)
const editingSet = ref<SetOut | null>(null)
const restPickerOpen = ref(false)
const history = ref<ExerciseHistoryOut | null>(null)

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

// runa del grupo muscular primario del ejercicio, si el catálogo lo resuelve
const primaryRune = computed<RuneName | null>(() => resolvePrimaryRune(props.exercise, props.muscleGroups))

const index = computed(() => props.exerciseIds.indexOf(props.workoutExercise.id))
const isFirst = computed(() => index.value <= 0)
const isLast = computed(() => index.value === -1 || index.value === props.exerciseIds.length - 1)

// item 6: los ejercicios de cardio se leen como un bloque distinto (sin
// numerar, con acento de borde) en vez de series numeradas de fuerza
const isCardio = computed(() => props.exercise?.measurement === 'cardio')

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

const historyLine = computed(() => {
  if (!props.exercise || !history.value?.sets.length) return ''
  return formatHistoryLine(history.value.sets, props.exercise.measurement, props.units)
})

// item 4d: bloque multilínea para el cajón (hay sitio vertical de sobra
// ahí) — distinto de historyLine, que sigue siendo la línea densa para el
// hint compacto de la tarjeta (card-history-hint, sin sitio de sobra)
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

// item 2: prioridad de defaults para una serie NUEVA; en edición, los
// valores EXACTOS de la serie que se corrige (ver setDefaults.ts)
const drawerDefaults = computed(() => {
  if (editingSet.value) return editingSet.value
  return resolveNewSetDefaults(
    props.workoutExercise.sets,
    history.value?.sets,
    props.routineId,
    props.routines,
    props.workoutExercise.exercise_id,
  )
})

function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = String(seconds % 60).padStart(2, '0')
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${s}` : `${m}:${s}`
}

function formatSetValue(set: SetOut): string {
  const measurement = props.exercise?.measurement
  if (measurement === 'strength' || (measurement === 'bodyweight' && set.weight_kg)) {
    return `${set.reps} × ${formatWeight(set.weight_kg ?? 0, props.units)}`
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
      restTimer.start(effectiveRestSeconds.value, name.value)
    }
    if (result.new_records.length) emit('recorded', result.new_records)
    emit('logged', result.new_records.length > 0)
    if (!keepOpen) closeDrawer()
  } catch (error) {
    toastApiError(error)
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

// SetForm emite esto al pulsar "Empezar" (ver SetForm.vue) — SetForm conoce
// duration_seconds/distance_m en ese instante, esta tarjeta conoce
// workoutId/workoutExerciseId: entre los dos arman el registro persistido
function onCountdownStart(payload: { targetSeconds: number; distanceM?: number }) {
  if (props.workoutId == null) return
  setPersistedCardioCountdown({
    endsAt: Date.now() + Math.max(0, payload.targetSeconds) * 1000,
    workoutId: props.workoutId,
    workoutExerciseId: props.workoutExercise.id,
    targetSeconds: payload.targetSeconds,
    distanceM: payload.distanceM,
  })
}

function onCountdownCancel() {
  clearPersistedCardioCountdownForThisExercise()
}

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

async function onDeleteSet(setId: number) {
  deleteConfirming.value = null
  try {
    await props.actions.deleteSet(props.workoutExercise.id, setId)
  } catch (error) {
    toastApiError(error)
  }
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

async function confirmRemove() {
  removeConfirming.value = false
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
  <BkCard :class="isCardio && 'border-l-2 border-aurora/50 pl-3'">
    <!-- v0.7.0 (feedback de zurdi): el chip "Superserie A" y el acento del
         grupo suben al CONTENEDOR del bloque (ver WorkoutView.vue) — la card
         ya no pinta nada de superserie salvo el chip "Siguiente"; el acento
         lateral queda solo para cardio. supersetLabel se conserva como prop
         porque sigue gobernando el gating del auto-descanso (autoRestFires). -->
    <div class="flex items-center justify-between mb-2">
      <div class="flex items-center gap-2 min-w-0">
        <BkRune v-if="primaryRune" :name="primaryRune" :size="14" />
        <h3 class="font-display font-semibold text-ink truncate">{{ name }}</h3>
        <span
          v-if="supersetNext"
          :data-testid="`superset-next-${workoutExercise.id}`"
          class="text-xs text-aurora bg-aurora/15 border border-aurora rounded-sm px-1.5 py-0.5 shrink-0"
        >
          {{ t('workout.supersetNext') }}
        </span>
        <span
          v-if="effectiveSetCount"
          class="bk-metric text-xs text-ink-faint shrink-0"
          :data-testid="`set-count-${workoutExercise.id}`"
        >
          · {{ effectiveSetCount }}
        </span>
      </div>
      <div class="flex items-center gap-1 shrink-0">
        <button
          v-if="!isFirst"
          type="button"
          :data-testid="`move-up-${workoutExercise.id}`"
          class="bk-press w-8 h-8 text-ink-muted hover:text-ink"
          :aria-label="t('workout.moveUp')"
          @click="moveUp"
        >
          ↑
        </button>
        <button
          v-if="!isLast"
          type="button"
          :data-testid="`move-down-${workoutExercise.id}`"
          class="bk-press w-8 h-8 text-ink-muted hover:text-ink"
          :aria-label="t('workout.moveDown')"
          @click="moveDown"
        >
          ↓
        </button>
      </div>
    </div>

    <!-- v0.9.1 (zurdi: "el descanso debería estar solo al final de la
         superserie — ahora aparece después de cada ejercicio"): el control
         de descanso entero se esconde en los miembros NO finales de un
         grupo — el descanso es un concepto de la RONDA, y la ronda la cierra
         el último miembro (autoRestFires, la misma condición que ya gateaba
         el disparo automático; ahora también gobierna la UI).
         v0.9.4 (zurdi): un bloque de cardio no tiene descanso — ni este
         control ni el disparo automático (ver onDrawerSubmit). -->
    <div v-if="restEnabled && autoRestFires && !isCardio" class="mb-2">
      <button
        type="button"
        class="bk-press text-xs text-ink-faint underline decoration-dotted"
        :data-testid="`rest-toggle-${workoutExercise.id}`"
        :aria-expanded="restPickerOpen ? 'true' : 'false'"
        @click="restPickerOpen = !restPickerOpen"
      >
        {{ t('workout.restLabel', { seconds: effectiveRestSeconds }) }}
      </button>
      <div
        v-if="restPickerOpen"
        class="flex flex-wrap gap-1 mt-1"
        :data-testid="`rest-picker-${workoutExercise.id}`"
      >
        <button
          v-for="preset in REST_PRESETS"
          :key="preset"
          type="button"
          class="bk-press px-2 py-1 rounded-sm border text-xs"
          :class="preset === effectiveRestSeconds ? 'border-aurora text-aurora bg-aurora/10' : 'border-line text-ink-muted'"
          :aria-pressed="preset === effectiveRestSeconds ? 'true' : 'false'"
          :data-testid="`rest-preset-${workoutExercise.id}-${preset}`"
          @click="pickRest(preset)"
        >
          {{ preset }}s
        </button>
      </div>
      <!-- item 7 (v0.4.3, zurdi): entrada manual además de los presets — un
           gimnasta puede querer 75s, no solo los saltos de 30 de los chips.
           Visible junto a los presets (no tras un chip "otro" aparte): ya
           está detrás del mismo toggle rest-toggle-*, un nivel de revelado
           es suficiente. w-36 (bounded, item 11): BkStepper es w-full por
           dentro, así que necesita un contenedor con ancho propio para no
           estirarse a todo el ancho de la tarjeta — un stepper de descanso
           no pide ese protagonismo. -->
      <div v-if="restPickerOpen" class="w-36 mt-2" :data-testid="`rest-manual-${workoutExercise.id}`">
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

    <div v-if="workoutExercise.sets.length" class="space-y-1 border-b border-line pb-3 mb-3">
      <div
        v-for="set in workoutExercise.sets"
        :key="set.id"
        :data-testid="`set-row-${set.id}`"
        class="flex items-center justify-between"
        :class="set.is_warmup && 'text-ink-faint'"
      >
        <span class="bk-metric text-sm">
          <template v-if="!isCardio">{{ set.set_number }}. </template>{{ formatSetValue(set) }}
          <span v-if="set.rpe" class="text-ink-faint"> · RPE {{ set.rpe }}</span>
        </span>

        <!-- item 7: el swap borrar↔confirmar/cancelar anima con el mismo
             idioma que el resto de swaps de la app (bk-pop-soft, out-in —
             ver ShellView.vue). :key en ambas ramas porque son del mismo
             tag (<div>): sin él, Vue las trataría como el mismo nodo
             parcheado in-place y la Transition nunca dispararía -->
        <Transition name="bk-pop-soft" mode="out-in">
          <div v-if="deleteConfirming !== set.id" key="actions" class="flex items-center gap-1 shrink-0">
            <BkActionBtn
              v-if="exercise"
              icon="edit"
              :data-testid="`edit-set-${set.id}`"
              :aria-label="t('common.edit')"
              @click="openEdit(set)"
            />
            <BkActionBtn
              icon="delete"
              :data-testid="`delete-set-${set.id}`"
              :aria-label="t('workout.deleteSet')"
              @click="deleteConfirming = set.id"
            />
          </div>
          <div v-else key="confirm" class="flex items-center gap-1 shrink-0">
            <button
              type="button"
              :data-testid="`confirm-delete-set-${set.id}`"
              class="text-danger text-xs px-2 py-1 border border-danger rounded-sm"
              @click="onDeleteSet(set.id)"
            >
              {{ t('common.confirm') }}
            </button>
            <button
              type="button"
              :data-testid="`cancel-delete-set-${set.id}`"
              class="text-ink-faint text-xs px-2 py-1"
              @click="deleteConfirming = null"
            >
              {{ t('common.cancel') }}
            </button>
          </div>
        </Transition>
      </div>
    </div>
    <p v-else-if="historyLine" class="text-xs text-ink-faint mb-3 truncate" data-testid="card-history-hint">
      {{ t('workout.lastTimeHint', { line: historyLine }) }}
    </p>

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

    <!-- v0.9.4 (zurdi: "en cardio no debería haber un 'añadir cardio'"): el
         formulario de cardio vive PERMANENTE en el cuerpo de la tarjeta —
         sin botón ni cajón de por medio (el cajón queda solo para editar una
         entrada ya registrada). Gateado por historyLoaded para que SetForm
         monte ya con los defaults correctos (ver el ref arriba); el countdown
         en marcha lo dibuja el propio SetForm aquí mismo, igual que la
         superficie de resume de arriba. -->
    <div
      v-if="isCardio && exercise && !resumedActive && historyLoaded"
      :data-testid="`cardio-inline-form-${workoutExercise.id}`"
    >
      <SetForm
        :measurement="exercise.measurement"
        :units="units"
        :initial-set="drawerDefaults"
        :live="live"
        inline
        @submit="onDrawerSubmit"
        @countdown-start="onCountdownStart"
        @countdown-cancel="onCountdownCancel"
      />
    </div>

    <!-- v0.9.4 (zurdi): añadir serie y quitar ejercicio comparten fila —
         quitar pasa de botón "Quitar" a BkActionBtn de eliminar (como el
         resto de sitios), a la derecha; su swap de confirmación (item 7,
         bk-pop-soft/out-in) queda tal cual -->
    <div class="mt-3 flex items-center justify-between gap-2">
      <BkButton
        v-if="exercise && !isCardio"
        variant="ghost"
        size="sm"
        :data-testid="`add-set-${workoutExercise.id}`"
        @click="openNew"
      >
        {{ t('workout.addSet') }}
      </BkButton>
      <span v-else />
      <Transition name="bk-pop-soft" mode="out-in">
        <div v-if="!removeConfirming" key="remove" class="shrink-0">
          <BkActionBtn
            icon="delete"
            :data-testid="`remove-exercise-${workoutExercise.id}`"
            :aria-label="t('workout.remove')"
            @click="removeConfirming = true"
          />
        </div>
        <div v-else key="confirm" class="flex gap-2 shrink-0">
          <BkButton
            variant="danger"
            size="sm"
            :data-testid="`confirm-remove-exercise-${workoutExercise.id}`"
            @click="confirmRemove"
          >
            {{ t('common.confirm') }}
          </BkButton>
          <BkButton variant="ghost" size="sm" @click="removeConfirming = false">
            {{ t('common.cancel') }}
          </BkButton>
        </div>
      </Transition>
    </div>

    <BkSheet :open="drawerOpen" :title="name" @close="closeDrawer">
      <div v-if="exercise" class="space-y-3">
        <SetForm
          :measurement="exercise.measurement"
          :units="units"
          :initial-set="drawerDefaults"
          :editing="editingSet !== null"
          :live="live"
          @submit="onDrawerSubmit"
          @countdown-start="onCountdownStart"
          @countdown-cancel="onCountdownCancel"
        />
        <!-- item 4d: bloque multilínea en vez de una línea cramped — fecha en
             su propia línea, cada serie efectiva en la suya (Sn · reps × peso).
             Hay sitio vertical de sobra aquí (a diferencia del hint compacto
             de la tarjeta, que sigue siendo card-history-hint más abajo) -->
        <div v-if="historyLines.length" class="text-xs text-ink-faint space-y-0.5" data-testid="drawer-history-hint">
          <p class="text-ink-muted">{{ t('workout.lastTime', { date: historyDateLabel }) }}</p>
          <p v-for="(line, i) in historyLines" :key="i" class="bk-metric">{{ line }}</p>
        </div>
      </div>
    </BkSheet>
  </BkCard>
</template>

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
import { formatWeight } from '@/utils/units'
import BkActionBtn from '@/lib/BkActionBtn.vue'
import BkButton from '@/lib/BkButton.vue'
import BkCard from '@/lib/BkCard.vue'
import BkRune from '@/lib/BkRune.vue'
import BkSheet from '@/lib/BkSheet.vue'
import type { RuneName } from '@/lib/runes'
import { REST_PRESETS, restFor } from './rest'
import { resolveNewSetDefaults } from './setDefaults'
import { formatHistoryLine } from './setHistoryFormat'
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
  }>(),
  {
    muscleGroups: () => [],
    routines: () => [],
    routineId: null,
    units: 'kg',
    locale: 'es',
    restEnabled: true,
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
    }
  },
  { immediate: true },
)

const historyLine = computed(() => {
  if (!props.exercise || !history.value?.sets.length) return ''
  return formatHistoryLine(history.value.sets, props.exercise.measurement, props.units)
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
    if (props.restEnabled) {
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
    <div class="flex items-center justify-between mb-2">
      <div class="flex items-center gap-2 min-w-0">
        <BkRune v-if="primaryRune" :name="primaryRune" :size="14" />
        <h3 class="font-display font-semibold text-ink truncate">{{ name }}</h3>
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

    <div v-if="restEnabled" class="mb-2">
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

        <div v-if="deleteConfirming !== set.id" class="flex items-center gap-1 shrink-0">
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
        <div v-else class="flex items-center gap-1 shrink-0">
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
      </div>
    </div>
    <p v-else-if="historyLine" class="text-xs text-ink-faint mb-3 truncate" data-testid="card-history-hint">
      {{ t('workout.lastTimeHint', { line: historyLine }) }}
    </p>

    <BkButton
      v-if="exercise"
      variant="ghost"
      size="sm"
      :data-testid="`add-set-${workoutExercise.id}`"
      @click="openNew"
    >
      {{ isCardio ? t('workout.addCardio') : t('workout.addSet') }}
    </BkButton>

    <div class="mt-3 pt-3 border-t border-line">
      <div v-if="!removeConfirming">
        <BkButton
          variant="ghost"
          size="sm"
          :data-testid="`remove-exercise-${workoutExercise.id}`"
          @click="removeConfirming = true"
        >
          {{ t('workout.remove') }}
        </BkButton>
      </div>
      <div v-else class="flex gap-2">
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
    </div>

    <BkSheet :open="drawerOpen" :title="name" @close="closeDrawer">
      <div v-if="exercise" class="space-y-3">
        <SetForm
          :measurement="exercise.measurement"
          :units="units"
          :initial-set="drawerDefaults"
          :editing="editingSet !== null"
          :live="restEnabled"
          @submit="onDrawerSubmit"
        />
        <p v-if="historyLine" class="text-xs text-ink-faint" data-testid="drawer-history-hint">
          {{ t('workout.lastTime', { date: historyDateLabel }) }}: {{ historyLine }}
        </p>
      </div>
    </BkSheet>
  </BkCard>
</template>

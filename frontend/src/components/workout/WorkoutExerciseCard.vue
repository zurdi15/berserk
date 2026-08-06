<script setup lang="ts">
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'

import type {
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
import BkButton from '@/lib/BkButton.vue'
import BkCard from '@/lib/BkCard.vue'
import BkRune from '@/lib/BkRune.vue'
import type { RuneName } from '@/lib/runes'
import { restFor } from './rest'
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
    // el descanso post-serie es un concepto de entreno EN VIVO: el editor
    // retroactivo no lo quiere (no hay nada de lo que "descansar")
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

const emit = defineEmits<{ recorded: [records: PersonalRecordOut[]] }>()

const { t } = useI18n()
const restTimer = useRestTimerStore()

const removeConfirming = ref(false)
const deleteConfirming = ref<number | null>(null)
const editingSetId = ref<number | null>(null)

const name = computed(() => exerciseName(props.exercise, props.locale))

// runa del grupo muscular primario del ejercicio, si el catálogo lo resuelve
const primaryRune = computed<RuneName | null>(() => resolvePrimaryRune(props.exercise, props.muscleGroups))

const index = computed(() => props.exerciseIds.indexOf(props.workoutExercise.id))
const isFirst = computed(() => index.value <= 0)
const isLast = computed(() => index.value === -1 || index.value === props.exerciseIds.length - 1)

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

// las 4 acciones de escritura de esta tarjeta comparten el mismo contrato: si
// el backend rechaza, un toast lo cuenta — nunca un fallo silencioso en consola
async function onSubmitSet(value: SetIn) {
  try {
    const result = await props.actions.logSet(props.workoutExercise.id, value)
    // el descanso depende de si el entreno viene de una rutina (su rest_seconds) o es libre (default)
    if (props.restEnabled) {
      const seconds = restFor(props.routineId, props.routines, props.workoutExercise.exercise_id)
      restTimer.start(seconds)
    }
    if (result.new_records.length) emit('recorded', result.new_records)
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

// el backend hace full-replace de la serie (PATCH .../sets/{id}): SetForm ya
// arma un SetIn completo para el tipo de medición (mismo buildValue que logSet),
// así que reutilizarlo aquí evita mandar un payload parcial por error
async function onUpdateSet(setId: number, value: SetIn) {
  editingSetId.value = null
  try {
    await props.actions.updateSet(props.workoutExercise.id, setId, value)
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
  <BkCard>
    <div class="flex items-center justify-between mb-3">
      <div class="flex items-center gap-2 min-w-0">
        <BkRune v-if="primaryRune" :name="primaryRune" :size="24" />
        <h3 class="font-display font-semibold text-ink truncate">{{ name }}</h3>
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

    <div v-if="workoutExercise.sets.length" class="space-y-1 border-b border-line pb-3 mb-3">
      <div
        v-for="set in workoutExercise.sets"
        :key="set.id"
        :data-testid="`set-row-${set.id}`"
        :class="set.is_warmup && 'text-ink-faint'"
      >
        <div v-if="editingSetId === set.id && exercise" class="space-y-2 py-2">
          <SetForm
            :measurement="exercise.measurement"
            :units="units"
            :initial-set="set"
            editing
            @submit="(value) => onUpdateSet(set.id, value)"
          />
          <BkButton
            variant="ghost"
            size="sm"
            :data-testid="`cancel-edit-set-${set.id}`"
            @click="editingSetId = null"
          >
            {{ t('common.cancel') }}
          </BkButton>
        </div>

        <div v-else class="flex items-center justify-between">
          <span class="bk-metric text-sm">
            {{ set.set_number }}. {{ formatSetValue(set) }}
            <span v-if="set.rpe"> · RPE {{ set.rpe }}</span>
          </span>

          <div v-if="deleteConfirming !== set.id" class="flex items-center gap-1">
            <button
              v-if="exercise"
              type="button"
              :data-testid="`edit-set-${set.id}`"
              class="text-ink-faint hover:text-aurora text-xs px-2"
              :aria-label="t('common.edit')"
              @click="editingSetId = set.id"
            >
              {{ t('common.edit') }}
            </button>
            <button
              type="button"
              :data-testid="`delete-set-${set.id}`"
              class="text-ink-faint hover:text-danger text-sm px-2"
              :aria-label="t('workout.deleteSet')"
              @click="deleteConfirming = set.id"
            >
              ×
            </button>
          </div>
          <div v-else class="flex items-center gap-1">
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
    </div>

    <SetForm v-if="exercise" :measurement="exercise.measurement" :units="units" @submit="onSubmitSet" />

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
  </BkCard>
</template>

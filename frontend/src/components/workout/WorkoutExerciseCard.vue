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
import { isValidRuneName } from '@/components/calendar/groupRune'
import { exerciseName } from '@/components/routines/exerciseName'
import { useActiveWorkoutStore } from '@/stores/activeWorkout'
import { useRestTimerStore } from '@/stores/restTimer'
import { formatWeight } from '@/utils/units'
import BkButton from '@/lib/BkButton.vue'
import BkCard from '@/lib/BkCard.vue'
import BkRune from '@/lib/BkRune.vue'
import type { RuneName } from '@/lib/runes'
import { restFor } from './rest'
import SetForm from './SetForm.vue'

const props = withDefaults(
  defineProps<{
    workoutExercise: WorkoutExerciseOut
    exercise?: ExerciseOut
    muscleGroups?: MuscleGroupOut[]
    routines?: RoutineOut[]
    exerciseIds: number[]
    units?: 'kg' | 'lb'
    locale?: string
  }>(),
  {
    muscleGroups: () => [],
    routines: () => [],
    units: 'kg',
    locale: 'es',
  },
)

const emit = defineEmits<{ recorded: [records: PersonalRecordOut[]] }>()

const { t } = useI18n()
const activeWorkout = useActiveWorkoutStore()
const restTimer = useRestTimerStore()

const removeConfirming = ref(false)

const name = computed(() => exerciseName(props.exercise, props.locale))

// runa del grupo muscular primario del ejercicio, si el catálogo lo resuelve
const primaryRune = computed<RuneName | null>(() => {
  const link = props.exercise?.muscle_groups.find((m) => m.is_primary)
  if (!link) return null
  const group = props.muscleGroups.find((g) => g.id === link.muscle_group_id)
  return group && isValidRuneName(group.slug) ? group.slug : null
})

const index = computed(() => props.exerciseIds.indexOf(props.workoutExercise.id))
const isFirst = computed(() => index.value <= 0)
const isLast = computed(() => index.value === -1 || index.value === props.exerciseIds.length - 1)

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = String(seconds % 60).padStart(2, '0')
  return `${m}:${s}`
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

async function onSubmitSet(value: SetIn) {
  const result = await activeWorkout.logSet(props.workoutExercise.id, value)
  // el descanso depende de si el entreno viene de una rutina (su rest_seconds) o es libre (default)
  const seconds = restFor(activeWorkout.workout, props.routines, props.workoutExercise.exercise_id)
  restTimer.start(seconds)
  if (result.new_records.length) emit('recorded', result.new_records)
}

async function onDeleteSet(setId: number) {
  await activeWorkout.deleteSet(props.workoutExercise.id, setId)
}

async function confirmRemove() {
  removeConfirming.value = false
  await activeWorkout.removeExercise(props.workoutExercise.id)
}

function swap(a: number, b: number): number[] {
  const copy = [...props.exerciseIds]
  ;[copy[a], copy[b]] = [copy[b], copy[a]]
  return copy
}

async function moveUp() {
  if (isFirst.value) return
  await activeWorkout.reorder(swap(index.value, index.value - 1))
}

async function moveDown() {
  if (isLast.value) return
  await activeWorkout.reorder(swap(index.value, index.value + 1))
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
        class="flex items-center justify-between"
        :class="set.is_warmup && 'text-ink-faint'"
      >
        <span class="bk-metric text-sm">
          {{ set.set_number }}. {{ formatSetValue(set) }}
          <span v-if="set.rpe"> · RPE {{ set.rpe }}</span>
        </span>
        <button
          type="button"
          :data-testid="`delete-set-${set.id}`"
          class="text-ink-faint hover:text-danger text-sm px-2"
          :aria-label="t('workout.deleteSet')"
          @click="onDeleteSet(set.id)"
        >
          ×
        </button>
      </div>
    </div>

    <SetForm v-if="exercise" :measurement="exercise.measurement" @submit="onSubmitSet" />

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

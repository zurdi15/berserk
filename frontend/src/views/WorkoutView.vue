<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute, useRouter } from 'vue-router'

import type { ExerciseOut, MuscleGroupOut, PersonalRecordOut, RoutineOut, WorkoutOut } from '@/api/domain'
import { listExercises, listMuscleGroups, listRoutines } from '@/api/domain'
import { toastApiError } from '@/utils/apiErrors'
import { useActiveWorkoutStore } from '@/stores/activeWorkout'
import { useAuthStore } from '@/stores/auth'
import AddExerciseSheet from '@/components/workout/AddExerciseSheet.vue'
import FinishSummary from '@/components/workout/FinishSummary.vue'
import WorkoutExerciseCard from '@/components/workout/WorkoutExerciseCard.vue'
import BkButton from '@/lib/BkButton.vue'

const { t, locale } = useI18n()
const route = useRoute()
const router = useRouter()
const auth = useAuthStore()
const activeWorkout = useActiveWorkoutStore()

const routines = ref<RoutineOut[]>([])
const exercises = ref<ExerciseOut[]>([])
const muscleGroups = ref<MuscleGroupOut[]>([])
const addSheetOpen = ref(false)
const finishedWorkout = ref<WorkoutOut | null>(null)
const sessionRecords = ref<PersonalRecordOut[]>([])
const now = ref(Date.now())
let ticker: ReturnType<typeof setInterval> | null = null

const units = computed(() => ((auth.user?.units as 'kg' | 'lb') || 'kg'))
const exerciseMap = computed(() => new Map(exercises.value.map((e) => [e.id, e])))
const exerciseIds = computed(() => activeWorkout.workout?.exercises.map((e) => e.id) ?? [])

// ticks cada segundo con setInterval, pero el cálculo parte siempre de started_at:
// si la pestaña estuvo dormida el número salta a lo correcto en el próximo tick
const elapsedLabel = computed(() => {
  if (!activeWorkout.workout?.started_at) return '0:00'
  const totalSeconds = Math.max(
    0,
    Math.floor((now.value - new Date(activeWorkout.workout.started_at).getTime()) / 1000),
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

async function loadCatalog() {
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
  } catch (error) {
    toastApiError(error)
  }
}

function onRecorded(records: PersonalRecordOut[]) {
  sessionRecords.value.push(...records)
}

function closeSummary() {
  finishedWorkout.value = null
  sessionRecords.value = []
  router.push({ name: 'today' })
}

onMounted(async () => {
  await loadCatalog()
  try {
    await activeWorkout.resume()
  } catch (error) {
    toastApiError(error)
  }
  if (!activeWorkout.workout) {
    const sessionParam = route.query.session
    if (sessionParam) {
      try {
        await activeWorkout.start({ scheduled_session_id: Number(sessionParam) })
      } catch (error) {
        toastApiError(error)
      }
    }
  }
  ticker = setInterval(() => {
    now.value = Date.now()
  }, 1000)
})

onBeforeUnmount(() => {
  if (ticker) clearInterval(ticker)
})
</script>

<template>
  <div>
    <FinishSummary
      v-if="finishedWorkout"
      :workout="finishedWorkout"
      :records="sessionRecords"
      @close="closeSummary"
    />

    <div v-else-if="activeWorkout.workout" class="space-y-4 bk-stagger">
      <div class="bk-slab p-4 flex items-center justify-between">
        <div>
          <p class="text-sm text-ink-muted capitalize">{{ dateLabel }}</p>
          <p class="bk-metric text-2xl text-ink" data-testid="elapsed">{{ elapsedLabel }}</p>
        </div>
        <BkButton variant="primary" @click="onFinish">{{ t('workout.finish') }}</BkButton>
      </div>

      <WorkoutExerciseCard
        v-for="we in activeWorkout.workout.exercises"
        :key="we.id"
        :workout-exercise="we"
        :exercise="exerciseMap.get(we.exercise_id)"
        :muscle-groups="muscleGroups"
        :routines="routines"
        :exercise-ids="exerciseIds"
        :units="units"
        :locale="locale"
        @recorded="onRecorded"
      />

      <BkButton variant="ghost" block @click="addSheetOpen = true">{{ t('workout.addExercise') }}</BkButton>

      <AddExerciseSheet :open="addSheetOpen" @close="addSheetOpen = false" />
    </div>

    <div v-else class="space-y-4">
      <BkButton variant="primary" block @click="startFree">{{ t('workout.freeWorkout') }}</BkButton>

      <div v-if="routines.length" class="space-y-2">
        <p class="text-sm text-ink-muted">{{ t('workout.startFromRoutine') }}</p>
        <BkButton
          v-for="routine in routines"
          :key="routine.id"
          variant="ghost"
          block
          @click="startFromRoutine(routine.id)"
        >
          {{ routine.name }}
        </BkButton>
      </div>
    </div>
  </div>
</template>

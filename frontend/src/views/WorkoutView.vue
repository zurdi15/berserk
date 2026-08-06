<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute, useRouter } from 'vue-router'

import type { ExerciseOut, MuscleGroupOut, PersonalRecordOut, RoutineOut, WorkoutOut } from '@/api/domain'
import { listExercises, listMuscleGroups, listRoutines } from '@/api/domain'
import { isValidRuneName, primaryRune } from '@/lib/runeResolve'
import { parseUtc } from '@/utils/datetime'
import { toastApiError } from '@/utils/apiErrors'
import { useActiveWorkoutStore } from '@/stores/activeWorkout'
import { useAuthStore } from '@/stores/auth'
import AddExerciseSheet from '@/components/workout/AddExerciseSheet.vue'
import FinishSummary from '@/components/workout/FinishSummary.vue'
import WorkoutExerciseCard from '@/components/workout/WorkoutExerciseCard.vue'
import BkCelebration from '@/components/celebration/BkCelebration.vue'
import BkButton from '@/lib/BkButton.vue'
import BkRune from '@/lib/BkRune.vue'
import BkSheet from '@/lib/BkSheet.vue'
import type { RuneName } from '@/lib/runes'

const { t, locale } = useI18n()
const route = useRoute()
const router = useRouter()
const auth = useAuthStore()
const activeWorkout = useActiveWorkoutStore()

const routines = ref<RoutineOut[]>([])
const exercises = ref<ExerciseOut[]>([])
const muscleGroups = ref<MuscleGroupOut[]>([])
// gatea la lista de "empezar desde rutina" hasta que el catálogo carga: sin
// esto la lista aparece de golpe ~100ms después de montar, encima del botón
// de entreno libre — mismo patrón que TodayView. true también en error.
const catalogReady = ref(false)
const addSheetOpen = ref(false)
const discardConfirmOpen = ref(false)
const muscleTagPending = ref(false)
const finishedWorkout = ref<WorkoutOut | null>(null)
const sessionRecords = ref<PersonalRecordOut[]>([])
const now = ref(Date.now())
let ticker: ReturnType<typeof setInterval> | null = null

const units = computed(() => ((auth.user?.units as 'kg' | 'lb') || 'kg'))
const exerciseMap = computed(() => new Map(exercises.value.map((e) => [e.id, e])))
const exerciseIds = computed(() => activeWorkout.workout?.exercises.map((e) => e.id) ?? [])

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
    router.push({ name: 'today' })
  } catch (error) {
    toastApiError(error)
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

function isMuscleTagActive(id: number): boolean {
  return activeWorkout.workout?.muscle_tag_ids.includes(id) ?? false
}

async function toggleMuscleTag(id: number) {
  // guarda de vuelo único: dos toggles en paralelo partirían del mismo
  // muscle_tag_ids "viejo" y el que responda último pisaría al otro
  // (lost update); mientras haya una petición en curso, los clics son inertes
  if (muscleTagPending.value) return
  const current = activeWorkout.workout?.muscle_tag_ids ?? []
  const next = current.includes(id) ? current.filter((tagId) => tagId !== id) : [...current, id]
  muscleTagPending.value = true
  try {
    await activeWorkout.setMuscleTags(next)
  } catch (error) {
    toastApiError(error)
  } finally {
    muscleTagPending.value = false
  }
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
    <BkCelebration
      v-if="activeWorkout.lastRecords.length"
      :records="activeWorkout.lastRecords"
      :rune-name="celebrationRune"
      :units="units"
      @done="onCelebrationDone"
    />

    <FinishSummary
      v-if="finishedWorkout"
      :workout="finishedWorkout"
      :records="sessionRecords"
      @close="closeSummary"
    />

    <div v-else-if="activeWorkout.workout" class="space-y-4 bk-stagger">
      <div class="bk-slab p-4 flex items-center justify-between" :style="{ '--bk-stagger-i': 0 }">
        <div>
          <p class="text-sm text-ink-muted capitalize">{{ dateLabel }}</p>
          <p class="bk-metric text-2xl text-ink" data-testid="elapsed">{{ elapsedLabel }}</p>
        </div>
        <div class="flex items-center gap-2">
          <BkButton
            variant="danger"
            data-testid="discard-workout"
            @click="discardConfirmOpen = true"
          >
            {{ t('workout.discard') }}
          </BkButton>
          <BkButton variant="primary" @click="onFinish">{{ t('workout.finish') }}</BkButton>
        </div>
      </div>

      <div v-if="muscleGroups.length" class="bk-slab p-4 space-y-2" :style="{ '--bk-stagger-i': 1 }">
        <p class="text-sm text-ink-muted">{{ t('workout.muscleTags') }}</p>
        <div class="flex flex-wrap gap-2">
          <button
            v-for="group in muscleGroups"
            :key="group.id"
            type="button"
            :data-testid="`muscle-tag-${group.id}`"
            class="bk-press px-3 py-1.5 rounded-sm border text-sm disabled:opacity-50"
            :class="isMuscleTagActive(group.id) ? 'border-aurora text-aurora bg-aurora/10' : 'border-line text-ink-muted'"
            :aria-pressed="isMuscleTagActive(group.id) ? 'true' : 'false'"
            :disabled="muscleTagPending"
            @click="toggleMuscleTag(group.id)"
          >
            {{ muscleTagLabel(group) }}
          </button>
        </div>
      </div>

      <WorkoutExerciseCard
        v-for="(we, i) in activeWorkout.workout.exercises"
        :key="we.id"
        :style="{ '--bk-stagger-i': i + 2 }"
        :workout-exercise="we"
        :exercise="exerciseMap.get(we.exercise_id)"
        :muscle-groups="muscleGroups"
        :routines="routines"
        :routine-id="activeWorkout.workout.routine_id"
        :exercise-ids="exerciseIds"
        :units="units"
        :locale="locale"
        :actions="activeWorkout"
        @recorded="onRecorded"
      />

      <BkButton
        variant="ghost"
        block
        :style="{ '--bk-stagger-i': activeWorkout.workout.exercises.length + 2 }"
        @click="addSheetOpen = true"
      >
        {{ t('workout.addExercise') }}
      </BkButton>

      <AddExerciseSheet :open="addSheetOpen" :actions="activeWorkout" @close="addSheetOpen = false" />

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
        </BkButton>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
// facelift — el HERO de Hoy: absorbe RotationNextCard + TodaySessionCard en
// una sola pieza estilo referencia (foto/runa de fondo, "Hoy toca", nombre
// grande, CTA dominante). Estados, en orden:
//   (a) entreno en curso → eyebrow "Entrenando" + CTA continuar
//   (b) rutina de rotación ("te toca", zurdi v0.14.1: SIEMPRE encima de la
//       programada) con carrusel ‹ › para fijar otra (putRotationNext, el
//       mismo gesto "fijar como la de hoy" de RotationPlanCard) — la sesión
//       planificada de hoy aparece como fila-chip DENTRO del hero
//   (c) sin plan pero con sesión planificada → hero de sesión
//   (d) nada → hero compacto "Entreno libre" + programar
// En modo atleta (viendo a otro) no hay rotación propia ni CTAs: solo la
// card de sesiones de hoy en lectura.
import { computed, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'

import type { ExerciseOut, RotationOut, ScheduledOut } from '@/api/domain'
import { getRotation, putRotationNext } from '@/api/domain'
import BkButton from '@/lib/BkButton.vue'
import BkCard from '@/lib/BkCard.vue'
import BkHero from '@/lib/BkHero.vue'
import { isValidRuneName } from '@/lib/runeResolve'
import type { RuneName } from '@/lib/runes'
import { useActiveWorkoutStore } from '@/stores/activeWorkout'
import { useAthleteStore } from '@/stores/athlete'
import { toastApiError } from '@/utils/apiErrors'
import { formatTimeShort, todayIso } from '@/utils/dates'
import { estimateRoutineMinutes } from '@/components/workout/routineEstimate'

const props = withDefaults(
  defineProps<{ schedules: ScheduledOut[]; exercises: ExerciseOut[] }>(),
  { schedules: () => [], exercises: () => [] },
)

const { t } = useI18n()
const router = useRouter()
const athlete = useAthleteStore()
const activeWorkout = useActiveWorkoutStore()

const rotation = ref<RotationOut | null>(null)
const ready = ref(false)
// índice de la rutina MOSTRADA en el carrusel (arranca en la que toca)
const selectedIndex = ref<number | null>(null)
const switching = ref(false)

onMounted(async () => {
  if (athlete.isViewing) {
    ready.value = true
    return
  }
  try {
    rotation.value = (await getRotation()) ?? null
    selectedIndex.value = rotation.value?.next_position ?? null
  } catch {
    // hint de fondo: sin red, Hoy sigue sin el carrusel
    rotation.value = null
  } finally {
    ready.value = true
  }
})

const routines = computed(() => rotation.value?.routines ?? [])
const displayRoutine = computed(() =>
  selectedIndex.value === null ? null : (routines.value[selectedIndex.value] ?? null),
)

const workoutActive = computed(() => activeWorkout.workout !== null)

// media del hero: primer ejercicio de la rutina con foto; la runa de la
// rutina como fallback (BkMedia cae al bindrune si tampoco hay)
const heroExercise = computed(() => {
  for (const routineRow of displayRoutine.value?.exercises ?? []) {
    const found = props.exercises.find((e) => e.id === routineRow.exercise_id)
    if (found?.has_image) return found
  }
  return null
})

const heroRune = computed<RuneName | null>(() =>
  displayRoutine.value?.rune && isValidRuneName(displayRoutine.value.rune)
    ? (displayRoutine.value.rune as RuneName)
    : null,
)

const heroMeta = computed(() => {
  const routine = displayRoutine.value
  if (!routine || routine.exercises.length === 0) return null
  return t('today.heroMeta', {
    min: estimateRoutineMinutes(routine, props.exercises),
    n: routine.exercises.length,
  })
})

const today = computed(() => todayIso())
const todaySessions = computed(() => props.schedules.filter((s) => s.date === today.value))
const plannedSession = computed(() => todaySessions.value.find((s) => s.status === 'planned'))

// mismos puntos de estado que la vieja TodaySessionCard (specs los cubren)
const statusClasses = (status: string) => {
  if (status === 'planned') return 'border-2 border-aurora rounded-full'
  if (status === 'done') return 'bg-aurora rounded-full'
  if (status === 'skipped') return 'bg-ink-faint rounded-full'
  return 'bg-ink-faint rounded-full'
}

// ‹ ›: fijar otra rutina del plan como la de hoy — persiste al momento
// (putRotationNext); las flechas se deshabilitan mientras viaja el PUT para
// no encolar carreras
async function selectDelta(delta: number) {
  if (selectedIndex.value === null || routines.value.length < 2 || switching.value) return
  const next = (selectedIndex.value + delta + routines.value.length) % routines.value.length
  const target = routines.value[next]
  if (!target) return
  switching.value = true
  try {
    rotation.value = await putRotationNext(target.id)
    selectedIndex.value = rotation.value?.next_position ?? next
  } catch (error) {
    toastApiError(error)
  } finally {
    switching.value = false
  }
}

// con un entreno YA en curso no se arranca otro: el botón lleva a él.
// facelift fase 3: sin entreno en curso, el CTA navega a la pantalla de
// PRE-INICIO (workout-start) en vez de arrancar a ciegas — ahí vive el
// "Empezar entrenamiento" definitivo con los bloques a la vista
function start() {
  if (workoutActive.value) {
    router.push({ name: 'workout' })
    return
  }
  if (!displayRoutine.value) return
  router.push({ name: 'workout-start', params: { routineId: displayRoutine.value.id } })
}

function startSession() {
  if (plannedSession.value) {
    router.push({ name: 'workout', query: { session: plannedSession.value.id } })
  }
}

function startFree() {
  router.push({ name: 'workout' })
}

// polish wave item 8: aterrizar en el calendario CON el día de hoy en query
// para que abra su sheet directamente
function goToCalendar() {
  router.push({ name: 'calendar', query: { day: today.value } })
}
</script>

<template>
  <!-- modo atleta: solo lectura de las sesiones de hoy -->
  <BkCard v-if="athlete.isViewing" :title="t('today.todaySession')">
    <p v-if="todaySessions.length === 0" class="text-ink-muted">{{ t('today.noSession') }}</p>
    <div v-else class="space-y-3">
      <div
        v-for="session in todaySessions"
        :key="session.id"
        class="flex items-center gap-3"
        :data-testid="`session-${session.status}`"
      >
        <span :class="['w-2.5 h-2.5', statusClasses(session.status)]" />
        <div class="flex-1 min-w-0">
          <p v-if="formatTimeShort(session.time)" class="font-medium text-ink">{{ formatTimeShort(session.time) }}</p>
          <p v-if="session.note" class="text-sm text-ink-muted truncate">{{ session.note }}</p>
          <!-- sin hora ni nota: etiqueta de estado, que el punto no quede solo -->
          <p v-if="!formatTimeShort(session.time) && !session.note && session.status === 'planned'" class="text-sm text-ink-muted">
            {{ t('calendar.plannedEyebrow') }}
          </p>
        </div>
      </div>
    </div>
  </BkCard>

  <template v-else-if="ready">
    <!-- (b) hero de rotación -->
    <BkHero
      v-if="displayRoutine"
      :exercise="heroExercise"
      :rune="heroRune"
      data-testid="rotation-next-card"
    >
      <div class="space-y-3">
        <p class="bk-eyebrow text-aurora">{{ workoutActive ? t('today.heroInProgress') : t('today.heroEyebrow') }}</p>
        <div class="flex items-center gap-2">
          <button
            v-if="routines.length > 1"
            type="button"
            class="bk-press shrink-0 w-9 h-9 rounded-full border border-line-strong text-ink flex items-center justify-center"
            :disabled="switching || undefined"
            :aria-label="t('today.heroPrev')"
            data-testid="hero-prev"
            @click="selectDelta(-1)"
          >
            <span aria-hidden="true">‹</span>
          </button>
          <h2 class="flex-1 min-w-0 bk-display text-ink truncate text-center" data-testid="rotation-next-name">
            {{ displayRoutine.name }}
          </h2>
          <button
            v-if="routines.length > 1"
            type="button"
            class="bk-press shrink-0 w-9 h-9 rounded-full border border-line-strong text-ink flex items-center justify-center"
            :disabled="switching || undefined"
            :aria-label="t('today.heroNext')"
            data-testid="hero-next"
            @click="selectDelta(1)"
          >
            <span aria-hidden="true">›</span>
          </button>
        </div>
        <p v-if="heroMeta" class="text-sm text-ink-muted text-center">{{ heroMeta }}</p>
        <BkButton
          variant="primary"
          size="lg"
          block
          data-testid="rotation-start-btn"
          @click="start"
        >
          {{ workoutActive ? t('rotation.continue') : t('today.heroCta') }}
        </BkButton>
        <!-- sesión planificada de hoy, como fila-chip dentro del hero -->
        <div v-if="todaySessions.length > 0" class="flex flex-wrap items-center justify-center gap-2">
          <component
            :is="session.status === 'planned' ? 'button' : 'span'"
            v-for="session in todaySessions"
            :key="session.id"
            :type="session.status === 'planned' ? 'button' : undefined"
            class="inline-flex items-center gap-1.5 rounded-full border border-line px-2.5 py-1 text-xs text-ink-muted transition-colors"
            :class="session.status === 'planned' && 'bk-press hover:border-aurora hover:text-ink'"
            :data-testid="`session-${session.status}`"
            @click="session.status === 'planned' && startSession()"
          >
            <span :class="['w-2.5 h-2.5', statusClasses(session.status)]" />
            {{ t('calendar.plannedEyebrow') }}<template v-if="formatTimeShort(session.time)"> · {{ formatTimeShort(session.time) }}</template>
          </component>
        </div>
        <div v-if="routines.length > 1" class="flex items-center justify-center gap-1.5" aria-hidden="true">
          <span
            v-for="(routine, i) in routines"
            :key="routine.id"
            class="w-1.5 h-1.5 rounded-full"
            :class="i === selectedIndex ? 'bg-aurora' : 'bg-line-strong'"
          />
        </div>
      </div>
    </BkHero>

    <!-- (c) sin plan, con sesiones hoy (planificadas, hechas u omitidas) -->
    <BkHero v-else-if="todaySessions.length > 0" rune="berserk">
      <div class="space-y-3">
        <p v-if="plannedSession" class="bk-eyebrow text-aurora">
          {{ t('calendar.plannedEyebrow') }}<template v-if="formatTimeShort(plannedSession.time)"> · {{ formatTimeShort(plannedSession.time) }}</template>
        </p>
        <h2 class="bk-display text-ink">{{ t('today.todaySession') }}</h2>
        <div class="space-y-2">
          <div
            v-for="session in todaySessions"
            :key="session.id"
            class="flex items-center gap-3"
            :data-testid="`session-${session.status}`"
          >
            <span :class="['w-2.5 h-2.5', statusClasses(session.status)]" />
            <div class="flex-1 min-w-0">
              <p v-if="formatTimeShort(session.time)" class="font-medium text-ink">{{ formatTimeShort(session.time) }}</p>
              <p v-if="session.note" class="text-sm text-ink-muted truncate">{{ session.note }}</p>
              <!-- sin hora ni nota: etiqueta de estado, que el punto no quede solo -->
              <p v-if="!formatTimeShort(session.time) && !session.note && session.status === 'planned'" class="text-sm text-ink-muted">
                {{ t('calendar.plannedEyebrow') }}
              </p>
            </div>
          </div>
        </div>
        <BkButton v-if="plannedSession" variant="primary" size="lg" block @click="startSession">
          {{ t('today.startWorkout') }}
        </BkButton>
      </div>
    </BkHero>

    <!-- (d) nada programado: entreno libre + programar -->
    <BkCard v-else :title="t('today.todaySession')">
      <div class="space-y-3">
        <p class="text-ink-muted">{{ t('today.noSession') }}</p>
        <BkButton variant="primary" size="lg" block @click="startFree">
          {{ workoutActive ? t('rotation.continue') : t('today.heroFree') }}
        </BkButton>
        <BkButton variant="ghost" block @click="goToCalendar">
          {{ t('today.scheduleSession') }}
        </BkButton>
      </div>
    </BkCard>
  </template>
</template>

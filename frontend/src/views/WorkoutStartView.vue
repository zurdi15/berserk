<script setup lang="ts">
// facelift — pantalla de PRE-INICIO de una rutina (el "detalle de entreno"
// de la referencia): hero con la foto del primer ejercicio (o runa), card
// solapada con el resumen "{b} bloques · {n} ejercicios · ~{min} min" y el
// CTA "Empezar entrenamiento", y la lista de ejercicios agrupada por bloque.
// Vista hermana de WorkoutView, NUNCA en el include del KeepAlive del shell.
import { computed, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute, useRouter } from 'vue-router'

import type { ExerciseOut, MuscleGroupOut, RoutineExerciseOut, RoutineOut } from '@/api/domain'
import { getRotation, listExercises, listMuscleGroups, listRoutines, routineImageUrl } from '@/api/domain'
import { exerciseName } from '@/components/routines/exerciseName'
import { estimateRoutineMinutes } from '@/components/workout/routineEstimate'
import BkButton from '@/lib/BkButton.vue'
import BkMedia from '@/lib/BkMedia.vue'
import BkHero from '@/lib/BkHero.vue'
import { isValidRuneName, primaryRune } from '@/lib/runeResolve'
import type { RuneName } from '@/lib/runes'
import { supersetLabels } from '@/lib/supersets'
import { useActiveWorkoutStore } from '@/stores/activeWorkout'
import { useAuthStore } from '@/stores/auth'
import { toastApiError } from '@/utils/apiErrors'

const { t } = useI18n()
const route = useRoute()
const router = useRouter()
const auth = useAuthStore()
const activeWorkout = useActiveWorkoutStore()

const routines = ref<RoutineOut[]>([])
const exercises = ref<ExerciseOut[]>([])
const muscleGroups = ref<MuscleGroupOut[]>([])
const rotationNextId = ref<number | null>(null)
const ready = ref(false)
const starting = ref(false)

const routineId = computed(() => Number(route.params.routineId))
const routine = computed(() => routines.value.find((r) => r.id === routineId.value) ?? null)
const exerciseMap = computed(() => new Map(exercises.value.map((e) => [e.id, e])))
const workoutActive = computed(() => activeWorkout.workout !== null)

onMounted(async () => {
  // hint tolerante a fallo, como en WorkoutView: el chip "HOY" jamás bloquea
  Promise.resolve()
    .then(() => getRotation())
    .then((rotation) => {
      rotationNextId.value =
        rotation.next_position !== null
          ? (rotation.routines[rotation.next_position]?.id ?? null)
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
    ready.value = true
  }
  // id desconocido (rutina borrada, url vieja): al hub de arranque
  if (ready.value && !routine.value) router.replace({ name: 'workout' })
})

// facelift v4: SOLO la imagen propia de la rutina; sin ella, la runa
const heroSrc = computed(() =>
  routine.value?.has_image ? routineImageUrl(routine.value.id) : undefined,
)

const heroRune = computed<RuneName | null>(() =>
  routine.value?.rune && isValidRuneName(routine.value.rune) ? (routine.value.rune as RuneName) : null,
)

// bloques en orden de primera aparición; null → "General" (solo si además
// hay bloques con nombre — sin bloques, una única sección sin cabecera)
type BlockSection = { label: string | null; rows: { row: RoutineExerciseOut; superset: string | null }[] }
const sections = computed<BlockSection[]>(() => {
  const rows = routine.value?.exercises ?? []
  const supersets = supersetLabels(rows.map((r) => r.superset_group ?? null))
  const byLabel = new Map<string | null, BlockSection>()
  const result: BlockSection[] = []
  rows.forEach((row, i) => {
    const label = row.block_label ?? null
    let section = byLabel.get(label)
    if (!section) {
      section = { label, rows: [] }
      byLabel.set(label, section)
      result.push(section)
    }
    section.rows.push({ row, superset: supersets[i] })
  })
  return result
})

const hasNamedBlocks = computed(() => sections.value.some((s) => s.label !== null))

const summary = computed(() => {
  if (!routine.value) return ''
  const b = sections.value.length
  const n = routine.value.exercises.length
  return t('prestart.summary', {
    blocks: t('prestart.blocksCount', { n: b }, b),
    exercises: t('prestart.exercisesCount', { n }, n),
    min: estimateRoutineMinutes(routine.value, exercises.value),
  })
})

function sectionTitle(section: BlockSection): string {
  return section.label ?? t('workout.blockGeneral')
}

function rowExercise(row: RoutineExerciseOut): ExerciseOut | undefined {
  return exerciseMap.value.get(row.exercise_id)
}

function rowName(row: RoutineExerciseOut): string {
  return exerciseName(rowExercise(row), auth.user?.locale || 'es')
}

function rowMeta(row: RoutineExerciseOut): string {
  if (row.target_reps != null) return `${row.target_sets} × ${row.target_reps}`
  return t('prestart.setsOnly', { n: row.target_sets })
}

// con un entreno YA en curso no se arranca otro: el CTA lleva a él
async function start() {
  if (workoutActive.value) {
    router.push({ name: 'workout' })
    return
  }
  if (!routine.value) return
  try {
    starting.value = true
    await activeWorkout.start({ routine_id: routine.value.id })
    router.push({ name: 'workout' })
  } catch (error) {
    toastApiError(error)
  } finally {
    starting.value = false
  }
}

function goBack() {
  if (window.history.length > 1) router.back()
  else router.push({ name: 'workout' })
}

// v0.5.0 (modelo de scroll único): la vista FLUYE contra <main>; el hero a
// sangre se logra con -mx-4 -mt-4 (espejo del idiom sticky), sin tocar el
// padding del wrapper del shell. (comentario aquí y no como primer hijo del
// template: un comentario ahí rompe wrapper.classes(), ver BkStepper.vue)
</script>

<template>
  <div v-if="ready && routine" class="bk-stagger">
    <!-- hero a sangre (flush: sin radio propio) con el back flotante -->
    <div class="-mx-4 -mt-4" :style="{ '--bk-stagger-i': 0 }">
      <!-- v0.21.2/3 (zurdi): backdrop = isla con la runa a plena presencia,
           TEMATIZADA (oscuro = la nocturna de siempre; claro = niebla pálida
           coherente con el tema). El back usa bk-hero-back (doble modo:
           tematizado sobre la isla, cristal blanco sobre foto) — con
           bg-scrim en oscuro el círculo era el color del lienzo y solo se
           veía el chevron -->
      <BkHero :src="heroSrc" :rune="heroRune" flush backdrop>
        <template #corner>
          <button
            type="button"
            data-testid="prestart-back"
            class="bk-press w-10 h-10 rounded-full border bk-hero-back flex items-center justify-center"
            :aria-label="t('prestart.back')"
            @click="goBack"
          >
            <span aria-hidden="true">‹</span>
          </button>
        </template>
      </BkHero>
    </div>

    <!-- card resumen solapada sobre el hero -->
    <section class="bk-slab p-5 -mt-12 relative space-y-3" :style="{ '--bk-stagger-i': 1 }">
      <span
        v-if="routine.id === rotationNextId"
        class="bk-eyebrow inline-block rounded-full border border-aurora/50 bg-aurora/10 px-2.5 py-1 text-aurora"
        data-testid="prestart-today-chip"
      >{{ t('prestart.todayChip') }}</span>
      <h1 class="bk-display text-ink">{{ routine.name }}</h1>
      <p class="text-sm text-ink-muted" data-testid="prestart-summary">{{ summary }}</p>
      <BkButton
        variant="primary"
        size="lg"
        block
        :loading="starting"
        data-testid="prestart-start-btn"
        @click="start"
      >
        {{ workoutActive ? t('rotation.continue') : t('prestart.start') }}
      </BkButton>
      <p v-if="routine.description" class="text-sm text-ink-muted">{{ routine.description }}</p>
    </section>

    <!-- ejercicios por bloque -->
    <div
      v-for="(section, si) in sections"
      :key="section.label ?? '__general__'"
      class="mt-5 space-y-2"
      :style="{ '--bk-stagger-i': si + 2 }"
      :data-testid="`prestart-section-${si}`"
    >
      <p v-if="hasNamedBlocks" class="bk-eyebrow">{{ sectionTitle(section) }}</p>
      <div class="bk-slab p-2 space-y-1">
        <div
          v-for="{ row, superset } in section.rows"
          :key="row.id"
          class="flex items-center gap-3 rounded-lg p-2"
          :data-testid="`prestart-exercise-${row.id}`"
        >
          <BkMedia
            :exercise="rowExercise(row)"
            :rune="primaryRune(rowExercise(row), muscleGroups)"
            size="tallSm"
          />
          <div class="flex-1 min-w-0">
            <p class="text-base font-medium text-ink truncate">{{ rowName(row) }}</p>
            <p class="bk-metric text-sm text-ink-muted">{{ rowMeta(row) }}</p>
          </div>
          <span
            v-if="superset"
            class="inline-flex items-center rounded-full border border-aurora/50 text-aurora text-xs px-2 py-0.5 shrink-0"
          >{{ t('workout.superset', { label: superset }) }}</span>
        </div>
      </div>
    </div>
  </div>
</template>

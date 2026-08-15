<script setup lang="ts">
// Tarjeta unificada de un entreno del día (round 10, item 2 + amendment A):
// antes había una fila de "sesión completada" y otra separada de "entreno
// registrado" para el MISMO evento — zurdi: "un entreno es un entreno". Esta
// tarjeta junta info completa (rutina/hora/duración/ejercicios/totales/
// sensación/nota) + editar/borrar en un único bloque, tanto si el entreno
// viene de una sesión programada como si es libre (standalone).
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'

import type { ExerciseOut, WorkoutOut } from '@/api/domain'
import { useDisplayUnits } from '@/composables/useDisplayUnits'
import { formatDateTimeShort } from '@/utils/dates'
import { formatWeightInt } from '@/utils/units'
import { exerciseName } from '@/components/routines/exerciseName'
import BkActionBtn from '@/lib/BkActionBtn.vue'
import BkRune from '@/lib/BkRune.vue'

const props = defineProps<{
  workout: WorkoutOut
  routineName: string | null
  exerciseCatalog: ExerciseOut[]
  canEdit: boolean
}>()

const emit = defineEmits<{ edit: []; delete: [] }>()

const { t, locale } = useI18n()
const units = useDisplayUnits()

function resolveExercise(exerciseId: number): ExerciseOut | undefined {
  return props.exerciseCatalog.find((exercise) => exercise.id === exerciseId)
}

const startLabel = computed(() => formatDateTimeShort(props.workout.started_at))

// mismo cálculo que FinishSummary.vue (duración/series/volumen): se
// replica en vez de importarse porque allí es de un entreno EN CURSO/recién
// terminado con nota y sensación editables, y aquí es un resumen de SOLO
// LECTURA de un entreno ya pasado — misma fórmula, contexto distinto
const durationLabel = computed(() => {
  if (!props.workout.started_at || !props.workout.ended_at) return null
  const ms = new Date(props.workout.ended_at).getTime() - new Date(props.workout.started_at).getTime()
  const totalMinutes = Math.max(0, Math.round(ms / 60000))
  const h = Math.floor(totalMinutes / 60)
  const m = totalMinutes % 60
  return h > 0 ? `${h}h ${m}min` : `${m}min`
})

const exerciseLines = computed(() =>
  props.workout.exercises.map((exercise) => ({
    id: exercise.id,
    name: exerciseName(resolveExercise(exercise.exercise_id), locale.value),
    setCount: exercise.sets.filter((set) => !set.is_warmup).length,
  })),
)

const totalSets = computed(() =>
  props.workout.exercises.reduce((sum, e) => sum + e.sets.filter((s) => !s.is_warmup).length, 0),
)

const totalVolume = computed(() =>
  props.workout.exercises.reduce((sum, e) => {
    // v0.18.0: las series en modo nivel no suman volumen — su weight_kg es
    // un número plano de máquina, no kg (mismo criterio que el backend)
    const exerciseVolume = e.sets
      .filter((s) => !s.is_warmup && s.weight_kg != null && s.reps != null && (s.load_mode ?? 'weight') !== 'level')
      .reduce((acc, s) => acc + s.weight_kg! * s.reps!, 0)
    return sum + exerciseVolume
  }, 0),
)
</script>

<template>
  <div class="border border-line rounded-sm p-3 space-y-3" :data-testid="`workout-card-${workout.id}`">
    <div class="flex items-start justify-between gap-3">
      <div class="min-w-0">
        <h4 class="font-semibold text-ink truncate">{{ routineName ?? t('workout.freeWorkout') }}</h4>
        <p class="text-sm text-ink-muted">
          <span v-if="startLabel">{{ startLabel }}</span>
          <span v-if="durationLabel"> · {{ durationLabel }}</span>
        </p>
      </div>
      <div v-if="canEdit" class="flex items-center gap-2 shrink-0">
        <BkActionBtn
          icon="edit"
          :data-testid="`edit-workout-${workout.id}`"
          :aria-label="$t('common.edit')"
          @click="emit('edit')"
        />
        <BkActionBtn
          icon="delete"
          :data-testid="`delete-workout-${workout.id}`"
          :aria-label="$t('common.delete')"
          @click="emit('delete')"
        />
      </div>
    </div>

    <div v-if="exerciseLines.length" class="space-y-1 border-t border-line pt-2">
      <div v-for="line in exerciseLines" :key="line.id" class="flex items-center justify-between gap-3 text-sm">
        <span class="text-ink truncate">{{ line.name }}</span>
        <span class="text-ink-muted shrink-0">{{ line.setCount }}</span>
      </div>
    </div>

    <div class="flex gap-4 text-sm border-t border-line pt-2">
      <span class="text-ink-muted">{{ t('workout.totalSets') }}: <span class="text-ink font-medium" data-testid="workout-card-sets">{{ totalSets }}</span></span>
      <span class="text-ink-muted">{{ t('workout.totalVolume') }}: <span class="text-ink font-medium" data-testid="workout-card-volume">{{ formatWeightInt(totalVolume, units) }}</span></span>
    </div>

    <!-- sensación: MISMO idioma visual que el picker interactivo de
         FinishSummary (5 runas "berserk" en caja, la que coincide resaltada
         en aurora), pero sin interacción — es un resumen de solo lectura -->
    <div v-if="workout.feeling" class="flex items-center gap-2">
      <span class="text-sm text-ink-muted">{{ t('workout.feeling') }}</span>
      <div class="flex gap-1">
        <span
          v-for="n in 5"
          :key="n"
          class="p-1.5 rounded-sm border"
          :class="workout.feeling === n ? 'border-aurora text-aurora bg-aurora/10' : 'border-line text-ink-faint'"
        >
          <BkRune name="berserk" :size="16" />
        </span>
      </div>
    </div>

    <p v-if="workout.stretched" data-testid="day-info-stretched" class="text-sm text-aurora">
      ✓ {{ t('workout.stretched') }}
    </p>
    <p v-if="workout.note" class="text-sm text-ink-muted italic">{{ workout.note }}</p>
  </div>
</template>

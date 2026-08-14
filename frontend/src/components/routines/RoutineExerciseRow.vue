<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'

import type { ExerciseOut, MuscleGroupOut } from '@/api/domain'
import { exerciseImageUrl } from '@/api/domain'
import { displayToKg, kgToDisplay } from '@/utils/units'
import BkButton from '@/lib/BkButton.vue'
import BkRune from '@/lib/BkRune.vue'
import BkSelect from '@/lib/BkSelect.vue'
import BkStepper from '@/lib/BkStepper.vue'
import { primaryRune } from '@/lib/runeResolve'
import type { RuneName } from '@/lib/runes'
import { exerciseName } from './exerciseName'

// v0.10.0 (zurdi: "el flow de rutina debería ser exactamente el mismo que el
// de entrenamiento"): la fila del editor extraída a componente — misma
// anatomía que WorkoutExerciseCard (runa+nombre en cabecera, mover/quitar,
// campos debajo) para poder renderizarla dentro y fuera de los contenedores
// de superserie sin duplicar 90 líneas. La fila MUTA el objeto row
// directamente (proxy reactivo del array del editor) — los objetivos no
// pasan por emits.
export interface EditorRow {
  id: string
  exercise_id: number
  target_sets: number
  target_reps: number | null
  target_weight_kg: number | null
  rest_seconds: string | null
  superset_group: number | null
  // v0.17.0 bloques: null = sin bloque; el editor mantiene las filas del
  // mismo bloque contiguas (ver RoutineEditorSheet)
  block_label: string | null
}

const props = defineProps<{
  row: EditorRow
  index: number
  count: number
  allExercises: ExerciseOut[]
  muscleGroups: MuscleGroupOut[]
  units: 'kg' | 'lb'
  locale: string
}>()

const emit = defineEmits<{ moveUp: [index: number]; moveDown: [index: number]; remove: [id: string] }>()

const { t } = useI18n()

const exercise = computed(() => props.allExercises.find((e) => e.id === props.row.exercise_id))
const rune = computed<RuneName | null>(() => primaryRune(exercise.value, props.muscleGroups))
// v0.11.1 (zurdi: "los ejercicios de cardio tienen reps y peso, no tiene
// sentido"): paridad con WorkoutExerciseCard — cardio registra duración/
// distancia y nunca descansa, así que reps/peso/descanso no se muestran
// (las series objetivo sí: "3 × cinta" es un objetivo legítimo)
const isCardio = computed(() => exercise.value?.measurement === 'cardio')

// v0.17.0 (zurdi): ejercicio en modo nivel — el objetivo de carga es un
// número plano (paso 1, sin unidad, sin conversión kg/lb)
const isLevel = computed(() => (exercise.value?.load_mode ?? 'weight') === 'level')

const restOptions = [
  { value: '30', label: '30 s' },
  { value: '60', label: '60 s' },
  { value: '90', label: '90 s' },
  { value: '120', label: '120 s' },
  { value: '180', label: '180 s' },
]
</script>

<template>
  <div class="space-y-2 p-3 bg-stone rounded-sm border border-line" :data-testid="`routine-row-${index}`">
    <!-- cabecera: runa + nombre + mover/quitar — misma anatomía que la card
         del entreno (el chip de superserie vive en el contenedor del bloque) -->
    <div class="flex items-center gap-2">
      <!-- v0.12.0: mismo thumb que la card del entreno (paridad de flujos) -->
      <img
        v-if="exercise?.has_image"
        :src="exerciseImageUrl(exercise.id)"
        alt=""
        class="w-9 h-9 rounded-sm object-cover shrink-0"
      />
      <BkRune v-if="rune" :name="rune" :size="14" />
      <span class="text-sm font-medium text-ink truncate">
        {{ exerciseName(exercise, locale) }}
      </span>
      <div class="ml-auto flex items-center gap-1 shrink-0">
        <button
          v-if="index > 0"
          type="button"
          class="bk-press w-8 h-8 text-ink-muted hover:text-ink"
          :aria-label="t('routines.moveUp')"
          @click="emit('moveUp', index)"
        >
          ↑
        </button>
        <button
          v-if="index < count - 1"
          type="button"
          class="bk-press w-8 h-8 text-ink-muted hover:text-ink"
          :aria-label="t('routines.moveDown')"
          @click="emit('moveDown', index)"
        >
          ↓
        </button>
        <BkButton variant="danger" size="sm" @click="emit('remove', row.id)">
          {{ t('routines.remove') }}
        </BkButton>
      </div>
    </div>

    <div>
      <label class="block text-xs text-ink-muted mb-2">{{ t('routines.targetSets') }}</label>
      <BkStepper
        :model-value="row.target_sets"
        :min="1"
        :max="10"
        @update:model-value="row.target_sets = $event"
      />
    </div>

    <div v-if="!isCardio">
      <label class="block text-xs text-ink-muted mb-2">{{ t('routines.targetReps') }}</label>
      <BkStepper
        :model-value="row.target_reps || 0"
        :min="0"
        :max="100"
        @update:model-value="row.target_reps = $event"
      />
    </div>

    <div v-if="!isCardio && isLevel">
      <label class="block text-xs text-ink-muted mb-2">{{ t('routines.targetLevel') }}</label>
      <!-- nivel plano: viaja tal cual en target_weight_kg, sin conversión -->
      <BkStepper
        :model-value="row.target_weight_kg || 0"
        :min="0"
        :max="100"
        :step="1"
        editable
        @update:model-value="row.target_weight_kg = $event > 0 ? $event : null"
      />
    </div>

    <div v-else-if="!isCardio">
      <label class="block text-xs text-ink-muted mb-2">{{ t('routines.targetWeight') }}</label>
      <!-- v0.17.1 (zurdi): el objetivo también admite entrada directa -->
      <BkStepper
        :model-value="kgToDisplay(row.target_weight_kg || 0, units)"
        :min="0"
        :max="kgToDisplay(300, units)"
        :step="2.5"
        :suffix="units"
        editable
        @update:model-value="row.target_weight_kg = $event > 0 ? displayToKg($event, units) : null"
      />
    </div>

    <BkSelect
      v-if="!isCardio"
      :model-value="row.rest_seconds || '60'"
      :label="t('routines.restSeconds')"
      :options="restOptions"
      @update:model-value="row.rest_seconds = $event"
    />
  </div>
</template>

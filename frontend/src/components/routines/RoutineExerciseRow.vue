<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'

import type { ExerciseOut, MuscleGroupOut } from '@/api/domain'
import BkMedia from '@/lib/BkMedia.vue'
import { displayToKg, kgToDisplay } from '@/utils/units'
import BkButton from '@/lib/BkButton.vue'
import BkRune from '@/lib/BkRune.vue'
import BkSelect from '@/lib/BkSelect.vue'
import BkStepper from '@/lib/BkStepper.vue'
import { primaryRune } from '@/lib/runeResolve'
import type { RuneName } from '@/lib/runes'
import {
  CARDIO_DURATION_MAX_SECONDS,
  CARDIO_DURATION_STEP_SECONDS,
  formatDuration,
} from '../workout/duration'
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
  // v0.23.0 (zurdi: "los ejercicios de cardio deberían tener tiempo
  // objetivo, no series objetivo"): solo aplica a cardio/timed
  target_duration_seconds: number | null
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
  // v0.17.2 (zurdi: "poder añadir ejercicios ya existentes a bloques ya
  // existentes o crear uno nuevo desde el propio ejercicio"): etiquetas de
  // los bloques que ya existen en la rutina — alimentan el select de abajo
  blockLabels?: string[]
}>()

const emit = defineEmits<{
  moveUp: [index: number]
  moveDown: [index: number]
  remove: [id: string]
  // v0.17.2: mover ESTA fila a un bloque existente (o a ninguno con null)
  assignBlock: [id: string, label: string | null]
  // v0.17.2: crear un bloque nuevo CON esta fila dentro (el editor abre su
  // sheet de nombre y asigna al confirmar)
  newBlock: [id: string]
}>()

const { t } = useI18n()

// v0.17.2: select de bloque — controlado por el row (sin estado local: si el
// flujo de "nuevo bloque" se cancela, el valor pintado simplemente no cambia)
const NEW_BLOCK_SENTINEL = '__new__'
const blockOptions = computed(() => [
  { value: '', label: t('routines.blockNone') },
  ...(props.blockLabels ?? []).map((label) => ({ value: label, label })),
  { value: NEW_BLOCK_SENTINEL, label: t('routines.newBlockOption') },
])

function onBlockPick(value: string) {
  if (value === NEW_BLOCK_SENTINEL) {
    emit('newBlock', props.row.id)
    return
  }
  emit('assignBlock', props.row.id, value === '' ? null : value)
}

const exercise = computed(() => props.allExercises.find((e) => e.id === props.row.exercise_id))
const rune = computed<RuneName | null>(() => primaryRune(exercise.value, props.muscleGroups))
// v0.11.1 (zurdi: "los ejercicios de cardio tienen reps y peso, no tiene
// sentido"): paridad con WorkoutExerciseCard — cardio registra duración/
// distancia y nunca descansa, así que reps/peso/descanso no se muestran
// (las series objetivo sí: "3 × cinta" es un objetivo legítimo)
const isCardio = computed(() => exercise.value?.measurement === 'cardio')
// (v0.18.0: el objetivo de rutina es SIEMPRE kg — el modo nivel se decide
// al registrar cada serie, en el cajón del entreno)

const REST_PRESETS = ['30', '60', '90', '120', '180']

// v0.39.3 (zurdi: "en el último ejercicio de la rutina, el descanso por algún
// motivo me salta de 5 segundos"): un descanso que NO sea uno de los presets
// (la rutina puede venir de "guardar como plantilla", que copia el descanso
// efectivo del entreno tal cual) dejaba este campo EN BLANCO —BkSelect pinta
// la etiqueta de la opción que casa, y si ninguna casa, nada—, así que el
// valor raro era invisible aquí y sobrevivía a cada guardado. El valor actual
// entra siempre en la lista, en su sitio por orden numérico: se ve y se puede
// cambiar.
const restOptions = computed(() => {
  const current = props.row.rest_seconds
  const values = current && !REST_PRESETS.includes(current) ? [...REST_PRESETS, current] : REST_PRESETS
  return [...values]
    .sort((a, b) => Number(a) - Number(b))
    .map((value) => ({ value, label: `${value} s` }))
})
</script>

<template>
  <div class="space-y-2 p-3 bg-stone rounded-sm border border-line" :data-testid="`routine-row-${index}`">
    <!-- cabecera: runa + nombre + mover/quitar — misma anatomía que la card
         del entreno (el chip de superserie vive en el contenedor del bloque) -->
    <div class="flex items-center gap-2">
      <!-- v0.22.1 (zurdi: "mismo layout que en entrenamiento"): el thumb
           pequeño de cabecera muere — la foto VERTICAL vive en el cuerpo,
           a la izquierda de los objetivos (espejo del player) -->
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

    <!-- v0.22.1 (zurdi: "que tenga las mismas proporciones que en
         entrenamiento — la imagen a la izquierda y la info a la derecha"):
         espejo EXACTO de la zona media del player (BkMedia tall 9:16 con
         encuadre WYSIWYG + pozo rúnico, self-start) con la columna de
         objetivos donde el player pone las series. Steppers compactos: la
         columna es más estrecha que la card entera -->
    <div class="flex items-start gap-3">
      <BkMedia :exercise="exercise" :rune="rune" size="tall" class="self-start" />
      <div class="flex-1 min-w-0 space-y-2">
        <!-- v0.23.0 (zurdi): en cardio "series objetivo" no dice nada — el
             objetivo es TIEMPO (mismo stepper mm:ss del cajón del entreno,
             pasos de 30 s) y alimenta el default de "Empezar" -->
        <div v-if="isCardio" data-testid="target-duration-field">
          <label class="block text-xs text-ink-muted mb-2">{{ t('routines.targetDuration') }}</label>
          <BkStepper
            :model-value="row.target_duration_seconds ?? 0"
            size="compact"
            :min="0"
            :max="CARDIO_DURATION_MAX_SECONDS"
            :step="CARDIO_DURATION_STEP_SECONDS"
            :display="row.target_duration_seconds ? formatDuration(row.target_duration_seconds) : '—'"
            @update:model-value="row.target_duration_seconds = $event > 0 ? $event : null"
          />
        </div>
        <div v-else>
          <label class="block text-xs text-ink-muted mb-2">{{ t('routines.targetSets') }}</label>
          <BkStepper
            :model-value="row.target_sets"
            size="compact"
            :min="1"
            :max="10"
            @update:model-value="row.target_sets = $event"
          />
        </div>

        <div v-if="!isCardio">
          <label class="block text-xs text-ink-muted mb-2">{{ t('routines.targetReps') }}</label>
          <BkStepper
            :model-value="row.target_reps || 0"
            size="compact"
            :min="0"
            :max="100"
            @update:model-value="row.target_reps = $event"
          />
        </div>

        <div v-if="!isCardio">
          <label class="block text-xs text-ink-muted mb-2">{{ t('routines.targetWeight') }}</label>
          <!-- v0.17.1 (zurdi): el objetivo también admite entrada directa -->
          <BkStepper
            :model-value="kgToDisplay(row.target_weight_kg || 0, units)"
            size="compact"
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

        <!-- v0.17.2 (zurdi): mover el ejercicio a un bloque existente o
             estrenar uno nuevo desde la propia fila — clave para rutinas
             creadas antes de los bloques, donde todo nació sin etiqueta -->
        <!-- testid SIN el prefijo routine-row-: los specs de secciones
             cuentan filas por ese prefijo y este wrapper no es una fila -->
        <div :data-testid="`row-block-select-${index}`">
          <BkSelect
            :model-value="row.block_label ?? ''"
            :label="t('routines.blockField')"
            :options="blockOptions"
            @update:model-value="onBlockPick"
          />
        </div>
      </div>
    </div>
  </div>
</template>

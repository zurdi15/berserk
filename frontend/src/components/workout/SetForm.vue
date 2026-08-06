<script setup lang="ts">
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'

import type { Measurement, SetIn, SetOut } from '@/api/domain'
import { displayToKg, kgToDisplay } from '@/utils/units'
import BkButton from '@/lib/BkButton.vue'
import BkSelect from '@/lib/BkSelect.vue'
import BkStepper from '@/lib/BkStepper.vue'

const props = withDefaults(
  defineProps<{
    measurement: Measurement
    units?: 'kg' | 'lb'
    // precarga desde una serie existente (edición); si no se pasa, valores
    // por defecto de registro en vivo (ver I5: reutilizar el mismo formulario
    // para editar en vez de duplicar la lógica de armado del SetIn)
    initialSet?: SetOut | null
    editing?: boolean
  }>(),
  { units: 'kg', initialSet: null, editing: false },
)
const emit = defineEmits<{ submit: [value: SetIn] }>()

const { t } = useI18n()

const units = computed(() => props.units)

// valores por defecto razonables; se mantienen entre series del mismo bloque
// (no se resetean tras cada submit) para no repetir el mismo tecleo en cada serie.
// En modo edición, el punto de partida es la serie que se está corrigiendo.
const reps = ref(props.initialSet?.reps ?? 8)
const weightDisplay = ref(
  props.initialSet?.weight_kg != null
    ? kgToDisplay(props.initialSet.weight_kg, props.units)
    : (props.measurement === 'strength' ? 20 : 0),
)
const durationSeconds = ref(props.initialSet?.duration_seconds ?? (props.measurement === 'cardio' ? 60 : 30))
const distanceM = ref(props.initialSet?.distance_m ?? 0)
const isWarmup = ref(props.initialSet?.is_warmup ?? false)
const rpe = ref(props.initialSet?.rpe != null ? String(props.initialSet.rpe) : '')

const rpeOptions = computed(() => [
  { value: '', label: '—' },
  ...[6, 7, 8, 9, 10].map((n) => ({ value: String(n), label: String(n) })),
])

// arma el SetIn según la medición; solo strength/bodyweight/timed/cardio son
// válidos (ver backend/app/services/workout_sets.py) — si el catálogo trajera
// algo distinto, mejor no emitir una serie inválida que reventar en submit
function buildValue(): SetIn | null {
  const value: SetIn = { is_warmup: isWarmup.value }

  switch (props.measurement) {
    case 'strength':
      value.reps = reps.value
      value.weight_kg = displayToKg(weightDisplay.value, units.value)
      break
    case 'bodyweight':
      value.reps = reps.value
      if (weightDisplay.value > 0) value.weight_kg = displayToKg(weightDisplay.value, units.value)
      break
    case 'timed':
      value.duration_seconds = durationSeconds.value
      break
    case 'cardio':
      value.duration_seconds = durationSeconds.value
      if (distanceM.value > 0) value.distance_m = distanceM.value
      break
    default:
      // medida desconocida: no debería pasar con el catálogo actual, pero si
      // pasa preferimos avisar en consola a emitir un payload que el backend rechace
      console.warn(`SetForm: medida de ejercicio desconocida "${String(props.measurement)}"`)
      return null
  }

  if (rpe.value) value.rpe = Number(rpe.value)
  return value
}

function submit() {
  const value = buildValue()
  if (!value) return
  emit('submit', value)
  // el calentamiento es por serie: no debe arrastrarse a la siguiente sin querer
  isWarmup.value = false
}
</script>

<template>
  <form class="space-y-3" @submit.prevent="submit">
    <div v-if="measurement === 'strength'" class="flex flex-wrap gap-4">
      <div>
        <span class="block text-xs text-ink-muted mb-2">{{ t('workout.weight') }}</span>
        <BkStepper v-model="weightDisplay" :step="2.5" :min="2.5" :max="500" :suffix="units" />
      </div>
      <div>
        <span class="block text-xs text-ink-muted mb-2">{{ t('workout.reps') }}</span>
        <BkStepper v-model="reps" :step="1" :min="1" :max="100" />
      </div>
    </div>

    <div v-else-if="measurement === 'bodyweight'" class="flex flex-wrap gap-4">
      <div>
        <span class="block text-xs text-ink-muted mb-2">{{ t('workout.reps') }}</span>
        <BkStepper v-model="reps" :step="1" :min="1" :max="100" />
      </div>
      <div>
        <span class="block text-xs text-ink-muted mb-2">{{ t('workout.weightOptional') }}</span>
        <BkStepper v-model="weightDisplay" :step="2.5" :min="0" :max="500" :suffix="units" />
      </div>
    </div>

    <div v-else-if="measurement === 'timed'">
      <span class="block text-xs text-ink-muted mb-2">{{ t('workout.duration') }}</span>
      <BkStepper v-model="durationSeconds" :step="15" :min="1" :max="3600" suffix="s" />
    </div>

    <div v-else-if="measurement === 'cardio'" class="flex flex-wrap gap-4">
      <div>
        <span class="block text-xs text-ink-muted mb-2">{{ t('workout.duration') }}</span>
        <BkStepper v-model="durationSeconds" :step="60" :min="1" :max="21600" suffix="s" />
      </div>
      <div>
        <span class="block text-xs text-ink-muted mb-2">{{ t('workout.distanceOptional') }}</span>
        <BkStepper v-model="distanceM" :step="100" :min="0" :max="100000" suffix="m" />
      </div>
    </div>

    <div class="flex items-center gap-3 flex-wrap">
      <button
        type="button"
        data-testid="warmup-toggle"
        class="bk-press px-3 py-1.5 rounded-sm border text-sm"
        :class="isWarmup ? 'border-aurora text-aurora bg-aurora/10' : 'border-line text-ink-muted'"
        :aria-pressed="isWarmup ? 'true' : 'false'"
        @click="isWarmup = !isWarmup"
      >
        {{ t('workout.warmup') }}
      </button>

      <div class="min-w-24">
        <BkSelect v-model="rpe" :label="t('workout.rpe')" :options="rpeOptions" />
      </div>
    </div>

    <BkButton type="submit" variant="primary" block>{{ editing ? t('common.save') : t('workout.logSet') }}</BkButton>
  </form>
</template>

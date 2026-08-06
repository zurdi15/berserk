<script setup lang="ts">
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'

import type { SetIn } from '@/api/domain'
import { useAuthStore } from '@/stores/auth'
import { displayToKg } from '@/utils/units'
import BkButton from '@/lib/BkButton.vue'
import BkSelect from '@/lib/BkSelect.vue'
import BkStepper from '@/lib/BkStepper.vue'

// measurement viaja como string (no el union Measurement) para que el padre
// pueda pasarlo directo desde ExerciseOut sin acoplar el tipo del componente
const props = defineProps<{ measurement: string }>()
const emit = defineEmits<{ submit: [value: SetIn] }>()

const { t } = useI18n()
const auth = useAuthStore()

const units = computed(() => ((auth.user?.units as 'kg' | 'lb') || 'kg'))

// valores por defecto razonables; se mantienen entre series del mismo bloque
// (no se resetean tras cada submit) para no repetir el mismo tecleo en cada serie
const reps = ref(8)
const weightDisplay = ref(props.measurement === 'strength' ? 20 : 0)
const durationSeconds = ref(props.measurement === 'cardio' ? 60 : 30)
const distanceM = ref(0)
const isWarmup = ref(false)
const rpe = ref('')

const rpeOptions = computed(() => [
  { value: '', label: '—' },
  ...[6, 7, 8, 9, 10].map((n) => ({ value: String(n), label: String(n) })),
])

function submit() {
  const value: SetIn = { is_warmup: isWarmup.value }

  if (props.measurement === 'strength') {
    value.reps = reps.value
    value.weight_kg = displayToKg(weightDisplay.value, units.value)
  } else if (props.measurement === 'bodyweight') {
    value.reps = reps.value
    if (weightDisplay.value > 0) value.weight_kg = displayToKg(weightDisplay.value, units.value)
  } else if (props.measurement === 'timed') {
    value.duration_seconds = durationSeconds.value
  } else if (props.measurement === 'cardio') {
    value.duration_seconds = durationSeconds.value
    if (distanceM.value > 0) value.distance_m = distanceM.value
  }

  if (rpe.value) value.rpe = Number(rpe.value)

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
        <BkStepper v-model="weightDisplay" :step="2.5" :min="0" :max="500" :suffix="units" />
      </div>
      <div>
        <span class="block text-xs text-ink-muted mb-2">{{ t('workout.reps') }}</span>
        <BkStepper v-model="reps" :step="1" :min="0" :max="100" />
      </div>
    </div>

    <div v-else-if="measurement === 'bodyweight'" class="flex flex-wrap gap-4">
      <div>
        <span class="block text-xs text-ink-muted mb-2">{{ t('workout.reps') }}</span>
        <BkStepper v-model="reps" :step="1" :min="0" :max="100" />
      </div>
      <div>
        <span class="block text-xs text-ink-muted mb-2">{{ t('workout.weightOptional') }}</span>
        <BkStepper v-model="weightDisplay" :step="2.5" :min="0" :max="500" :suffix="units" />
      </div>
    </div>

    <div v-else-if="measurement === 'timed'">
      <span class="block text-xs text-ink-muted mb-2">{{ t('workout.duration') }}</span>
      <BkStepper v-model="durationSeconds" :step="15" :min="0" :max="3600" suffix="s" />
    </div>

    <div v-else-if="measurement === 'cardio'" class="flex flex-wrap gap-4">
      <div>
        <span class="block text-xs text-ink-muted mb-2">{{ t('workout.duration') }}</span>
        <BkStepper v-model="durationSeconds" :step="60" :min="0" :max="21600" suffix="s" />
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

    <BkButton type="submit" variant="primary" block>{{ t('workout.logSet') }}</BkButton>
  </form>
</template>

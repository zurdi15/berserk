<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'

import BkButton from '@/lib/BkButton.vue'
import BkSheet from '@/lib/BkSheet.vue'
import BkStepper from '@/lib/BkStepper.vue'
import {
  CARDIO_DURATION_MAX_SECONDS,
  CARDIO_DURATION_MIN_SECONDS,
  CARDIO_DURATION_PRESETS_MINUTES,
  CARDIO_DURATION_STEP_SECONDS,
  formatDuration,
} from './duration'

// v0.11.5 (zurdi: "cuando se inicia un ejercicio de cardio se tiene que poder
// elegir cuánto tiempo vas a hacer ese cardio"): desde la v0.10.0 "Empezar"
// arrancaba el countdown a ciegas con el objetivo heredado (última vez /
// rutina / 20:00 por defecto) y no había forma de tocarlo sin irse al cajón —
// el timer se leía como algo "asociado al ejercicio" en vez de una decisión
// del momento. Este sheet es esa decisión: presets en minutos para lo normal,
// stepper para afinar, y el botón repite la etiqueta de la card ("Empezar
// 20:00") para que se vea exactamente qué se va a arrancar.
const props = defineProps<{ open: boolean; targetSeconds: number }>()
const emit = defineEmits<{ close: []; start: [seconds: number] }>()

const { t } = useI18n()

const seconds = ref(props.targetSeconds)

// cada apertura parte del objetivo ACTUAL de la card: si ya era el bueno, el
// paso extra es abrir y darle a Empezar; si no, se cambia aquí mismo
watch(
  () => props.open,
  (open) => {
    if (open) seconds.value = props.targetSeconds
  },
)

const label = computed(() => formatDuration(seconds.value))
</script>

<template>
  <BkSheet :open="open" :title="t('workout.cardio.howLong')" @close="emit('close')">
    <div class="flex flex-col items-center gap-4 p-4" data-testid="cardio-duration-picker">
      <div class="w-full max-w-64">
        <BkStepper
          v-model="seconds"
          :step="CARDIO_DURATION_STEP_SECONDS"
          :min="CARDIO_DURATION_MIN_SECONDS"
          :max="CARDIO_DURATION_MAX_SECONDS"
          :display="label"
        />
      </div>
      <div class="flex flex-wrap justify-center gap-1">
        <button
          v-for="minutes in CARDIO_DURATION_PRESETS_MINUTES"
          :key="minutes"
          type="button"
          class="bk-press px-3 py-1.5 rounded-sm border text-sm"
          :class="minutes * 60 === seconds ? 'border-aurora text-aurora bg-aurora/10' : 'border-line text-ink-muted'"
          :aria-pressed="minutes * 60 === seconds ? 'true' : 'false'"
          :data-testid="`cardio-duration-preset-${minutes}`"
          @click="seconds = minutes * 60"
        >
          {{ t('workout.cardio.minutesShort', { n: minutes }) }}
        </button>
      </div>
      <BkButton
        variant="primary"
        block
        data-testid="cardio-start-confirm"
        @click="emit('start', seconds)"
      >
        {{ t('workout.cardioStart', { duration: label }) }}
      </BkButton>
    </div>
  </BkSheet>
</template>

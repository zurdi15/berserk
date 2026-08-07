<script setup lang="ts">
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'

import type { Measurement, SetIn, SetOut } from '@/api/domain'
import { displayToKg, kgToDisplay } from '@/utils/units'
import BkButton from '@/lib/BkButton.vue'
import BkSelect from '@/lib/BkSelect.vue'
import BkStepper from '@/lib/BkStepper.vue'
import CardioCountdown from './CardioCountdown.vue'

const props = withDefaults(
  defineProps<{
    measurement: Measurement
    units?: 'kg' | 'lb'
    // precarga desde una serie existente (edición) o desde el default
    // calculado por item 2 (registro nuevo) — Partial porque el default de
    // objetivo de rutina no trae id/set_number/completed_at (ver
    // setDefaults.ts::resolveNewSetDefaults y WorkoutExerciseCard.vue)
    initialSet?: Partial<SetOut> | null
    editing?: boolean
    // item 7: el countdown de cardio solo tiene sentido registrando EN VIVO
    // (WorkoutView), no en el editor retroactivo — mismo criterio que
    // restEnabled de WorkoutExerciseCard, pasado explícito aquí porque
    // SetForm no conoce ese prop
    live?: boolean
  }>(),
  { units: 'kg', initialSet: null, editing: false, live: true },
)
// keepOpen (item 1): false = "Registrar serie" (cierra el cajón), true =
// "Registrar y otra" (se queda abierto, valores conservados para la
// siguiente serie — ver WorkoutExerciseCard.vue)
//
// v0.3.2 CARDIO-COUNTDOWN PERSISTENCE: countdownStart/countdownCancel son la
// señal mínima hacia WorkoutExerciseCard — SetForm es quien conoce
// duration_seconds/distance_m en el instante justo de arrancar/cancelar el
// countdown, pero es WorkoutExerciseCard quien conoce workoutId/
// workoutExerciseId para persistirlo en localStorage (ver uiPrefs.ts). El
// 'done' normal (countdown llega a 0 solo) NO necesita una señal aparte: ya
// dispara 'submit' más abajo, que es donde WorkoutExerciseCard limpia
// cualquier countdown persistido de este ejercicio tras loguear la serie.
const emit = defineEmits<{
  submit: [value: SetIn, keepOpen: boolean]
  countdownStart: [payload: { targetSeconds: number; distanceM?: number }]
  countdownCancel: []
}>()

const { t } = useI18n()

const units = computed(() => props.units)

// paso/valores por defecto en el espacio de la unidad del usuario: 2.5 kg es
// un incremento natural, 2.5 lb no lo es (los discos son de 5 lb)
const WEIGHT_UI = {
  kg: { step: 2.5, initial: 20, max: 500 },
  lb: { step: 5, initial: 45, max: 1100 },
} as const

// valores por defecto razonables; se mantienen entre series del mismo bloque
// (no se resetean tras cada submit) para no repetir el mismo tecleo en cada serie.
// En modo edición, el punto de partida es la serie que se está corrigiendo;
// en modo alta, el punto de partida es la cadena de defaults del item 2.
const reps = ref(props.initialSet?.reps ?? 8)
const weightDisplay = ref(
  props.initialSet?.weight_kg != null
    ? kgToDisplay(props.initialSet.weight_kg, props.units)
    : (props.measurement === 'strength' ? WEIGHT_UI[props.units].initial : 0),
)
const durationSeconds = ref(props.initialSet?.duration_seconds ?? (props.measurement === 'cardio' ? 60 : 30))
const distanceM = ref(props.initialSet?.distance_m ?? 0)
const isWarmup = ref(props.initialSet?.is_warmup ?? false)
const rpe = ref(props.initialSet?.rpe != null ? String(props.initialSet.rpe) : '')

// item 7: pantalla completa del cajón sustituida por el countdown mientras
// corre — nunca en edición (corregir una serie pasada no es "vivirla ahora")
const countdownActive = ref(false)

const rpeOptions = computed(() => [
  { value: '', label: '' },
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

function submit(keepOpen: boolean) {
  const value = buildValue()
  if (!value) return
  emit('submit', value, keepOpen)
  // el calentamiento es por serie: no debe arrastrarse a la siguiente sin querer
  isWarmup.value = false
}

// item 7: el countdown llega a 0 solo — se registra con la duración objetivo
// exacta (no lo que haya tardado en tickear) y SIEMPRE cierra el cajón (como
// "Registrar serie"): no tiene sentido dejarlo abierto para "otra" cuando la
// serie se acaba de auto-completar
function onCountdownDone() {
  countdownActive.value = false
  submit(false)
}

function startCountdown() {
  countdownActive.value = true
  emit('countdownStart', {
    targetSeconds: durationSeconds.value,
    distanceM: distanceM.value > 0 ? distanceM.value : undefined,
  })
}

function onCountdownCancel() {
  countdownActive.value = false
  emit('countdownCancel')
}
</script>

<template>
  <CardioCountdown
    v-if="countdownActive"
    :target-seconds="durationSeconds"
    @done="onCountdownDone"
    @cancel="onCountdownCancel"
  />

  <form v-else class="space-y-3 flex flex-col items-center" @submit.prevent="submit(false)">
    <!-- item 4a: todo el contenido del formulario se centra (flex-col
         items-center en el <form>) — antes quedaba pegado al borde
         izquierdo del cajón -->
    <!-- item 4b: peso y reps SIEMPRE en dos columnas fijas (grid, no
         flex-wrap) — con flex-wrap, un valor x.5 ("22.5 kg" vs "20 kg")
         ensanchaba el bloque de peso lo justo para tirar el de reps a su
         propia línea. Con grid grid-cols-2 cada columna tiene un ancho FIJO
         (independiente del contenido); min-w-0 es la garantía estándar de
         Tailwind para que ese contenido nunca fuerce la columna a crecer -->
    <div v-if="measurement === 'strength'" class="w-full grid grid-cols-2 gap-2 bk-set-grid">
      <div class="min-w-0 flex flex-col items-center bk-set-col-weight">
        <span class="block text-xs text-ink-muted mb-2">{{ t('workout.weight') }}</span>
        <BkStepper v-model="weightDisplay" size="compact" :step="WEIGHT_UI[units].step" :min="2.5" :max="WEIGHT_UI[units].max" :suffix="units" />
      </div>
      <div class="min-w-0 flex flex-col items-center bk-set-col-reps">
        <span class="block text-xs text-ink-muted mb-2">{{ t('workout.reps') }}</span>
        <BkStepper v-model="reps" size="compact" :step="1" :min="1" :max="100" />
      </div>
    </div>

    <div v-else-if="measurement === 'bodyweight'" class="w-full grid grid-cols-2 gap-2 bk-set-grid">
      <div class="min-w-0 flex flex-col items-center bk-set-col-reps">
        <span class="block text-xs text-ink-muted mb-2">{{ t('workout.reps') }}</span>
        <BkStepper v-model="reps" size="compact" :step="1" :min="1" :max="100" />
      </div>
      <div class="min-w-0 flex flex-col items-center bk-set-col-weight">
        <span class="block text-xs text-ink-muted mb-2">{{ t('workout.weightOptional') }}</span>
        <BkStepper v-model="weightDisplay" size="compact" :step="WEIGHT_UI[units].step" :min="0" :max="WEIGHT_UI[units].max" :suffix="units" />
      </div>
    </div>

    <div v-else-if="measurement === 'timed'" class="flex flex-col items-center">
      <span class="block text-xs text-ink-muted mb-2">{{ t('workout.duration') }}</span>
      <BkStepper v-model="durationSeconds" :step="15" :min="1" :max="3600" suffix="s" />
    </div>

    <div v-else-if="measurement === 'cardio'" class="w-full space-y-3 flex flex-col items-center">
      <div class="w-full grid grid-cols-2 gap-2 bk-set-grid">
        <div class="min-w-0 flex flex-col items-center bk-set-col-duration">
          <span class="block text-xs text-ink-muted mb-2">{{ t('workout.duration') }}</span>
          <BkStepper v-model="durationSeconds" size="compact" :step="60" :min="1" :max="21600" suffix="s" />
        </div>
        <div class="min-w-0 flex flex-col items-center bk-set-col-distance">
          <span class="block text-xs text-ink-muted mb-2">{{ t('workout.distanceOptional') }}</span>
          <BkStepper v-model="distanceM" size="compact" :step="100" :min="0" :max="100000" suffix="m" />
        </div>
      </div>
      <BkButton
        v-if="!editing && live"
        type="button"
        variant="ghost"
        data-testid="cardio-start-countdown"
        @click="startCountdown"
      >
        {{ t('workout.startCountdown') }}
      </BkButton>
    </div>

    <!-- item 4c: el calentamiento ya no comparte fila con el RPE, cada uno
         en la suya -->
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

    <div class="w-full max-w-32">
      <BkSelect v-model="rpe" :label="t('workout.rpe')" :options="rpeOptions" />
    </div>

    <div class="flex gap-2 w-full">
      <BkButton
        v-if="!editing"
        type="button"
        variant="ghost"
        class="flex-1"
        data-testid="log-set-and-another"
        @click="submit(true)"
      >
        {{ t('workout.logSetAndAnother') }}
      </BkButton>
      <BkButton type="submit" variant="primary" class="flex-1">
        {{ editing ? t('common.save') : t('workout.logSet') }}
      </BkButton>
    </div>
  </form>
</template>

<style scoped>
/* item 4b (round anterior): BkStepper.vue le da al valor un min-width, no un
   ancho fijo: con pesos x.5 ("22.5 kg" frente a "20 kg") la fila entera del
   stepper cambiaba de tamaño. Aquí, solo para las columnas del cajón de
   series (.bk-set-grid), se fija un ancho CONSTANTE al slot del valor con
   :deep() — acotado a este componente y no alcanza a CardioCountdown (vive
   en este archivo pero fuera de la rejilla) ni a otros consumidores de
   BkStepper (p.ej. RoutineEditorSheet).

   item 2 (post-0.3.0): en un móvil real, "md" + gap-3 + 6rem por columna NO
   cabía en dos columnas desde 360px — la "−" de Peso y el stepper de Reps
   se solapaban. Aritmética del arreglo (size="compact" en BkStepper: botón
   2rem, gap interno 1.5rem/2 = 0.375rem×2, ver BkStepper.vue):
     por stepper = 2rem(botón) + 0.375rem(gap) + VALOR + 0.375rem(gap) + 2rem(botón)
                 = 4.75rem + VALOR
   Peso/Reps (fila strength y bodyweight):
     Peso  (VALOR 5rem, cabe "888.8kg" con margen) → 9.75rem
     Reps  (VALOR 2.75rem, cabe "100")             → 7.5rem
     total = 9.75 + 7.5 + 0.5rem (gap-2 de la rejilla) = 17.75rem = 284px
   Duración/Distancia (fila cardio):
     Duración  (VALOR 4rem, cabe "21600s")   → 8.75rem
     Distancia (VALOR 4.5rem, cabe "100000m") → 9.25rem
     total = 8.75 + 9.25 + 0.5rem = 18.5rem = 296px
   Ambas filas ≤ 328px (360px de viewport − 2rem de padding del BkSheet, p-4
   a cada lado) — el peor caso real, con margen. */
.bk-set-col-weight :deep(.bk-metric) {
  width: 5rem;
}
.bk-set-col-reps :deep(.bk-metric) {
  width: 2.75rem;
}
.bk-set-col-duration :deep(.bk-metric) {
  width: 4rem;
}
.bk-set-col-distance :deep(.bk-metric) {
  width: 4.5rem;
}
</style>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'

import type { LoadMode, Measurement, SetIn, SetOut } from '@/api/domain'
import { displayToKg, kgToDisplay } from '@/utils/units'
import BkButton from '@/lib/BkButton.vue'
import BkSelect from '@/lib/BkSelect.vue'
import BkStepper from '@/lib/BkStepper.vue'
import { CARDIO_DURATION_MAX_SECONDS, CARDIO_DURATION_STEP_SECONDS, formatDuration } from './duration'
import PlateCalculatorSheet from './PlateCalculatorSheet.vue'

const props = withDefaults(
  defineProps<{
    measurement: Measurement
    // v0.17.0 (zurdi: "números planos, del 1 al 20, en vez de kg"): en modo
    // 'level' la columna de carga es un stepper plano (paso 1, sin unidad,
    // sin conversión kg/lb y sin calculadora de discos)
    loadMode?: LoadMode
    units?: 'kg' | 'lb'
    // precarga desde una serie existente (edición) o desde el default
    // calculado por item 2 (registro nuevo) — Partial porque el default de
    // objetivo de rutina no trae id/set_number/completed_at (ver
    // setDefaults.ts::resolveNewSetDefaults y WorkoutExerciseCard.vue)
    initialSet?: Partial<SetOut> | null
    editing?: boolean
    // v0.9.4 (zurdi: "no debería haber un añadir cardio"): el formulario de
    // cardio vive PERMANENTE en el cuerpo de la tarjeta, no tras un botón.
    // En ese modo "Registrar y otra" sobra: el formulario nunca se cierra,
    // así que ambas variantes de submit harían exactamente lo mismo
    inline?: boolean
  }>(),
  { loadMode: 'weight', units: 'kg', initialSet: null, editing: false, inline: false },
)
// keepOpen (item 1): false = "Registrar serie" (cierra el cajón), true =
// "Registrar y otra" (se queda abierto, valores conservados para la
// siguiente serie — ver WorkoutExerciseCard.vue)
//
// v0.11.6 (zurdi: "esa opción ya está al lado de registrar tiempo, en un
// step anterior"): el countdown del CAJÓN murió — arrancar cardio es cosa
// exclusiva del "Empezar" de la card (CardioStartSheet → startCardio), el
// cajón solo registra tiempos ya hechos. Con él se fueron los emits
// countdownStart/countdownCancel y el prop `live` que solo gateaba ese botón.
const emit = defineEmits<{
  submit: [value: SetIn, keepOpen: boolean]
}>()

const { t } = useI18n()

// item 11 (v0.4.3, zurdi): el <style scoped> que vivía aquí (ancho FIJO por
// :deep(.bk-metric), uno por columna vía .bk-set-col-*) queda retirado — era
// el arreglo del jitter de pesos x.5 empujando el botón "+" (ver git
// history), pero dependía de que el ancho del VALOR determinara dónde caían
// los botones. BkStepper.vue ahora se estabiliza a sí mismo (w-full +
// justify-between: los botones se pinnean a los bordes del contenedor, el
// valor cambia de ancho SIN moverlos) — la fijación por columna de aquí ya
// no aportaba nada, solo duplicaba la lógica de estabilidad en dos sitios.
// Las columnas grid-cols-2 del template siguen dándole a cada BkStepper un
// ancho ACOTADO (el propio track de la columna), que es todo lo que el
// nuevo modelo necesita.
const units = computed(() => props.units)

// paso/valores por defecto en el espacio de la unidad del usuario: 2.5 kg es
// un incremento natural, 2.5 lb no lo es (los discos son de 5 lb)
const WEIGHT_UI = {
  kg: { step: 2.5, initial: 20, max: 500 },
  lb: { step: 5, initial: 45, max: 1100 },
} as const

// v0.17.0 modo nivel: número plano de máquina — el valor viaja TAL CUAL en
// weight_kg (sin displayToKg/kgToDisplay: el nivel 12 es 12 en cualquier
// unidad). Rango generoso (zurdi dijo "del 1 al 20" pero hay máquinas con
// más posiciones); paso siempre 1.
const LEVEL_UI = { step: 1, initial: 10, max: 100 } as const
const isLevel = computed(() => props.loadMode === 'level')
const loadStep = computed(() => (isLevel.value ? LEVEL_UI.step : WEIGHT_UI[props.units].step))
const loadMax = computed(() => (isLevel.value ? LEVEL_UI.max : WEIGHT_UI[props.units].max))
const loadSuffix = computed(() => (isLevel.value ? '' : props.units))
const loadLabel = computed(() => t(isLevel.value ? 'workout.level' : 'workout.weight'))
const loadLabelOptional = computed(() =>
  t(isLevel.value ? 'workout.levelOptional' : 'workout.weightOptional'),
)

// valores por defecto razonables; se mantienen entre series del mismo bloque
// (no se resetean tras cada submit) para no repetir el mismo tecleo en cada serie.
// En modo edición, el punto de partida es la serie que se está corrigiendo;
// en modo alta, el punto de partida es la cadena de defaults del item 2.
const reps = ref(props.initialSet?.reps ?? 8)
const weightDisplay = ref(
  props.initialSet?.weight_kg != null
    ? (props.loadMode === 'level'
        ? props.initialSet.weight_kg
        : kgToDisplay(props.initialSet.weight_kg, props.units))
    : (props.measurement === 'strength'
        ? (props.loadMode === 'level' ? LEVEL_UI.initial : WEIGHT_UI[props.units].initial)
        : 0),
)
const durationSeconds = ref(props.initialSet?.duration_seconds ?? (props.measurement === 'cardio' ? 60 : 30))
const distanceM = ref(props.initialSet?.distance_m ?? 0)
const isWarmup = ref(props.initialSet?.is_warmup ?? false)
const rpe = ref(props.initialSet?.rpe != null ? String(props.initialSet.rpe) : '')

// v0.12.0 (backlog "calculadora de discos"): sheet apilado sobre el cajón
// (layerStack, mismo patrón que los drawers internos de MuscleGroupManager)
const plateCalcOpen = ref(false)

// v0.11.5: lo que se PINTA en el stepper de duración de cardio (el valor sigue
// viajando en segundos, ver BkStepper::display)
const cardioDurationLabel = computed(() => formatDuration(durationSeconds.value))

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
      // modo nivel: el número plano viaja tal cual, sin conversión de unidad
      value.weight_kg = isLevel.value
        ? weightDisplay.value
        : displayToKg(weightDisplay.value, units.value)
      break
    case 'bodyweight':
      value.reps = reps.value
      if (weightDisplay.value > 0) {
        value.weight_kg = isLevel.value
          ? weightDisplay.value
          : displayToKg(weightDisplay.value, units.value)
      }
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
</script>

<template>
  <form class="space-y-3 flex flex-col items-center" @submit.prevent="submit(false)">
    <!-- item 4a: todo el contenido del formulario se centra (flex-col
         items-center en el <form>) — antes quedaba pegado al borde
         izquierdo del cajón -->
    <!-- item 4b: peso y reps SIEMPRE en dos columnas fijas (grid, no
         flex-wrap) — con flex-wrap, un valor x.5 ("22.5 kg" vs "20 kg")
         ensanchaba el bloque de peso lo justo para tirar el de reps a su
         propia línea. Con grid grid-cols-2 cada columna tiene un ancho FIJO
         (independiente del contenido); min-w-0 es la garantía estándar de
         Tailwind para que ese contenido nunca fuerce la columna a crecer -->
    <!-- v0.17.0: en modo nivel el stepper de carga es plano (paso 1, sin
         unidad) y la calculadora de discos no aplica — un nivel de máquina
         no se compone con discos -->
    <div v-if="measurement === 'strength'" class="w-full space-y-2">
      <div class="w-full grid grid-cols-2 gap-2">
        <div class="min-w-0 flex flex-col items-center">
          <span class="block text-xs text-ink-muted mb-2">{{ loadLabel }}</span>
          <BkStepper v-model="weightDisplay" size="compact" :step="loadStep" :min="isLevel ? 1 : 2.5" :max="loadMax" :suffix="loadSuffix" />
        </div>
        <div class="min-w-0 flex flex-col items-center">
          <span class="block text-xs text-ink-muted mb-2">{{ t('workout.reps') }}</span>
          <BkStepper v-model="reps" size="compact" :step="1" :min="1" :max="100" />
        </div>
      </div>
      <!-- v0.12.0: calculadora de discos — abre con el peso actual como
           objetivo; solo tiene sentido con barra (fuerza en kg) -->
      <div v-if="!isLevel" class="flex justify-center">
        <BkButton type="button" variant="ghost" size="sm" data-testid="plate-calc-open" @click="plateCalcOpen = true">
          {{ t('workout.plates.open') }}
        </BkButton>
      </div>
    </div>

    <div v-else-if="measurement === 'bodyweight'" class="w-full grid grid-cols-2 gap-2">
      <div class="min-w-0 flex flex-col items-center">
        <span class="block text-xs text-ink-muted mb-2">{{ t('workout.reps') }}</span>
        <BkStepper v-model="reps" size="compact" :step="1" :min="1" :max="100" />
      </div>
      <div class="min-w-0 flex flex-col items-center">
        <span class="block text-xs text-ink-muted mb-2">{{ loadLabelOptional }}</span>
        <BkStepper v-model="weightDisplay" size="compact" :step="loadStep" :min="0" :max="loadMax" :suffix="loadSuffix" />
      </div>
    </div>

    <div v-else-if="measurement === 'timed'" class="w-full flex flex-col items-center">
      <span class="block text-xs text-ink-muted mb-2">{{ t('workout.duration') }}</span>
      <BkStepper v-model="durationSeconds" :step="15" :min="1" :max="3600" suffix="s" />
    </div>

    <div v-else-if="measurement === 'cardio'" class="w-full space-y-3 flex flex-col items-center">
      <div class="w-full grid grid-cols-2 gap-2">
        <div class="min-w-0 flex flex-col items-center">
          <span class="block text-xs text-ink-muted mb-2">{{ t('workout.duration') }}</span>
          <!-- v0.11.5: mm:ss en vez de "1200 s" — es la misma duración que la
               card anuncia en "Empezar 20:00" y que pinta el countdown;
               leerla en dos formatos distintos era parte de por qué el timer
               parecía ajeno a lo que hay en el cajón -->
          <BkStepper
            v-model="durationSeconds"
            size="compact"
            :step="CARDIO_DURATION_STEP_SECONDS"
            :min="1"
            :max="CARDIO_DURATION_MAX_SECONDS"
            :display="cardioDurationLabel"
          />
        </div>
        <div class="min-w-0 flex flex-col items-center">
          <span class="block text-xs text-ink-muted mb-2">{{ t('workout.distanceOptional') }}</span>
          <BkStepper v-model="distanceM" size="compact" :step="100" :min="0" :max="100000" suffix="m" />
        </div>
      </div>
      <!-- v0.11.6 (zurdi): el botón "Empezar" que vivía aquí murió — esa
           opción ya está en la card, al lado de "Registrar tiempo"; este
           cajón solo registra un tiempo ya hecho -->
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

    <PlateCalculatorSheet
      v-if="measurement === 'strength' && !isLevel"
      :open="plateCalcOpen"
      :target-weight="weightDisplay"
      :units="units"
      @close="plateCalcOpen = false"
    />

    <div class="flex gap-2 w-full">
      <BkButton
        v-if="!editing && !inline"
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


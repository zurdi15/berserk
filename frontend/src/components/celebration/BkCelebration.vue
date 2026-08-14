<script setup lang="ts">
import { onBeforeUnmount, onMounted, reactive, ref, useId } from 'vue'
import { useI18n } from 'vue-i18n'

import type { PersonalRecordOut } from '@/api/domain'
import BkRune from '@/lib/BkRune.vue'
import type { RuneName } from '@/lib/runes'
import { core } from '@/tokens'
import { formatWeight } from '@/utils/units'

const props = withDefaults(
  // v0.17.0 plainLoad: el ejercicio del récord va en modo nivel — el valor
  // se pinta como número plano, sin unidad ni conversión (lo computa quien
  // monta, que es quien tiene el catálogo; ver WorkoutView)
  defineProps<{ records: PersonalRecordOut[]; runeName: RuneName; units?: 'kg' | 'lb'; plainLoad?: boolean }>(),
  { units: 'kg', plainLoad: false },
)
const emit = defineEmits<{ done: [] }>()

const { t } = useI18n()
const titleId = useId()
const panel = ref<HTMLElement | null>(null)
let lastFocused: HTMLElement | null = null

// duración del conteo: tomada directamente de los tokens (única fuente de
// verdad), en vez de un número hardcodeado que puede desincronizarse
const COUNT_UP_MS = parseInt(core.dur[4], 10)
const AUTO_DISMISS_MS = 3000

// cada valor arranca en 0 y cuenta hasta el real; con reduced-motion se salta
// directo al valor final, sin pasar por frames intermedios. El overlay bloquea
// toda interacción con el resto de la página (fixed inset-0), así que `records`
// no puede cambiar de tamaño mientras esta instancia sigue viva
const displayValues = reactive(props.records.map(() => 0))

let rafId: number | null = null
let dismissTimer: ReturnType<typeof setTimeout> | null = null
let dismissed = false

// todos los kinds de récord (max_weight, est_1rm, max_volume) vienen del backend
// en kg — mismo formateador que FinishSummary, para que el mismo PR no cambie
// de aspecto entre la celebración y el resumen
function formatValue(value: number): string {
  return props.plainLoad ? `${value}` : formatWeight(value, props.units)
}

function countUp() {
  const start = performance.now()
  const step = (now: number) => {
    const progress = Math.min(1, (now - start) / COUNT_UP_MS)
    props.records.forEach((record, i) => {
      // redondeado a 1 decimal en kg: sin esto el paso intermedio muestra colas
      // de decimales feas antes de convertir a la unidad de salida
      displayValues[i] = Math.round(record.value * progress * 10) / 10
    })
    rafId = progress < 1 ? requestAnimationFrame(step) : null
  }
  rafId = requestAnimationFrame(step)
}

// guardia contra doble emisión: un tap justo antes del auto-dismiss, o dos
// taps seguidos, no deben mandar 'done' dos veces al padre
function dismiss() {
  if (dismissed) return
  dismissed = true
  if (dismissTimer) clearTimeout(dismissTimer)
  if (rafId !== null) cancelAnimationFrame(rafId)
  emit('done')
}

function onKey(event: KeyboardEvent) {
  if (event.key === 'Escape') dismiss()
}

onMounted(() => {
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  if (reducedMotion) {
    props.records.forEach((record, i) => {
      displayValues[i] = record.value
    })
  } else {
    countUp()
  }
  dismissTimer = setTimeout(dismiss, AUTO_DISMISS_MS)

  // mismo contrato de foco que BkSheet: un overlay a pantalla completa se
  // anuncia y se puede cerrar sin ratón/dedo, y el foco vuelve a quien lo abrió
  lastFocused = document.activeElement as HTMLElement | null
  panel.value?.focus()
  window.addEventListener('keydown', onKey)
})

onBeforeUnmount(() => {
  if (rafId !== null) cancelAnimationFrame(rafId)
  if (dismissTimer) clearTimeout(dismissTimer)
  window.removeEventListener('keydown', onKey)
  lastFocused?.focus()
})
</script>

<template>
  <Teleport to="body">
    <!-- v0.9.4 (zurdi: "más smooth la transición a la runa"): el overlay
         entero entra con un fade (bk-fade both) en vez de aparecer de golpe
         — la runa ya se talla sola (bk-carve) una vez visible -->
    <div
      ref="panel"
      class="fixed inset-0 z-(--bk-z-timer) bg-void/95 flex flex-col items-center justify-center gap-3 px-6 text-center bk-celebration-enter"
      data-testid="celebration-overlay"
      role="dialog"
      aria-modal="true"
      :aria-labelledby="titleId"
      tabindex="-1"
      @click="dismiss"
    >
      <div class="absolute inset-0 bk-ember-flash pointer-events-none" aria-hidden="true" />

      <BkRune class="relative" :name="runeName" :size="96" carve tone="ember" />

      <h2 :id="titleId" class="relative font-display font-semibold uppercase tracking-wider text-ember text-lg">
        {{ t('workout.newRecord') }}
      </h2>

      <p
        v-for="(record, i) in records"
        :key="record.id"
        class="relative bk-metric text-ember text-xl"
        :data-testid="`celebration-record-${record.id}`"
      >
        {{ t(`progress.kinds.${record.kind}`) }} — {{ formatValue(displayValues[i]) }}
      </p>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { onBeforeUnmount, onMounted, reactive, ref, useId } from 'vue'
import { useI18n } from 'vue-i18n'

import type { PersonalRecordOut } from '@/api/domain'
import BkRune from '@/lib/BkRune.vue'
import type { RuneName } from '@/lib/runes'

const props = defineProps<{ records: PersonalRecordOut[]; runeName: RuneName }>()
const emit = defineEmits<{ done: [] }>()

const { t } = useI18n()
const titleId = useId()
const panel = ref<HTMLElement | null>(null)
let lastFocused: HTMLElement | null = null

// duración del conteo en ms: refleja --bk-dur-4 (600ms). No se puede leer una
// custom property calculada de forma fiable en jsdom/happy-dom, así que el
// valor vive también aquí, en sincronía con tokens.css
const COUNT_UP_MS = 600
const AUTO_DISMISS_MS = 3000

// cada valor arranca en 0 y cuenta hasta el real; con reduced-motion se salta
// directo al valor final, sin pasar por frames intermedios. El overlay bloquea
// toda interacción con el resto de la página (fixed inset-0), así que `records`
// no puede cambiar de tamaño mientras esta instancia sigue viva
const displayValues = reactive(props.records.map(() => 0))

let rafId: number | null = null
let dismissTimer: ReturnType<typeof setTimeout> | null = null
let dismissed = false

function formatValue(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(1)
}

function countUp() {
  const start = performance.now()
  const step = (now: number) => {
    const progress = Math.min(1, (now - start) / COUNT_UP_MS)
    props.records.forEach((record, i) => {
      displayValues[i] = record.value * progress
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
    <div
      ref="panel"
      class="fixed inset-0 z-(--bk-z-timer) bg-void/95 flex flex-col items-center justify-center gap-3 px-6 text-center"
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

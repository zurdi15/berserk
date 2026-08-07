<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'

import BkButton from '@/lib/BkButton.vue'
import { core } from '@/tokens'

// item 7: "botón empezar → countdown de la duración objetivo; al acabar, la
// serie se registra sola con ese tiempo". Toma el revelo completo del cajón
// (lo monta SetForm en vez de sus campos, ver SetForm.vue) mientras corre.
// v0.3.2 CARDIO-COUNTDOWN PERSISTENCE: `endsAt` opcional deja SEMBRAR el
// timestamp real de fin en vez de recalcularlo desde targetSeconds — así un
// countdown RESUMIDO (la pestaña volvió con el countdown todavía corriendo,
// ver uiPrefs.ts::PersistedCardioCountdown y WorkoutExerciseCard.vue) arranca
// en el remaining correcto en vez de en targetSeconds completo otra vez. Sin
// endsAt, el comportamiento es el de siempre (arranque fresco desde ahora).
const props = defineProps<{ targetSeconds: number; endsAt?: number }>()
const emit = defineEmits<{ done: []; cancel: [] }>()

const { t } = useI18n()

// timestamp ABSOLUTO de fin, no conteo de ticks: mismo principio que
// stores/restTimer.ts — si la pestaña se congela en segundo plano, el
// próximo tick calcula lo que de verdad queda en vez de arrastrar un
// contador que se quedó parado
const endsAt = props.endsAt ?? Date.now() + Math.max(0, props.targetSeconds) * 1000
const now = ref(Date.now())
let ticker: ReturnType<typeof setInterval> | null = null
let holdTimeout: ReturnType<typeof setTimeout> | null = null

// v0.9.4 (zurdi: "más feedback de que el timer ha terminado" + "salida más
// smooth"): al llegar a 0 ya no se emite 'done' en el mismo tick — primero
// un estado de FIN visible (0:00 con pulso + halo aurora + "¡Tiempo!", el
// cancelar desaparece: la serie está a punto de registrarse) que se sostiene
// FINISH_HOLD_MS antes de emitir. La salida animada en sí (el swap de vuelta
// al formulario/tarjeta) vive en el padre vía la Transition bk-timer-swap —
// aquí solo se decide CUÁNDO arranca.
const FINISH_HOLD_MS = parseInt(core.dur[5], 10)
const finished = ref(false)

const remaining = computed(() => Math.max(0, Math.round((endsAt - now.value) / 1000)))
const label = computed(() => {
  const m = Math.floor(remaining.value / 60)
  const s = String(remaining.value % 60).padStart(2, '0')
  return `${m}:${s}`
})

function tick() {
  now.value = Date.now()
  if (remaining.value > 0 || finished.value) return
  finished.value = true
  if (ticker) clearInterval(ticker)
  // restTimer.ts vibra igual al terminar, pero es un store de descanso ajeno
  // que este lane no toca (ver instrucciones) — se repite aquí el mismo
  // patrón inline en vez de importar ese store por un único efecto lateral
  navigator.vibrate?.([200, 100, 200])
  holdTimeout = setTimeout(() => emit('done'), FINISH_HOLD_MS)
}

onMounted(() => {
  ticker = setInterval(tick, 250)
  tick()
})
onBeforeUnmount(() => {
  if (ticker) clearInterval(ticker)
  if (holdTimeout) clearTimeout(holdTimeout)
})
</script>

<template>
  <div class="relative flex flex-col items-center gap-6 py-8" data-testid="cardio-countdown">
    <!-- halo de fin: gradiente radial aurora que se enciende (solo opacity)
         detrás del 0:00 — feedback de "terminado" sin salirse de la
         disciplina transform/opacity de animations.css -->
    <div v-if="finished" class="absolute inset-0 bk-timer-done-glow pointer-events-none" aria-hidden="true" />
    <p
      class="relative bk-metric text-6xl text-aurora tabular-nums"
      :class="finished && 'bk-timer-done-pop'"
      data-testid="cardio-countdown-label"
    >
      {{ label }}
    </p>
    <p
      v-if="finished"
      class="relative font-display font-semibold uppercase tracking-wider text-aurora bk-timer-done-rise"
      data-testid="cardio-countdown-done"
      role="status"
    >
      {{ t('workout.cardio.timeUp') }}
    </p>
    <BkButton
      v-else
      variant="ghost"
      data-testid="cardio-countdown-cancel"
      @click="emit('cancel')"
    >
      {{ t('common.cancel') }}
    </BkButton>
  </div>
</template>

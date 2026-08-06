<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'

import BkButton from '@/lib/BkButton.vue'

// item 7: "botón empezar → countdown de la duración objetivo; al acabar, la
// serie se registra sola con ese tiempo". Toma el revelo completo del cajón
// (lo monta SetForm en vez de sus campos, ver SetForm.vue) mientras corre.
const props = defineProps<{ targetSeconds: number }>()
const emit = defineEmits<{ done: []; cancel: [] }>()

const { t } = useI18n()

// timestamp ABSOLUTO de fin, no conteo de ticks: mismo principio que
// stores/restTimer.ts — si la pestaña se congela en segundo plano, el
// próximo tick calcula lo que de verdad queda en vez de arrastrar un
// contador que se quedó parado
const endsAt = Date.now() + Math.max(0, props.targetSeconds) * 1000
const now = ref(Date.now())
let ticker: ReturnType<typeof setInterval> | null = null
let finished = false

const remaining = computed(() => Math.max(0, Math.round((endsAt - now.value) / 1000)))
const label = computed(() => {
  const m = Math.floor(remaining.value / 60)
  const s = String(remaining.value % 60).padStart(2, '0')
  return `${m}:${s}`
})

function tick() {
  now.value = Date.now()
  if (remaining.value > 0 || finished) return
  finished = true
  if (ticker) clearInterval(ticker)
  // restTimer.ts vibra igual al terminar, pero es un store de descanso ajeno
  // que este lane no toca (ver instrucciones) — se repite aquí el mismo
  // patrón inline en vez de importar ese store por un único efecto lateral
  navigator.vibrate?.([200, 100, 200])
  emit('done')
}

onMounted(() => {
  ticker = setInterval(tick, 250)
  tick()
})
onBeforeUnmount(() => {
  if (ticker) clearInterval(ticker)
})
</script>

<template>
  <div class="flex flex-col items-center gap-6 py-8" data-testid="cardio-countdown">
    <p class="bk-metric text-6xl text-aurora tabular-nums" data-testid="cardio-countdown-label">
      {{ label }}
    </p>
    <BkButton variant="ghost" data-testid="cardio-countdown-cancel" @click="emit('cancel')">
      {{ t('common.cancel') }}
    </BkButton>
  </div>
</template>

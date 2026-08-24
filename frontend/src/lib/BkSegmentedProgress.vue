<script setup lang="ts">
import { computed } from 'vue'

// facelift (player): barra de progreso segmentada por bloque, el patrón del
// player de la referencia — un segmento por bloque con su fill fraccional y
// un punto sobre el actual. Cada segmento es un BOTÓN (saltar de bloque),
// con testid parametrizable para que WorkoutView conserve sus block-step-{i}
// históricos sin que la primitiva los conozca.
const props = withDefaults(
  defineProps<{
    segments: { done: number; total: number; label?: string }[]
    current?: number
    testidPrefix?: string
  }>(),
  { testidPrefix: 'progress-segment' },
)
const emit = defineEmits<{ select: [index: number] }>()

const doneAll = computed(() => props.segments.reduce((a, s) => a + s.done, 0))
const totalAll = computed(() => props.segments.reduce((a, s) => a + s.total, 0))

function fillPercent(segment: { done: number; total: number }): number {
  if (segment.total <= 0) return 0
  return Math.round(Math.min(1, segment.done / segment.total) * 100)
}
</script>

<template>
  <div
    role="progressbar"
    aria-valuemin="0"
    :aria-valuemax="totalAll"
    :aria-valuenow="doneAll"
    class="flex items-stretch gap-1"
  >
    <button
      v-for="(segment, i) in segments"
      :key="i"
      type="button"
      class="bk-press flex-1 flex flex-col items-center gap-1 py-1.5 min-w-0"
      :data-testid="`${testidPrefix}-${i}`"
      :aria-label="segment.label"
      :aria-pressed="i === current ? 'true' : 'false'"
      @click="emit('select', i)"
    >
      <!-- punto sobre el segmento actual; en el resto queda invisible pero
           ocupando sitio, para que todas las pistas queden a la misma altura -->
      <span
        class="w-1.5 h-1.5 rounded-full bg-aurora"
        :class="i === current ? 'opacity-100' : 'opacity-0'"
        aria-hidden="true"
      />
      <span
        class="w-full h-1.5 rounded-full bg-line overflow-hidden"
        :class="i === current && 'outline outline-1 outline-aurora/40'"
        aria-hidden="true"
      >
        <!-- v0.39.1: el fill se desliza hasta el ancho nuevo (bk-fill-animate)
             en vez de saltar de golpe al completar un ejercicio -->
        <span
          class="bk-fill-animate block h-full rounded-full"
          :class="i === current ? 'bg-aurora' : 'bg-aurora-deep'"
          :style="{ width: `${fillPercent(segment)}%` }"
        />
      </span>
    </button>
  </div>
</template>

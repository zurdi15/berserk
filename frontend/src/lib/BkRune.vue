<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'

import { RUNES, RUNE_SEQUENCES, type RuneName } from './runes'

const props = withDefaults(
  defineProps<{ name: RuneName; size?: number; carve?: boolean; tone?: 'ink' | 'aurora' | 'ember' }>(),
  { size: 32, carve: false, tone: 'ink' },
)

const path = ref<SVGPathElement | null>(null)
const carveLength = ref(200)
const phaseLengths = ref<number[]>([])

const isSequenced = computed(() => props.carve && props.name in RUNE_SEQUENCES)

// velocidad constante: cada fase dura en proporción a su longitud de trazo,
// y arranca exactamente cuando termina la anterior — sin pausas ni acelerones
const totalLength = computed(() => phaseLengths.value.reduce((a, b) => a + b, 0) || 1)

const phaseDuration = computed(() => (i: number) => {
  if (!phaseLengths.value[i]) return `calc(var(--bk-dur-5) / 2 * 0.3333)`
  const ratio = phaseLengths.value[i] / totalLength.value
  return `calc(var(--bk-dur-5) / 2 * ${ratio.toFixed(4)})`
})

const phaseDelay = computed(() => (i: number) => {
  const delayLength = phaseLengths.value.slice(0, i).reduce((a, b) => a + b, 0)
  const ratio = delayLength / totalLength.value
  return `calc(var(--bk-dur-5) / 2 * ${ratio.toFixed(4)})`
})

onMounted(() => {
  // longitud real del trazo para que el tallado dure lo mismo en toda runa
  if (props.carve && path.value?.getTotalLength) {
    carveLength.value = Math.ceil(path.value.getTotalLength())
  }

  // para el tallado secuencial, medir cada fase
  if (isSequenced.value) {
    const phases = RUNE_SEQUENCES[props.name]!
    phaseLengths.value = phases.map((_, i) => {
      const svgPath = document.createElementNS('http://www.w3.org/2000/svg', 'path')
      svgPath.setAttribute('d', phases[i])
      return Math.ceil(svgPath.getTotalLength())
    })
  }
})
</script>

<template>
  <svg
    :width="size"
    :height="size"
    viewBox="0 0 32 32"
    fill="none"
    aria-hidden="true"
    :class="{ 'text-aurora': tone === 'aurora', 'text-ember': tone === 'ember' }"
  >
    <!-- Tallado secuencial: cada fase dibuja en orden con retraso escalonado a velocidad constante -->
    <template v-if="isSequenced">
      <path
        v-for="(phasePath, i) in RUNE_SEQUENCES[name]"
        :key="`phase-${i}`"
        :d="phasePath"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="square"
        class="bk-carve-stroke"
        :style="{
          '--bk-carve-length': String(phaseLengths[i] || 200),
          'animation-duration': phaseDuration(i),
          'animation-delay': phaseDelay(i),
          'animation-timing-function': 'var(--bk-ease-linear)',
        }"
      />
    </template>
    <!-- Tallado simple o renderizado estático -->
    <template v-else>
      <path
        ref="path"
        :d="RUNES[name]"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="square"
        :class="carve && 'bk-carve-stroke'"
        :style="carve ? { '--bk-carve-length': String(carveLength) } : undefined"
      />
    </template>
  </svg>
</template>

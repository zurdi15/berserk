<script setup lang="ts">
import { onMounted, ref } from 'vue'

import { RUNES, type RuneName } from './runes'

const props = withDefaults(
  defineProps<{ name: RuneName; size?: number; carve?: boolean; tone?: 'ink' | 'aurora' | 'ember' }>(),
  { size: 32, carve: false, tone: 'ink' },
)

const path = ref<SVGPathElement | null>(null)
const carveLength = ref(200)

onMounted(() => {
  // longitud real del trazo para que el tallado dure lo mismo en toda runa
  if (props.carve && path.value?.getTotalLength) {
    carveLength.value = Math.ceil(path.value.getTotalLength())
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
    <path
      ref="path"
      :d="RUNES[name]"
      stroke="currentColor"
      stroke-width="2.5"
      stroke-linecap="square"
      :class="carve && 'bk-carve-stroke'"
      :style="carve ? { '--bk-carve-length': String(carveLength) } : undefined"
    />
  </svg>
</template>

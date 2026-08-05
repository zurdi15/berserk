<script setup lang="ts">
import { computed } from 'vue'

const props = withDefaults(
  defineProps<{ value: number; size?: number; stroke?: number }>(),
  { size: 48, stroke: 4 },
)

const radius = computed(() => (props.size - props.stroke) / 2)
const circumference = computed(() => 2 * Math.PI * radius.value)
const offset = computed(() => circumference.value * (1 - Math.min(1, Math.max(0, props.value))))
</script>

<template>
  <svg :width="size" :height="size" :viewBox="`0 0 ${size} ${size}`" fill="none" aria-hidden="true">
    <circle
      :cx="size / 2" :cy="size / 2" :r="radius"
      stroke="var(--bk-line)" :stroke-width="stroke"
    />
    <circle
      :cx="size / 2" :cy="size / 2" :r="radius"
      stroke="currentColor" :stroke-width="stroke" stroke-linecap="round"
      :stroke-dasharray="circumference" :stroke-dashoffset="offset"
      :transform="`rotate(-90 ${size / 2} ${size / 2})`"
      style="transition: stroke-dashoffset var(--bk-dur-2) var(--bk-ease-out)"
    />
  </svg>
</template>

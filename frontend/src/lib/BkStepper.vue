<script setup lang="ts">
import { onBeforeUnmount } from 'vue'

const props = withDefaults(
  defineProps<{ modelValue: number; step?: number; min?: number; max?: number; suffix?: string }>(),
  { step: 1, min: 0, max: 999 },
)
const emit = defineEmits<{ 'update:modelValue': [value: number] }>()

let timer: ReturnType<typeof setInterval> | null = null
let current = 0

function apply(direction: 1 | -1) {
  current = Math.min(props.max, Math.max(props.min, current + direction * props.step))
  emit('update:modelValue', Number(current.toFixed(2)))
}

function press(direction: 1 | -1) {
  current = props.modelValue
  apply(direction)
  // mantener pulsado repite: en el gym se suben 20 kg sin veinte taps
  timer = setInterval(() => apply(direction), 140)
}

function release() {
  if (timer) clearInterval(timer)
  timer = null
}

onBeforeUnmount(release)
</script>

<template>
  <div class="flex items-center gap-3">
    <button
      type="button"
      class="bk-press bk-slab w-12 h-12 text-xl text-ink-muted hover:text-ink"
      aria-label="-"
      @pointerdown="press(-1)"
      @pointerup="release"
      @pointerleave="release"
    >
      −
    </button>
    <span class="bk-metric text-2xl text-ink min-w-16 text-center">
      {{ modelValue }}<span v-if="suffix" class="text-sm text-ink-faint ml-1">{{ suffix }}</span>
    </span>
    <button
      type="button"
      class="bk-press bk-slab w-12 h-12 text-xl text-aurora"
      aria-label="+"
      @pointerdown="press(1)"
      @pointerup="release"
      @pointerleave="release"
    >
      +
    </button>
  </div>
</template>

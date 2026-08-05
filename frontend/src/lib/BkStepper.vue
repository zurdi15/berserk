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

function onClick(direction: 1 | -1, event: MouseEvent) {
  // detail === 0 delata una activación por teclado (Enter/Space sintetizan el
  // click sin pointerdown/pointerup previos); los clicks de puntero real ya
  // quedaron aplicados por press()/release(), así que aquí no hacemos nada.
  if (event.detail !== 0) return
  current = props.modelValue
  apply(direction)
}

onBeforeUnmount(release)
</script>

<template>
  <div class="flex items-center gap-3">
    <button
      type="button"
      class="bk-press bk-slab select-none w-12 h-12 text-xl text-ink-muted hover:text-ink"
      style="touch-action: manipulation"
      :aria-label="$t('common.decrease')"
      @pointerdown="press(-1)"
      @pointerup="release"
      @pointerleave="release"
      @click="onClick(-1, $event)"
    >
      −
    </button>
    <span class="bk-metric text-2xl text-ink min-w-16 text-center">
      {{ modelValue }}<span v-if="suffix" class="text-sm text-ink-faint ml-1">{{ suffix }}</span>
    </span>
    <button
      type="button"
      class="bk-press bk-slab select-none w-12 h-12 text-xl text-aurora"
      style="touch-action: manipulation"
      :aria-label="$t('common.increase')"
      @pointerdown="press(1)"
      @pointerup="release"
      @pointerleave="release"
      @click="onClick(1, $event)"
    >
      +
    </button>
  </div>
</template>

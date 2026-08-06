<script setup lang="ts">
import { onBeforeUnmount } from 'vue'

// item 2 (post-0.3.0): size="compact" para el cajón de series — dos steppers
// a la vez en grid-cols-2 con los botones/gap por defecto ("md") no caben
// desde 360px (ver SetForm.vue para la aritmética completa); "md" sigue
// siendo el default, sin cambios para el resto de consumidores (p.ej.
// RoutineEditorSheet, que usa un solo stepper por fila sin problema de sitio)
const props = withDefaults(
  defineProps<{ modelValue: number; step?: number; min?: number; max?: number; suffix?: string; size?: 'md' | 'compact' }>(),
  { step: 1, min: 0, max: 999, size: 'md' },
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
  <div class="flex items-center" :class="size === 'compact' ? 'gap-1.5' : 'gap-3'">
    <button
      type="button"
      class="bk-press bk-slab select-none text-ink-muted hover:text-ink"
      :class="size === 'compact' ? 'w-8 h-8 text-lg' : 'w-12 h-12 text-xl'"
      style="touch-action: manipulation"
      :aria-label="$t('common.decrease')"
      @pointerdown="press(-1)"
      @pointerup="release"
      @pointerleave="release"
      @click="onClick(-1, $event)"
    >
      −
    </button>
    <span
      class="bk-metric text-ink text-center"
      :class="size === 'compact' ? 'text-lg min-w-11' : 'text-2xl min-w-16'"
    >
      {{ modelValue }}<span v-if="suffix" class="text-sm text-ink-faint ml-1">{{ suffix }}</span>
    </span>
    <button
      type="button"
      class="bk-press bk-slab select-none text-aurora"
      :class="size === 'compact' ? 'w-8 h-8 text-lg' : 'w-12 h-12 text-xl'"
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

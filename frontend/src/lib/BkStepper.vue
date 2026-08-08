<script setup lang="ts">
import { onBeforeUnmount } from 'vue'

// item 2 (post-0.3.0): size="compact" para el cajón de series — dos steppers
// a la vez en grid-cols-2 con los botones/gap por defecto ("md") no caben
// desde 360px (ver SetForm.vue para la aritmética completa); "md" sigue
// siendo el default, sin cambios para el resto de consumidores (p.ej.
// RoutineEditorSheet, que usa un solo stepper por fila sin problema de sitio)
// v0.11.5: `display` sustituye SOLO lo que se pinta, no lo que se maneja — el
// stepper sigue trabajando en la unidad cruda del backend (step/min/max en
// segundos, p.ej.) mientras el usuario lee "10:00" en vez de "600 s". Sin esa
// separación, un objetivo de cardio en segundos obligaba a elegir entre un
// valor legible y una unidad honesta con el payload.
const props = withDefaults(
  defineProps<{ modelValue: number; step?: number; min?: number; max?: number; suffix?: string; size?: 'md' | 'compact'; display?: string }>(),
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

// item 11 (v0.4.3, zurdi): fila EDGE-TO-EDGE — "−" pinned al borde
// izquierdo, "+" al borde derecho, valor centrado entre los dos (w-full +
// justify-between en la raíz del template, en vez de un gap fijo entre 3
// hijos). Antes el valor llevaba un min-w propio (fix post-0.3.0 para el
// jitter de pesos x.5: "22.5 kg" es más ancho que "20 kg") que empujaba el
// botón "+" cuando el texto crecía — cada CONTENEDOR ahora le da a este root
// un ancho acotado (grid column, div de bloque, o flex-col con w-full
// ganando sobre items-center) y este flex se limita a repartir ESE ancho:
// los botones quedan en los extremos SIEMPRE, sin importar cuánto mida el
// valor, así que el min-w del span ya no hace falta — más simple y más
// estable a la vez (fix real, no solo paliativo). El tabular-nums que pedía
// el fix ya lo da bk-metric (font-variant-numeric, ver base.css), sin
// repetirlo como utilidad Tailwind aparte.
// (comentario aquí y no como primer hijo de <template>: un comentario ahí
// convierte la raíz en un fragmento de dos nodos y rompe wrapper.classes()
// en los tests, ver el mismo criterio en ProgressView.vue/BkChart.vue)
</script>

<template>
  <div class="w-full flex items-center justify-between gap-2">
    <button
      type="button"
      class="bk-press bk-slab select-none text-ink-muted hover:text-ink shrink-0"
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
      :class="size === 'compact' ? 'text-lg' : 'text-2xl'"
    >
      {{ display ?? modelValue }}<span v-if="suffix" class="text-sm text-ink-faint ml-1">{{ suffix }}</span>
    </span>
    <button
      type="button"
      class="bk-press bk-slab select-none text-aurora shrink-0"
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

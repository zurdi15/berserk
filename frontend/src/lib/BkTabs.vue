<script setup lang="ts">
import { nextTick, ref } from 'vue'

const props = defineProps<{ modelValue: string; tabs: { value: string; label: string }[] }>()
const emit = defineEmits<{ 'update:modelValue': [value: string] }>()

// refs de los botones en orden de v-for: Vue los repuebla en cada render, así
// que solo son fiables DESPUÉS de un nextTick (ver move())
const tabRefs = ref<HTMLButtonElement[]>([])

// scrollIntoView respeta reduced-motion en JS: el guard CSS único del
// sistema de animación no alcanza al scroll suave nativo del navegador
function scrollTabIntoView(el: HTMLElement) {
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  el.scrollIntoView({ inline: 'nearest', block: 'nearest', behavior: reducedMotion ? 'auto' : 'smooth' })
}

function select(value: string, event: MouseEvent) {
  emit('update:modelValue', value)
  scrollTabIntoView(event.currentTarget as HTMLElement)
}

function move(delta: number) {
  const index = props.tabs.findIndex((t) => t.value === props.modelValue)
  const nextIndex = (index + delta + props.tabs.length) % props.tabs.length
  emit('update:modelValue', props.tabs[nextIndex].value)
  // el botón destino se lee del array de refs tras el próximo tick: el click
  // ya tiene su elemento vía $event, pero el movimiento por teclado no dispara
  // sobre el botón destino, así que hay que esperar a que modelValue se
  // propague y el DOM refleje el nuevo activo antes de poder ubicarlo
  nextTick(() => {
    const el = tabRefs.value[nextIndex]
    if (el) scrollTabIntoView(el)
  })
}
</script>

<template>
  <div
    role="tablist"
    class="flex gap-1 border-b border-line overflow-x-auto no-scrollbar"
    tabindex="0"
    @keydown.arrow-right.prevent="move(1)"
    @keydown.arrow-left.prevent="move(-1)"
  >
    <button
      v-for="tab in tabs"
      :key="tab.value"
      ref="tabRefs"
      role="tab"
      type="button"
      :aria-selected="tab.value === modelValue ? 'true' : 'false'"
      class="bk-press px-4 py-2 font-display uppercase tracking-wide text-sm border-b-2 -mb-px shrink-0 whitespace-nowrap"
      :class="tab.value === modelValue
        ? 'text-aurora border-aurora'
        : 'text-ink-faint border-transparent hover:text-ink'"
      @click="select(tab.value, $event)"
    >
      {{ tab.label }}
    </button>
  </div>
</template>

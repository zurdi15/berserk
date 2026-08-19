<script setup lang="ts">
import { nextTick, ref } from 'vue'

// item 2 (v0.3.2): overflow-x-auto se queda como red de seguridad
// (histórico: sin él, 4 pestañas anchas ensanchaban la PÁGINA entera,
// desincronizando el nav inferior fijo del viewport visual — ver c111487)
// — pero el caso normal ahora es que quepa entero, no que scrollee.
// overscroll-x-contain (ver la clase del tablist abajo) corta el bounce/
// chaining elástico: con contenido que cabe, arrastrar ya no se siente
// como "esto scrollea" (el bug que reportó zurdi), aunque overflow-x-auto
// siga técnicamente activo como red de seguridad.
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
    class="flex w-full gap-1 rounded-full border border-line bg-stone p-1 overflow-x-auto overscroll-x-contain no-scrollbar"
    tabindex="0"
    @keydown.arrow-right.prevent="move(1)"
    @keydown.arrow-left.prevent="move(-1)"
  >
    <!-- facelift: de subrayado uppercase a pill segmentada (la referencia) —
         la activa se realza con bg-slab (el token ES el nivel "elevado", ver
         base.css). flex-1 reparte el ancho entre pestañas; la aritmética de
         anchura del peor caso (item 2, 4 pestañas en 360px) mejora respecto
         a la versión uppercase: caja mixta a text-2xs mide menos que las
         mismas etiquetas EN MAYÚSCULAS con tracking-wide, y el reparto
         flex-1 absorbe la diferencia — overflow-x-auto sigue de red de
         seguridad (histórico c111487: sin él, 4 pestañas anchas ensanchaban
         la página y desincronizaban el nav fijo). -->
    <button
      v-for="tab in tabs"
      :key="tab.value"
      ref="tabRefs"
      role="tab"
      type="button"
      :aria-selected="tab.value === modelValue ? 'true' : 'false'"
      class="bk-press flex-1 rounded-full px-2 sm:px-3 py-2 font-display font-semibold text-2xs sm:text-sm shrink-0 whitespace-nowrap transition-colors"
      :class="tab.value === modelValue
        ? 'bg-slab text-aurora'
        : 'text-ink-muted hover:text-ink'"
      @click="select(tab.value, $event)"
    >
      {{ tab.label }}
    </button>
  </div>
</template>

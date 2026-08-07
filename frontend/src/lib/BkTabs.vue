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
    class="flex gap-1 border-b border-line overflow-x-auto overscroll-x-contain no-scrollbar"
    tabindex="0"
    @keydown.arrow-right.prevent="move(1)"
    @keydown.arrow-left.prevent="move(-1)"
  >
    <!-- item 2: compacto por debajo de sm (px-2/text-2xs), tamaño normal
         desde sm — aritmética del peor caso real (4 pestañas, tracking-wide
         uppercase, ~7.5px/carácter a text-2xs/11.2px, estimación generosa):
           Perfil:      "PERFIL"(6)     ×7.5 + 2×8px(px-2) =  61px
           Progresión:  "RUTINAS"(7)    ×7.5 + 16          =  68.5px
                        "BIBLIOTECA"(10)×7.5 + 16           =  91px   ← la más larga de las dos vistas
                        "ADMIN"(5)      ×7.5 + 16           =  53.5px
           total Perfil = 61+68.5+91+53.5 = 274px + 3×gap-1(4px) = 286px
           total Progresión (TOTALES/CUERPO/ENTRENOS/RÉCORDS, todas ≤8 car.) ≈ 274px + 12 = 286px
         Ambos ≤ 328px (360px de viewport − 2×16px de padding del <main> del
         shell, px-4) con ~42px de margen. -->
    <button
      v-for="tab in tabs"
      :key="tab.value"
      ref="tabRefs"
      role="tab"
      type="button"
      :aria-selected="tab.value === modelValue ? 'true' : 'false'"
      class="bk-press px-2 sm:px-4 py-2 font-display uppercase tracking-wide text-2xs sm:text-sm border-b-2 -mb-px shrink-0 whitespace-nowrap"
      :class="tab.value === modelValue
        ? 'text-aurora border-aurora'
        : 'text-ink-faint border-transparent hover:text-ink'"
      @click="select(tab.value, $event)"
    >
      {{ tab.label }}
    </button>
  </div>
</template>

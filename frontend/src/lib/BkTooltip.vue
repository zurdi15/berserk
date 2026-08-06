<script setup lang="ts">
// Tooltip mínimo a demanda (tap/click o foco+Enter): pensado para
// disparadores pequeños sin texto propio (una runa) que necesitan anunciar
// su significado sin ocupar espacio fijo en el layout. El disparador es un
// <button> real — foco y activación por Enter/Espacio ya vienen gratis de
// la semántica nativa, no hace falta cablear teclado a mano — con
// aria-describedby apuntando al globo mientras está abierto (patrón WAI-ARIA
// de tooltip por interacción). Misma pila de capas que BkSheet/BkSelect
// (layerStack) para que Escape cierre solo el tooltip si hay algo más
// abierto encima (p.ej. este componente dentro de un sheet).
import { onBeforeUnmount, ref, useId } from 'vue'
import { isTopLayer, popLayer, pushLayer } from './layerStack'

const props = defineProps<{ text: string }>()

const triggerEl = ref<HTMLButtonElement | null>(null)
const open = ref(false)
const style = ref<Record<string, string>>({})
const tooltipId = useId()
const layerId = Symbol('tooltip')

const GAP_PX = 8

function computePosition() {
  const trigger = triggerEl.value
  if (!trigger) return
  const rect = trigger.getBoundingClientRect()
  // centrado horizontalmente sobre el trigger (transform, no medir el ancho
  // del globo: así el primer pintado ya sale bien colocado, sin el salto de
  // una segunda pasada tras medir)
  style.value = {
    position: 'fixed',
    left: `${rect.left + rect.width / 2}px`,
    bottom: `${window.innerHeight - rect.top + GAP_PX}px`,
    transform: 'translateX(-50%)',
  }
}

function onKeydown(event: KeyboardEvent) {
  if (event.key !== 'Escape') return
  if (!isTopLayer(layerId)) return
  event.preventDefault()
  close()
}

// pointerdown (no click): dispara antes que el click que abrió el tooltip
// ya haya terminado de propagarse, así un tap fuera cierra en el mismo gesto
function onPointerDown(event: PointerEvent) {
  const target = event.target as Node
  if (triggerEl.value?.contains(target)) return
  close()
}

// hacer scroll bajo un tooltip abierto lo desancla de la runa; más simple y
// predecible cerrarlo que perseguir la posición en cada frame
function onScroll() {
  close()
}

function show() {
  if (open.value) return
  computePosition()
  open.value = true
  pushLayer(layerId)
  window.addEventListener('keydown', onKeydown)
  window.addEventListener('pointerdown', onPointerDown)
  window.addEventListener('resize', computePosition)
  window.addEventListener('scroll', onScroll, true)
}

function close() {
  if (!open.value) return
  open.value = false
  popLayer(layerId)
  window.removeEventListener('keydown', onKeydown)
  window.removeEventListener('pointerdown', onPointerDown)
  window.removeEventListener('resize', computePosition)
  window.removeEventListener('scroll', onScroll, true)
}

// mismo trigger para tap/click y para Enter/Espacio con foco (evento click
// nativo de <button>): un segundo toque sobre la propia runa alterna cerrado
function toggle() {
  if (open.value) close()
  else show()
}

onBeforeUnmount(close)
</script>

<template>
  <button
    ref="triggerEl"
    type="button"
    class="bk-press inline-flex items-center justify-center rounded-sm"
    :aria-label="text"
    :aria-describedby="open ? tooltipId : undefined"
    @click="toggle"
  >
    <slot />
  </button>

  <Teleport to="body">
    <Transition name="bk-pop-soft">
      <div
        v-if="open"
        :id="tooltipId"
        role="tooltip"
        :style="style"
        class="z-(--bk-z-sheet) bk-slab rounded-sm px-2.5 py-1.5 text-xs text-ink whitespace-nowrap shadow-lg pointer-events-none"
      >
        {{ props.text }}
      </div>
    </Transition>
  </Teleport>
</template>

<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, ref, useId, watch } from 'vue'
import { isTopLayer, popLayer, pushLayer } from './layerStack'

// facelift v2 (zurdi): `scroll: false` para sheets cuyo CONTENIDO ya tiene
// su propio scroller (la lista de añadir ejercicio) — el panel deja de
// scrollear (flex + overflow-hidden) y evita el doble scroll anidado; el
// slot debe repartirse con flex-1 min-h-0.
const props = withDefaults(defineProps<{ open: boolean; title?: string; scroll?: boolean }>(), {
  scroll: true,
})
const emit = defineEmits<{ close: [] }>()

// facelift v2 (zurdi: "la rayita no es interactuable"): arrastrar el asa
// hacia abajo cierra el sheet — el panel sigue al dedo (transform inline,
// sin transición mientras se arrastra) y al soltar, pasado el umbral, se
// cierra; si no, vuelve a su sitio con transition-transform. Pointer events
// con captura: el gesto no se pierde aunque el dedo salga del asa.
const DRAG_CLOSE_PX = 90
const dragging = ref(false)
const dragY = ref(0)
let dragStartY = 0

function onDragStart(event: PointerEvent) {
  dragging.value = true
  dragY.value = 0
  dragStartY = event.clientY
  // captura del puntero si el entorno la soporta (happy-dom no) — sin ella
  // el arrastre sigue funcionando mientras el dedo no salga del asa
  try {
    ;(event.currentTarget as HTMLElement).setPointerCapture(event.pointerId)
  } catch {
    /* no-op */
  }
}

function onDragMove(event: PointerEvent) {
  if (!dragging.value) return
  dragY.value = Math.max(0, event.clientY - dragStartY)
}

function onDragEnd() {
  if (!dragging.value) return
  dragging.value = false
  if (dragY.value > DRAG_CLOSE_PX) emit('close')
  dragY.value = 0
}

const id = Symbol()
const titleId = useId()
const panel = ref<HTMLElement | null>(null)
let lastFocused: HTMLElement | null = null

function onKey(event: KeyboardEvent) {
  if (event.key !== 'Escape') return
  if (!isTopLayer(id)) return
  emit('close')
}

onMounted(() => window.addEventListener('keydown', onKey))
onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKey)
  popLayer(id)
})

// suelo de foco: role=dialog aria-modal no basta si el foco se queda atrás,
// así que lo movemos al abrir y lo devolvemos a quien abrió el sheet al cerrar.
// immediate: true porque un sheet puede montarse ya abierto (v-if en el padre
// en vez de v-show) — sin esto, nunca entra en sheetStack y Escape se lo come
// en silencio. La rama else es un no-op inofensivo en el disparo inicial con
// open=false: id no está en la pila (indexOf -1, no splice) y lastFocused
// todavía es null (el optional chaining en focus() no hace nada).
watch(
  () => props.open,
  async (open) => {
    if (open) {
      pushLayer(id)
      lastFocused = document.activeElement as HTMLElement | null
      await nextTick()
      panel.value?.focus()
    } else {
      popLayer(id)
      lastFocused?.focus()
      lastFocused = null
    }
  },
  { immediate: true },
)
</script>

<template>
  <Teleport to="body">
    <Transition name="bk-sheet-backdrop">
      <!-- v0.4.0 light theme: era bg-void/70 — void es casi negro en oscuro
           (cuela como scrim) pero niebla pálida en claro (aclararía en vez de
           atenuar). bg-scrim es su propio token, siempre oscuro en los dos
           temas (ver tokens/index.ts::scrim). -->
      <div
        v-if="open"
        class="fixed inset-0 z-(--bk-z-sheet) bg-scrim"
        @click="emit('close')"
      />
    </Transition>
    <Transition name="bk-sheet-panel">
      <div
        v-if="open"
        ref="panel"
        role="dialog"
        aria-modal="true"
        tabindex="-1"
        :aria-labelledby="title ? titleId : undefined"
        class="fixed inset-x-0 bottom-0 z-(--bk-z-sheet) bk-slab rounded-t-xl rounded-b-none border-b-0 p-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))] max-h-[85dvh]"
        :class="[
          scroll ? 'overflow-y-auto' : 'flex flex-col overflow-hidden',
          !dragging && 'transition-transform',
        ]"
        :style="{ transform: `translateY(${dragY}px)` }"
      >
        <!-- asa arrastrable: zona de toque generosa alrededor de la rayita
             (touch-action none: el gesto es nuestro, no un scroll) -->
        <div
          class="shrink-0 -mt-4 -mx-5 px-5 pt-3 pb-2 flex justify-center cursor-grab select-none"
          style="touch-action: none"
          data-testid="sheet-grabber"
          @pointerdown="onDragStart"
          @pointermove="onDragMove"
          @pointerup="onDragEnd"
          @pointercancel="onDragEnd"
        >
          <div class="h-1.5 w-12 rounded-full bg-line-strong" aria-hidden="true" />
        </div>
        <h2 v-if="title" :id="titleId" class="bk-title text-ink mb-4 shrink-0">
          {{ title }}
        </h2>
        <div :class="scroll ? undefined : 'flex-1 min-h-0 flex flex-col'">
          <slot />
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
/* Excepción documentada al doctrine "solo entrada" del resto de la app
   (ver animations.css): zurdi quiere explícitamente que el sheet (cajón
   inferior) también anime al cerrarse — un modal que desaparece de golpe
   rompe la sensación física de "cajón que se desliza" que sí tiene al abrir.
   Vive aquí, scoped, en vez de en animations.css a propósito: ese archivo es
   solo-entrada por diseño (ver su cabecera) y el guard de reduced-motion de
   ahí es universal (*, *::before, *::after), así que sigue neutralizando
   estas animaciones sin tocar ese archivo ni duplicar el guard. */
@keyframes bk-sheet-backdrop-fade {
  from { opacity: 0; }
  to { opacity: 1; }
}

@keyframes bk-sheet-panel-rise {
  from { transform: translateY(100%); }
  to { transform: translateY(0); }
}

.bk-sheet-backdrop-enter-active {
  animation: bk-sheet-backdrop-fade var(--bk-dur-3) var(--bk-ease-out);
}
/* leave: mismo keyframe en reversa (to → from) para no duplicar la
   definición, pero con su propia duración/easing (dur-2/ease-in) — más
   corta y de arranque brusco, como corresponde a una salida en vez de una
   entrada */
.bk-sheet-backdrop-leave-active {
  animation: bk-sheet-backdrop-fade var(--bk-dur-2) ease-in reverse;
}

.bk-sheet-panel-enter-active {
  animation: bk-sheet-panel-rise var(--bk-dur-3) var(--bk-ease-out);
}
.bk-sheet-panel-leave-active {
  animation: bk-sheet-panel-rise var(--bk-dur-2) ease-in reverse;
}
</style>

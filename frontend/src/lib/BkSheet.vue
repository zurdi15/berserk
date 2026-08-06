<script lang="ts">
// pila de sheets abiertos a nivel de módulo: con sheets anidados, un Escape
// debe cerrar SOLO el de arriba, no toda la pila a la vez. Declarada en un
// <script> normal (no <script setup>) a propósito: el código de
// <script setup> se re-ejecuta en cada instancia, así que ahí la pila no se
// compartiría entre sheets anidados.
const sheetStack: symbol[] = []
</script>

<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, ref, useId, watch } from 'vue'

const props = defineProps<{ open: boolean; title?: string }>()
const emit = defineEmits<{ close: [] }>()

const id = Symbol()
const titleId = useId()
const panel = ref<HTMLElement | null>(null)
let lastFocused: HTMLElement | null = null

function onKey(event: KeyboardEvent) {
  if (event.key !== 'Escape') return
  if (sheetStack.at(-1) !== id) return
  emit('close')
}

onMounted(() => window.addEventListener('keydown', onKey))
onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKey)
  const idx = sheetStack.indexOf(id)
  if (idx !== -1) sheetStack.splice(idx, 1)
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
      sheetStack.push(id)
      lastFocused = document.activeElement as HTMLElement | null
      await nextTick()
      panel.value?.focus()
    } else {
      const idx = sheetStack.indexOf(id)
      if (idx !== -1) sheetStack.splice(idx, 1)
      lastFocused?.focus()
      lastFocused = null
    }
  },
  { immediate: true },
)
</script>

<template>
  <Teleport to="body">
    <Transition name="bk-fade">
      <div
        v-if="open"
        class="fixed inset-0 z-(--bk-z-sheet) bg-void/70"
        @click="emit('close')"
      />
    </Transition>
    <Transition name="bk-rise">
      <div
        v-if="open"
        ref="panel"
        role="dialog"
        aria-modal="true"
        tabindex="-1"
        :aria-labelledby="title ? titleId : undefined"
        class="fixed inset-x-0 bottom-0 z-(--bk-z-sheet) bk-slab rounded-t-md border-b-0 p-4 pb-[env(safe-area-inset-bottom)] max-h-[85dvh] overflow-y-auto"
      >
        <div class="mx-auto mb-3 h-1 w-10 rounded-xs bg-line-strong" aria-hidden="true" />
        <h2 v-if="title" :id="titleId" class="font-display font-semibold uppercase tracking-wider text-sm mb-3">
          {{ title }}
        </h2>
        <slot />
      </div>
    </Transition>
  </Teleport>
</template>

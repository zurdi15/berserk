<script setup lang="ts">
import { nextTick, onBeforeUnmount, ref } from 'vue'

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
// v0.17.1 (zurdi: "aparte de los increase/decrease, que se pueda editar
// directamente para poner literalmente cualquier peso, con punto o coma"):
// `editable` convierte el VALOR en un botón que abre un input numérico —
// tap, teclea (82,5 y 82.5 valen igual), Enter/fuera confirma, Escape
// cancela. El valor tecleado se clampa a min/max como los taps de +/− pero
// NO se cuantiza al step: ese era justo el punto. No combinar con `display`
// (el input precarga el número CRUDO del modelo, no el texto pintado).
const props = withDefaults(
  defineProps<{ modelValue: number; step?: number; min?: number; max?: number; suffix?: string; size?: 'md' | 'compact'; display?: string; editable?: boolean }>(),
  { step: 1, min: 0, max: 999, size: 'md', editable: false },
)
const emit = defineEmits<{ 'update:modelValue': [value: number] }>()

const editing = ref(false)
const draft = ref('')
const inputEl = ref<HTMLInputElement | null>(null)

async function startEdit() {
  draft.value = String(props.modelValue)
  editing.value = true
  await nextTick()
  inputEl.value?.focus()
  // todo seleccionado: teclear reemplaza en vez de concatenar (el gesto es
  // "pon ESTE peso", no "edita cifras del anterior")
  inputEl.value?.select()
}

function commitEdit() {
  // Enter confirma y el blur posterior (el input se desmonta) re-entra aquí:
  // el guard hace el segundo paso un no-op
  if (!editing.value) return
  editing.value = false
  const raw = draft.value.trim().replace(',', '.')
  const parsed = Number(raw)
  if (raw === '' || !Number.isFinite(parsed)) return
  emit('update:modelValue', Number(Math.min(props.max, Math.max(props.min, parsed)).toFixed(2)))
}

function cancelEdit() {
  editing.value = false
}

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

// v0.39.3: el navegador puede CANCELAR el puntero a mitad de pulsación (el
// WebView decide que el gesto era un scroll, entra una llamada, cambia el
// foco...). En ese caso NO llega pointerup ni pointerleave, así que sin esto
// el intervalo seguía vivo para siempre y el valor se desplomaba solo hasta
// min (un descanso de 60 s acababa en los 5 s del mínimo, y cada tic mandaba
// su PATCH). pointercancel + lostpointercapture cierran los dos huecos:
// en táctil el elemento captura el puntero implícitamente, y perder esa
// captura es la otra forma de que la pulsación muera sin pointerup.

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
      class="bk-press bk-slab rounded-md select-none text-ink-muted hover:text-ink shrink-0"
      :class="size === 'compact' ? 'w-8 h-8 text-lg' : 'w-12 h-12 text-xl'"
      style="touch-action: manipulation"
      :aria-label="$t('common.decrease')"
      @pointerdown="press(-1)"
      @pointerup="release"
      @pointerleave="release"
      @pointercancel="release"
      @lostpointercapture="release"
      @click="onClick(-1, $event)"
    >
      −
    </button>
    <!-- v0.17.1: con editable, el valor es un botón que abre el input de
         entrada directa; sin él, el span de siempre. type=text +
         inputmode=decimal (no type=number): el teclado móvil trae decimal y
         el parseo propio acepta coma Y punto — type=number rechazaría la
         coma en la mayoría de locales -->
    <input
      v-if="editing"
      ref="inputEl"
      v-model="draft"
      type="text"
      inputmode="decimal"
      autocomplete="off"
      data-testid="stepper-edit-input"
      class="bk-metric text-ink text-center bg-transparent border-b border-aurora focus:outline-none min-w-0"
      :class="size === 'compact' ? 'text-lg w-20' : 'text-2xl w-24'"
      :aria-label="$t('common.edit')"
      @keydown.enter.prevent="commitEdit"
      @keydown.esc.prevent="cancelEdit"
      @blur="commitEdit"
    />
    <button
      v-else-if="editable"
      type="button"
      data-testid="stepper-edit"
      class="bk-press bk-metric text-ink text-center"
      :class="size === 'compact' ? 'text-lg' : 'text-2xl'"
      :aria-label="$t('common.edit')"
      @click="startEdit"
    >
      {{ display ?? modelValue }}<span v-if="suffix" class="text-sm text-ink-faint ml-1">{{ suffix }}</span>
    </button>
    <span
      v-else
      class="bk-metric text-ink text-center"
      :class="size === 'compact' ? 'text-lg' : 'text-2xl'"
    >
      {{ display ?? modelValue }}<span v-if="suffix" class="text-sm text-ink-faint ml-1">{{ suffix }}</span>
    </span>
    <button
      type="button"
      class="bk-press bk-slab rounded-md select-none text-aurora shrink-0"
      :class="size === 'compact' ? 'w-8 h-8 text-lg' : 'w-12 h-12 text-xl'"
      style="touch-action: manipulation"
      :aria-label="$t('common.increase')"
      @pointerdown="press(1)"
      @pointerup="release"
      @pointerleave="release"
      @pointercancel="release"
      @lostpointercapture="release"
      @click="onClick(1, $event)"
    >
      +
    </button>
  </div>
</template>

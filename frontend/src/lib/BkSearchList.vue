<script setup lang="ts" generic="T">
// item 5 (ola de pulido v0.3.0): primitiva de "buscar + lista con scroll",
// pensada desde el principio para reutilizarse (AddExerciseSheet es el
// primer consumidor; la lista de compartir con usuarios y otros pickers la
// adoptarán después — ver el contrato de props/slots documentado abajo).
//
// Contrato para futuros consumidores:
//   - `items`: el array COMPLETO ya cargado por quien monta esto — la
//     primitiva filtra en cliente, nunca llama a una API por su cuenta.
//   - `labelFn`: cómo sacar el texto de cada item, tanto para filtrar como
//     para el texto por defecto de cada fila (si no se usa el slot #item).
//   - `searchFn` (opcional, v0.9.4): pajar ALTERNATIVO contra el que
//     filtrar — para cuando un item debe encontrarse por más texto del que
//     muestra su fila (AddExerciseSheet lo usa para que "cardio" o el
//     nombre en el otro idioma también matcheen). Sin él, se filtra por
//     labelFn como siempre.
//   - `keyFn` (opcional): identidad estable para :key; por defecto el
//     índice en la lista YA filtrada (basta si `items` no se reordena bajo
//     el mismo filtro, pero un consumidor con ids estables debería pasarlo).
//   - v-model: el texto de búsqueda — vive fuera para que el consumidor
//     pueda leerlo/resetearlo (p.ej. al cerrar un sheet), igual que
//     cualquier campo controlado del sistema.
//   - slot `#item="{ item, index, active }"`: fila personalizada (con
//     runas, tags, lo que haga falta); si no se usa, cae a un texto plano
//     con `labelFn(item)`.
//   - emit `select`: se dispara al click o al confirmar con teclado
//     (Enter) sobre la fila activa — la primitiva NO decide qué hacer con
//     la selección, eso es cosa del consumidor.
//
// Teclado: mismo patrón que el listbox de BkSelect.vue (ArrowUp/ArrowDown
// mueven la fila activa con scroll-into-view, Home/End saltan a los
// extremos, Enter confirma) — pero sin la parte de type-ahead de BkSelect,
// que aquí no hace falta: el campo de búsqueda YA es el mecanismo de
// filtrado, no hace falta un segundo camino para lo mismo.
import { computed, nextTick, ref, useId, watch } from 'vue'
import { useI18n } from 'vue-i18n'

import { foldSearchText } from '@/utils/searchFold'

const props = withDefaults(
  defineProps<{
    items: T[]
    labelFn: (item: T) => string
    searchFn?: (item: T) => string
    keyFn?: (item: T, index: number) => string | number
    modelValue?: string
    label?: string
    emptyText?: string
    maxHeightClass?: string
  }>(),
  { modelValue: '', maxHeightClass: 'max-h-64' },
)
const emit = defineEmits<{
  'update:modelValue': [value: string]
  select: [item: T]
}>()

const { t } = useI18n()

const listId = useId()

// se rastrea el ITEM activo (identidad), no su índice: un índice se queda
// "válido por casualidad" cuando el filtro cambia (mismo índice, item
// distinto) — mismo bug que evita BkSelect.vue rastreando `activeValue` en
// vez de una posición
const activeItem = ref<T | null>(null)

const filtered = computed(() => {
  // v0.11.1: pliegue de acentos en ambos lados — "eliptica" encuentra "Elíptica"
  const q = foldSearchText(props.modelValue.trim())
  if (!q) return props.items
  const haystack = props.searchFn ?? props.labelFn
  return props.items.filter((item) => foldSearchText(haystack(item)).includes(q))
})

const activeIndex = computed(() => (activeItem.value === null ? -1 : filtered.value.indexOf(activeItem.value)))

function itemKey(item: T, index: number): string | number {
  return props.keyFn ? props.keyFn(item, index) : index
}

function itemId(index: number): string {
  return `${listId}-item-${index}`
}

// cualquier cambio en la lista mostrada (tecleo, o el consumidor cambiando
// `items`/`modelValue` desde fuera) puede dejar el item activo fuera de la
// vista filtrada: re-anclar a la primera fila visible en ese caso,
// inmediato para que también fije el estado inicial al montar
watch(
  filtered,
  (list) => {
    if (activeItem.value !== null && list.includes(activeItem.value)) return
    activeItem.value = list[0] ?? null
  },
  { immediate: true },
)

async function scrollActiveIntoView() {
  await nextTick()
  if (activeIndex.value < 0) return
  const el = document.getElementById(itemId(activeIndex.value))
  if (!el) return
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  el.scrollIntoView({ block: 'nearest', behavior: reducedMotion ? 'auto' : 'smooth' })
}

function moveActive(delta: number) {
  if (!filtered.value.length) return
  const currentIdx = activeIndex.value
  const nextIdx =
    currentIdx === -1
      ? delta > 0 ? 0 : filtered.value.length - 1
      : (currentIdx + delta + filtered.value.length) % filtered.value.length
  activeItem.value = filtered.value[nextIdx]
  scrollActiveIntoView()
}

function moveToEdge(edge: 'first' | 'last') {
  if (!filtered.value.length) return
  activeItem.value = edge === 'first' ? filtered.value[0] : filtered.value[filtered.value.length - 1]
  scrollActiveIntoView()
}

function selectActive() {
  if (activeItem.value !== null) emit('select', activeItem.value)
}

// función dedicada en vez de una asignación inline en el @mouseenter del
// template: vue-tsc no infiere bien el tipo genérico T de una asignación
// directa a un ref<T|null> hecha desde dentro de un v-for del template
function setActive(item: T) {
  activeItem.value = item
}

function onKeydown(event: KeyboardEvent) {
  switch (event.key) {
    case 'ArrowDown':
      event.preventDefault()
      moveActive(1)
      break
    case 'ArrowUp':
      event.preventDefault()
      moveActive(-1)
      break
    case 'Home':
      event.preventDefault()
      moveToEdge('first')
      break
    case 'End':
      event.preventDefault()
      moveToEdge('last')
      break
    case 'Enter':
      event.preventDefault()
      selectActive()
      break
  }
}

function onInput(event: Event) {
  // el re-anclaje del item activo lo hace el watcher de `filtered` arriba
  // (dispara en cuanto `modelValue` cambie y el computed se reevalúe)
  emit('update:modelValue', (event.target as HTMLInputElement).value)
}
</script>

<template>
  <div class="space-y-2">
    <!-- v0.24.2 (zurdi: "selector de grupo y búsqueda en la misma row"):
         slot opcional `beside` — lo que llegue ahí (el filtro de grupo)
         ocupa UN tercio y el input de búsqueda los DOS restantes -->
    <div :class="$slots.beside && 'grid grid-cols-3 gap-2'">
      <div v-if="$slots.beside" class="min-w-0">
        <slot name="beside" />
      </div>
      <input
        type="text"
        role="combobox"
        aria-haspopup="listbox"
        :aria-controls="listId"
        aria-expanded="true"
        :aria-activedescendant="filtered.length ? itemId(activeIndex) : undefined"
        :value="modelValue"
        :placeholder="label"
        :aria-label="label"
        autocomplete="off"
        class="bk-form-control w-full min-w-0 rounded-sm border border-line bg-stone px-3 py-2.5 text-ink placeholder:text-ink-faint focus:border-aurora"
        :class="$slots.beside && 'col-span-2'"
        data-testid="search-list-input"
        @input="onInput"
        @keydown="onKeydown"
      />
    </div>
    <ul
      :id="listId"
      role="listbox"
      :aria-label="label"
      :class="maxHeightClass"
      class="overflow-y-auto space-y-1"
    >
      <li
        v-for="(item, i) in filtered"
        :id="itemId(i)"
        :key="itemKey(item, i)"
        role="option"
        :aria-selected="i === activeIndex ? 'true' : 'false'"
        class="rounded-sm cursor-pointer"
        :class="i === activeIndex ? 'bg-aurora/15' : ''"
        @click="emit('select', item)"
        @mouseenter="setActive(item)"
      >
        <slot name="item" :item="item" :index="i" :active="i === activeIndex">
          <span class="block px-2 py-2 text-sm text-ink truncate">{{ labelFn(item) }}</span>
        </slot>
      </li>
      <li
        v-if="filtered.length === 0"
        role="presentation"
        class="px-3 py-2 text-sm text-ink-faint"
        data-testid="search-list-empty"
      >
        {{ emptyText ?? t('common.noResults') }}
      </li>
    </ul>
  </div>
</template>

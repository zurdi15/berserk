<script setup lang="ts">
// v2 (round 7): listbox propio en vez de <select> nativo — en Android un
// <select> abre el picker nativo del SO, completamente fuera de la estética
// del sistema de diseño. API pública sin cambios (modelValue/options/label +
// update:modelValue) para que la migración de los consumidores sea, en la
// mayoría de los casos, un cambio de cero líneas más allá del propio import.
import { computed, nextTick, ref, useId, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useFloatingPanel } from '@/composables/useFloatingPanel'

const props = defineProps<{
  label: string
  modelValue: string
  options: { value: string; label: string; disabled?: boolean }[]
}>()
const emit = defineEmits<{ 'update:modelValue': [value: string] }>()

const { t } = useI18n()

// listas largas (p.ej. las ~400 zonas horarias de Intl.supportedValuesOf)
// necesitan un filtro de texto; unas pocas opciones no lo necesitan y el
// campo de más sería ruido. El umbral es el mismo que pidió el encargo.
const FILTER_THRESHOLD = 15
const isFilterable = computed(() => props.options.length > FILTER_THRESHOLD)

const labelId = useId()
const listboxId = useId()

const { triggerEl, panelEl, open, panelStyle, openPanel, closePanel } = useFloatingPanel()

const filterQuery = ref('')
const activeValue = ref<string | null>(null)
const filterInputEl = ref<HTMLInputElement | null>(null)

const filteredOptions = computed(() => {
  if (!isFilterable.value || !filterQuery.value.trim()) return props.options
  const q = filterQuery.value.trim().toLowerCase()
  return props.options.filter((o) => o.label.toLowerCase().includes(q))
})

const selectedLabel = computed(
  () => props.options.find((o) => o.value === props.modelValue)?.label ?? '',
)

function optionId(value: string): string {
  // el índice es sobre la lista MOSTRADA (ya filtrada): solo tiene que ser
  // único en el DOM en cada momento, no estable entre renders
  const idx = filteredOptions.value.findIndex((o) => o.value === value)
  return `${listboxId}-opt-${idx}`
}

async function scrollActiveIntoView() {
  await nextTick()
  if (activeValue.value === null) return
  const el = document.getElementById(optionId(activeValue.value))
  if (!el) return
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  el.scrollIntoView({ block: 'nearest', behavior: reducedMotion ? 'auto' : 'smooth' })
}

function firstEnabled(list: typeof props.options) {
  return list.find((o) => !o.disabled) ?? null
}

async function open_() {
  openPanel()
  // limpiar el filtro ANTES de calcular la opción activa: si quedó un texto
  // de una apertura anterior, la lista "completa" de este cálculo sería la
  // filtrada vieja, y el valor actual podría no estar ni en ella
  if (isFilterable.value) filterQuery.value = ''
  const current = filteredOptions.value.find((o) => o.value === props.modelValue && !o.disabled)
  activeValue.value = (current ?? firstEnabled(filteredOptions.value))?.value ?? null
  scrollActiveIntoView()
  // I3/C1: con filtro, el foco real pasa al input de texto (si no, es
  // inalcanzable por teclado). Sin filtro, el trigger se queda con el foco
  // (patrón combobox estándar, aria-activedescendant sin mover el DOM
  // focus) — pero un click no garantiza foco en un <button> en todos los
  // navegadores (Safari/Firefox en macOS no lo dan salvo "acceso total por
  // teclado" activado, a diferencia de Chromium): sin un focus() explícito
  // aquí, abrir con el ratón en esos navegadores dejaría el teclado
  // posterior sin dueño, igual que el bug de foco de BkTimeField/BkDateField.
  await nextTick()
  if (isFilterable.value) filterInputEl.value?.focus()
  else triggerEl.value?.focus()
}

function close_() {
  closePanel()
}

function onTriggerClick() {
  if (open.value) close_()
  else open_()
}

function moveActive(delta: number) {
  const enabled = filteredOptions.value.filter((o) => !o.disabled)
  if (!enabled.length) return
  const currentIdx = enabled.findIndex((o) => o.value === activeValue.value)
  const nextIdx =
    currentIdx === -1
      ? delta > 0 ? 0 : enabled.length - 1
      : (currentIdx + delta + enabled.length) % enabled.length
  activeValue.value = enabled[nextIdx].value
  scrollActiveIntoView()
}

function moveToEdge(edge: 'first' | 'last') {
  const enabled = filteredOptions.value.filter((o) => !o.disabled)
  if (!enabled.length) return
  activeValue.value = edge === 'first' ? enabled[0].value : enabled[enabled.length - 1].value
  scrollActiveIntoView()
}

function commitActive() {
  if (activeValue.value !== null) emit('update:modelValue', activeValue.value)
  close_()
  triggerEl.value?.focus()
}

function selectOption(value: string, disabled?: boolean) {
  if (disabled) return
  emit('update:modelValue', value)
  close_()
  triggerEl.value?.focus()
}

// type-ahead solo cuando NO hay filtro: si lo hay, escribir ya filtra la
// lista (el filtro ES el type-ahead), duplicar el mecanismo confundiría cuál
// de los dos manda
let typeAheadBuffer = ''
let typeAheadTimer: ReturnType<typeof setTimeout> | null = null

function typeAhead(char: string) {
  typeAheadBuffer += char.toLowerCase()
  if (typeAheadTimer) clearTimeout(typeAheadTimer)
  typeAheadTimer = setTimeout(() => { typeAheadBuffer = '' }, 500)

  const match = props.options.find((o) => !o.disabled && o.label.toLowerCase().startsWith(typeAheadBuffer))
  if (match) {
    activeValue.value = match.value
    scrollActiveIntoView()
  }
}

function onTriggerKeydown(event: KeyboardEvent) {
  if (!open.value) {
    if (['ArrowDown', 'ArrowUp', 'Enter', ' '].includes(event.key)) {
      event.preventDefault()
      open_()
    }
    return
  }
  handleOpenKeydown(event)
}

// compartido entre el trigger y el input de filtro (cuando existe): mismas
// teclas de navegación en ambos sitios
function handleOpenKeydown(event: KeyboardEvent) {
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
      commitActive()
      break
    case ' ':
      // en el filtro, espacio es un carácter de búsqueda normal (p.ej. "New
      // York"); fuera del filtro, espacio confirma como Enter (igual que el
      // <select> nativo)
      if (isFilterable.value && event.target === filterInputEl.value) return
      event.preventDefault()
      commitActive()
      break
    case 'Escape':
      event.preventDefault()
      close_()
      triggerEl.value?.focus()
      break
    default:
      if (!isFilterable.value && event.key.length === 1) typeAhead(event.key)
  }
}

watch(filterQuery, () => {
  // filtrar puede dejar la opción activa fuera de la lista mostrada: re-anclar
  // a la primera visible en vez de quedarse en un id que ya no existe
  const stillVisible = filteredOptions.value.some((o) => o.value === activeValue.value)
  if (!stillVisible) activeValue.value = firstEnabled(filteredOptions.value)?.value ?? null
})
</script>

<template>
  <div class="relative">
    <!-- M10: la etiqueta es un span (no un <label for>) asociado por
         aria-labelledby — un click ahí no enfoca nada por sí solo -->
    <span :id="labelId" class="block mb-1 text-sm text-ink-muted cursor-pointer" @click="triggerEl?.focus()">{{ label }}</span>
    <button
      ref="triggerEl"
      type="button"
      role="combobox"
      aria-haspopup="listbox"
      :aria-expanded="open ? 'true' : 'false'"
      :aria-controls="open ? listboxId : undefined"
      :aria-labelledby="labelId"
      :aria-activedescendant="open && !isFilterable && activeValue !== null ? optionId(activeValue) : undefined"
      class="bk-form-control w-full flex items-center justify-between gap-2 rounded-sm border border-line bg-stone px-3 py-2.5 text-ink focus:border-aurora"
      @click="onTriggerClick"
      @keydown="onTriggerKeydown"
    >
      <span class="truncate text-left">{{ selectedLabel }}</span>
      <svg
        viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
        stroke-linecap="round" stroke-linejoin="round"
        class="w-4 h-4 shrink-0 text-ink-muted transition-transform"
        :class="{ 'rotate-180': open }"
        aria-hidden="true"
      >
        <path d="M6 9l6 6 6-6" />
      </svg>
    </button>

    <Teleport to="body">
      <Transition name="bk-pop-soft">
        <div
          v-if="open"
          ref="panelEl"
          :style="panelStyle"
          class="z-(--bk-z-sheet) bk-slab rounded-sm border border-line-strong overflow-hidden shadow-lg"
        >
          <div v-if="isFilterable" class="p-2 border-b border-line">
            <!-- I3: mientras el filtro existe, ES el elemento con foco real —
                 aria-activedescendant/aria-controls viven aquí, no en el
                 trigger (que ya no está enfocado en este estado) -->
            <input
              ref="filterInputEl"
              v-model="filterQuery"
              type="text"
              role="combobox"
              aria-expanded="true"
              :aria-controls="listboxId"
              :aria-activedescendant="activeValue !== null ? optionId(activeValue) : undefined"
              :placeholder="t('common.filter')"
              class="bk-form-control w-full rounded-sm border border-line bg-void px-2 py-1.5 text-sm text-ink placeholder:text-ink-faint focus:border-aurora"
              @keydown="handleOpenKeydown"
            />
          </div>
          <ul
            :id="listboxId"
            role="listbox"
            :aria-labelledby="labelId"
            class="max-h-64 overflow-y-auto py-1"
          >
            <li
              v-for="opt in filteredOptions"
              :id="optionId(opt.value)"
              :key="opt.value"
              role="option"
              :aria-selected="opt.value === modelValue ? 'true' : 'false'"
              :aria-disabled="opt.disabled ? 'true' : undefined"
              class="flex items-center justify-between gap-2 px-3 py-2 text-sm cursor-pointer"
              :class="[
                opt.disabled ? 'text-ink-faint cursor-not-allowed' : 'text-ink',
                !opt.disabled && opt.value === activeValue ? 'bg-aurora/15' : '',
                !opt.disabled && opt.value === modelValue ? 'text-aurora' : '',
              ]"
              @click="selectOption(opt.value, opt.disabled)"
              @mouseenter="!opt.disabled && (activeValue = opt.value)"
            >
              <span class="truncate">{{ opt.label }}</span>
              <svg
                v-if="opt.value === modelValue"
                viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
                stroke-linecap="round" stroke-linejoin="round"
                class="w-4 h-4 shrink-0 text-aurora" aria-hidden="true"
              >
                <path d="M5 13l4 4L19 7" />
              </svg>
            </li>
            <li v-if="filteredOptions.length === 0" role="presentation" class="px-3 py-2 text-sm text-ink-faint">
              {{ t('common.noResults') }}
            </li>
          </ul>
        </div>
      </Transition>
    </Teleport>
  </div>
</template>

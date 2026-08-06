<script setup lang="ts">
// Reemplaza <input type="date">: en Android abre el datepicker nativo del
// SO, fuera de la estética del sistema. Panel = mini-calendario que reutiliza
// el lenguaje visual de CalendarView/MonthGrid (headers de días vía locale
// del viewer, chevrones de mes, día de hoy marcado, seleccionado en aurora).
import { computed, nextTick, ref, useId } from 'vue'
import { useI18n } from 'vue-i18n'
import { useFloatingPanel } from '@/composables/useFloatingPanel'
import { addDays, addMonths, formatDateShort, monthGrid, monthLabel, todayIso, weekdayHeaders } from '@/utils/dates'
import BkButton from './BkButton.vue'

const props = defineProps<{ label: string; modelValue: string }>()
const emit = defineEmits<{ 'update:modelValue': [value: string] }>()

const { t, locale } = useI18n()

const labelId = useId()
const gridId = useId()
const monthHeadingId = useId()

const { triggerEl, panelEl, open, panelStyle, openPanel, closePanel } = useFloatingPanel()
// C1: foco real en la rejilla al abrir — sin él, aria-activedescendant no
// tiene dueño y las flechas/Enter/PageUp/PageDown no hacían NADA para un
// usuario real
const gridEl = ref<HTMLDivElement | null>(null)

const focusedDate = ref(props.modelValue || todayIso())
const viewYear = ref(0)
const viewMonth = ref(0)

function syncViewToFocused() {
  const [y, m] = focusedDate.value.split('-').map(Number)
  viewYear.value = y
  viewMonth.value = m
}

const grid = computed(() => monthGrid(viewYear.value, viewMonth.value))
const headers = computed(() => weekdayHeaders(locale.value))
const heading = computed(() => monthLabel(viewYear.value, viewMonth.value, locale.value))
const today = computed(() => todayIso())

function dayId(date: string) { return `${gridId}-${date}` }

async function openField() {
  focusedDate.value = props.modelValue || todayIso()
  syncViewToFocused()
  openPanel()
  // C1: nextTick — la rejilla (ref="gridEl") recién se monta tras este tick
  // (v-if="open")
  await nextTick()
  gridEl.value?.focus()
}

function toggleField() {
  if (open.value) closePanel()
  else openField()
}

function pick(date: string) {
  emit('update:modelValue', date)
  closePanel()
  triggerEl.value?.focus()
}

function moveFocusedDay(delta: number) {
  focusedDate.value = addDays(focusedDate.value, delta)
  syncViewToFocused()
}

function moveFocusedMonth(delta: number) {
  focusedDate.value = addMonths(focusedDate.value, delta)
  syncViewToFocused()
}

function onGridKeydown(event: KeyboardEvent) {
  switch (event.key) {
    case 'ArrowRight': event.preventDefault(); moveFocusedDay(1); break
    case 'ArrowLeft': event.preventDefault(); moveFocusedDay(-1); break
    case 'ArrowDown': event.preventDefault(); moveFocusedDay(7); break
    case 'ArrowUp': event.preventDefault(); moveFocusedDay(-7); break
    case 'PageUp': event.preventDefault(); moveFocusedMonth(-1); break
    case 'PageDown': event.preventDefault(); moveFocusedMonth(1); break
    case 'Enter':
    case ' ':
      event.preventDefault()
      pick(focusedDate.value)
      break
    case 'Escape':
      event.preventDefault()
      closePanel()
      triggerEl.value?.focus()
      break
  }
}

function onTriggerKeydown(event: KeyboardEvent) {
  if (open.value) return
  if (['ArrowDown', 'ArrowUp', 'Enter', ' '].includes(event.key)) {
    event.preventDefault()
    openField()
  }
}
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
      aria-haspopup="dialog"
      :aria-expanded="open ? 'true' : 'false'"
      :aria-controls="open ? gridId : undefined"
      :aria-labelledby="labelId"
      class="w-full flex items-center justify-between gap-2 rounded-sm border border-line bg-stone px-3 py-2.5 text-ink focus:border-aurora"
      @click="toggleField"
      @keydown="onTriggerKeydown"
    >
      <span>{{ formatDateShort(modelValue, locale) }}</span>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="w-4 h-4 shrink-0 text-ink-muted" aria-hidden="true">
        <rect x="3" y="4" width="18" height="18" rx="2" />
        <path d="M16 2v4M8 2v4M3 10h18" />
      </svg>
    </button>

    <Teleport to="body">
      <Transition name="bk-pop">
        <div
          v-if="open"
          ref="panelEl"
          :style="panelStyle"
          class="z-(--bk-z-sheet) bk-slab rounded-sm border border-line-strong overflow-hidden shadow-lg p-2"
        >
          <div class="flex items-center gap-2 mb-2">
            <BkButton variant="ghost" size="sm" :aria-label="t('calendar.prevMonth')" @click="moveFocusedMonth(-1)">
              <span aria-hidden="true">‹</span>
            </BkButton>
            <h2 :id="monthHeadingId" class="flex-1 text-center text-sm font-semibold text-ink capitalize">{{ heading }}</h2>
            <BkButton variant="ghost" size="sm" :aria-label="t('calendar.nextMonth')" @click="moveFocusedMonth(1)">
              <span aria-hidden="true">›</span>
            </BkButton>
          </div>

          <div class="grid grid-cols-7 gap-1 text-center text-xs text-ink-muted mb-1">
            <div v-for="(h, i) in headers" :key="`h-${i}`">{{ h }}</div>
          </div>

          <div
            :id="gridId"
            ref="gridEl"
            role="grid"
            tabindex="0"
            :aria-labelledby="monthHeadingId"
            :aria-activedescendant="dayId(focusedDate)"
            class="grid grid-cols-7 gap-1"
            @keydown="onGridKeydown"
          >
            <button
              v-for="cell in grid"
              :id="dayId(cell.date)"
              :key="cell.date"
              type="button"
              role="gridcell"
              :aria-selected="cell.date === modelValue ? 'true' : 'false'"
              class="aspect-square rounded-sm text-xs flex items-center justify-center transition-colors"
              :class="[
                !cell.inMonth ? 'text-ink-faint' : 'text-ink hover:bg-stone',
                cell.date === modelValue ? 'bg-aurora text-void font-semibold' : '',
                cell.date === today && cell.date !== modelValue ? 'border border-aurora' : '',
                cell.date === focusedDate && cell.date !== modelValue ? 'ring-2 ring-aurora-deep' : '',
              ]"
              @click="pick(cell.date)"
            >
              {{ Number(cell.date.slice(8, 10)) }}
            </button>
          </div>
        </div>
      </Transition>
    </Teleport>
  </div>
</template>

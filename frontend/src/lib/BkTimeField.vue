<script setup lang="ts">
// Reemplaza <input type="time">: en Android abre el diálogo nativo del SO,
// fuera de la estética del sistema. Panel con dos columnas (horas/minutos)
// independientemente navegables, mismo mecanismo de posicionamiento/Escape/
// click-fuera que BkSelect (useFloatingPanel, ver ese archivo para el porqué
// de la pila de capas compartida con BkSheet).
import { computed, nextTick, ref, useId, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useFloatingPanel } from '@/composables/useFloatingPanel'

const props = defineProps<{ label: string; modelValue: string | null }>()
const emit = defineEmits<{ 'update:modelValue': [value: string | null] }>()

const { t } = useI18n()

const HOURS = Array.from({ length: 24 }, (_, i) => String(i).padStart(2, '0'))
const MINUTES = Array.from({ length: 12 }, (_, i) => String(i * 5).padStart(2, '0'))

const labelId = useId()
const hoursId = useId()
const minutesId = useId()

const { triggerEl, panelEl, open, panelStyle, openPanel, closePanel } = useFloatingPanel()

const [defaultH, defaultM] = props.modelValue ? props.modelValue.split(':') : ['00', '00']
const pendingHour = ref(defaultH)
const pendingMinute = ref(defaultM)

function hourId(h: string) { return `${hoursId}-${h}` }
function minuteId(m: string) { return `${minutesId}-${m}` }

async function scrollIntoView(id: string) {
  await nextTick()
  const el = document.getElementById(id)
  if (!el) return
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  el.scrollIntoView({ block: 'nearest', behavior: reducedMotion ? 'auto' : 'smooth' })
}

function openField() {
  const [h, m] = props.modelValue ? props.modelValue.split(':') : ['00', '00']
  pendingHour.value = h
  pendingMinute.value = m
  openPanel()
  scrollIntoView(hourId(pendingHour.value))
  scrollIntoView(minuteId(pendingMinute.value))
}

function toggleField() {
  if (open.value) closePanel()
  else openField()
}

function moveHour(delta: number) {
  const idx = HOURS.indexOf(pendingHour.value)
  pendingHour.value = HOURS[(idx + delta + HOURS.length) % HOURS.length]
  scrollIntoView(hourId(pendingHour.value))
}

function moveMinute(delta: number) {
  const idx = MINUTES.indexOf(pendingMinute.value)
  pendingMinute.value = MINUTES[(idx + delta + MINUTES.length) % MINUTES.length]
  scrollIntoView(minuteId(pendingMinute.value))
}

function apply() {
  emit('update:modelValue', `${pendingHour.value}:${pendingMinute.value}`)
  closePanel()
  triggerEl.value?.focus()
}

function clear() {
  emit('update:modelValue', null)
  closePanel()
  triggerEl.value?.focus()
}

function cancel() {
  closePanel()
  triggerEl.value?.focus()
}

function onColumnKeydown(column: 'hour' | 'minute', event: KeyboardEvent) {
  const move = column === 'hour' ? moveHour : moveMinute
  const list = column === 'hour' ? HOURS : MINUTES
  const pending = column === 'hour' ? pendingHour : pendingMinute
  switch (event.key) {
    case 'ArrowDown': event.preventDefault(); move(1); break
    case 'ArrowUp': event.preventDefault(); move(-1); break
    case 'Home': event.preventDefault(); pending.value = list[0]; scrollIntoView(column === 'hour' ? hourId(pending.value) : minuteId(pending.value)); break
    case 'End': event.preventDefault(); pending.value = list[list.length - 1]; scrollIntoView(column === 'hour' ? hourId(pending.value) : minuteId(pending.value)); break
    case 'Enter':
    case ' ':
      event.preventDefault()
      apply()
      break
    case 'Escape':
      event.preventDefault()
      cancel()
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

// si el panel sigue abierto cuando el consumidor cambia modelValue por fuera
// (poco común, pero p.ej. un reset de formulario), re-anclar lo pendiente
watch(() => props.modelValue, (value) => {
  if (open.value) return
  const [h, m] = value ? value.split(':') : ['00', '00']
  pendingHour.value = h
  pendingMinute.value = m
})
</script>

<template>
  <div class="relative">
    <span :id="labelId" class="block mb-1 text-sm text-ink-muted">{{ label }}</span>
    <button
      ref="triggerEl"
      type="button"
      role="combobox"
      aria-haspopup="dialog"
      :aria-expanded="open ? 'true' : 'false'"
      :aria-labelledby="labelId"
      class="w-full flex items-center justify-between gap-2 rounded-sm border border-line bg-stone px-3 py-2.5 text-ink focus:border-aurora bk-metric"
      @click="toggleField"
      @keydown="onTriggerKeydown"
    >
      <span :class="modelValue ? 'text-ink' : 'text-ink-faint'">{{ modelValue ?? '--:--' }}</span>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="w-4 h-4 shrink-0 text-ink-muted" aria-hidden="true">
        <circle cx="12" cy="12" r="9" />
        <path d="M12 7v5l3 3" />
      </svg>
    </button>

    <Teleport to="body">
      <Transition name="bk-pop">
        <div
          v-if="open"
          ref="panelEl"
          :style="panelStyle"
          class="z-(--bk-z-sheet) bk-slab rounded-sm border border-line-strong overflow-hidden shadow-lg flex flex-col"
        >
          <div class="flex divide-x divide-line">
            <ul
              :id="hoursId"
              role="listbox"
              tabindex="0"
              :aria-label="t('calendar.time') + ' — ' + t('common.hours')"
              :aria-activedescendant="hourId(pendingHour)"
              class="max-h-64 overflow-y-auto flex-1 py-1 bk-metric"
              @keydown="onColumnKeydown('hour', $event)"
            >
              <li
                v-for="h in HOURS" :key="h" :id="hourId(h)" role="option"
                :aria-selected="h === pendingHour ? 'true' : 'false'"
                class="px-4 py-1.5 text-center text-sm cursor-pointer"
                :class="h === pendingHour ? 'bg-aurora/15 text-aurora' : 'text-ink'"
                @click="pendingHour = h; scrollIntoView(hourId(h))"
              >{{ h }}</li>
            </ul>
            <ul
              :id="minutesId"
              role="listbox"
              tabindex="0"
              :aria-label="t('calendar.time') + ' — ' + t('common.minutes')"
              :aria-activedescendant="minuteId(pendingMinute)"
              class="max-h-64 overflow-y-auto flex-1 py-1 bk-metric"
              @keydown="onColumnKeydown('minute', $event)"
            >
              <li
                v-for="m in MINUTES" :key="m" :id="minuteId(m)" role="option"
                :aria-selected="m === pendingMinute ? 'true' : 'false'"
                class="px-4 py-1.5 text-center text-sm cursor-pointer"
                :class="m === pendingMinute ? 'bg-aurora/15 text-aurora' : 'text-ink'"
                @click="pendingMinute = m; scrollIntoView(minuteId(m))"
              >{{ m }}</li>
            </ul>
          </div>
          <div class="flex items-center gap-2 p-2 border-t border-line">
            <button type="button" class="bk-press text-sm text-ink-muted hover:text-ink px-2 py-1" data-testid="time-field-clear" @click="clear">
              {{ t('common.clear') }}
            </button>
            <button type="button" class="bk-press text-sm text-ink-muted hover:text-ink px-2 py-1" @click="cancel">
              {{ t('common.cancel') }}
            </button>
            <button type="button" class="bk-press ml-auto text-sm text-aurora font-semibold px-3 py-1 rounded-sm border border-aurora hover:bg-aurora/10" data-testid="time-field-apply" @click="apply">
              {{ t('common.apply') }}
            </button>
          </div>
        </div>
      </Transition>
    </Teleport>
  </div>
</template>

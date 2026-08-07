<script setup lang="ts">
// Reemplaza <input type="time">: en Android abre el diálogo nativo del SO,
// fuera de la estética del sistema. Panel con dos columnas (horas/minutos)
// independientemente navegables, mismo mecanismo de posicionamiento/Escape/
// click-fuera que BkSelect (useFloatingPanel, ver ese archivo para el porqué
// de la pila de capas compartida con BkSheet).
import { computed, nextTick, ref, useId, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useFloatingPanel } from '@/composables/useFloatingPanel'

// item 1 (round 10): min ("HH:MM") deshabilita horas/minutos anteriores —
// guardarraíl de cliente para "programar rutina hoy solo a una hora
// posterior a la actual" (ScheduleSheet la pasa solo cuando el día
// seleccionado es hoy). No es seguridad: el backend no valida esto.
const props = defineProps<{ label: string; modelValue: string | null; hint?: string; min?: string }>()
const emit = defineEmits<{ 'update:modelValue': [value: string | null] }>()

const { t } = useI18n()

const HOURS = Array.from({ length: 24 }, (_, i) => String(i).padStart(2, '0'))
const MINUTES = Array.from({ length: 12 }, (_, i) => String(i * 5).padStart(2, '0'))

const labelId = useId()
const hoursId = useId()
const minutesId = useId()

const { triggerEl, panelEl, open, panelStyle, openPanel, closePanel } = useFloatingPanel()
// columna de horas: foco real al abrir (C1) — sin esto nada tenía el foco y
// las flechas/Enter/Home/End no hacían NADA para un usuario real (el
// aria-activedescendant apuntaba a una opción "activa" que ningún elemento
// con foco real reclamaba)
const hourListEl = ref<HTMLUListElement | null>(null)

// una hora/minuto que no cae en un paso de 5 (p.ej. "14:23" llegado de fuera)
// no tiene fila en MINUTES: el aria-activedescendant apuntaría a un id que no
// existe en el DOM. Se snapea al paso más cercano, envolviendo dentro de la
// misma hora (58 → 00, no a la hora siguiente: solo se toca el minuto)
function snapMinute(m: string): string {
  const n = Number(m)
  if (Number.isNaN(n)) return '00'
  const snapped = (Math.round(n / 5) * 5) % 60
  return String(snapped).padStart(2, '0')
}

const minHour = computed(() => props.min?.split(':')[0])
const minMinute = computed(() => (props.min ? Number(props.min.split(':')[1]) : null))

function isHourDisabled(h: string): boolean {
  return minHour.value !== undefined && h < minHour.value
}
function isMinuteDisabled(m: string): boolean {
  return minHour.value !== undefined && pendingHour.value === minHour.value && Number(m) <= (minMinute.value ?? -1)
}

// sin modelValue previo, el default no puede ser '00:00' a ciegas si hay un
// min: abriría el panel ya anclado sobre una opción disabled (mismo defecto
// que BkSelect evita re-anclando a la primera opción habilitada). Primero
// intenta un minuto posterior DENTRO de la propia hora mínima; si esa hora ya
// no tiene ningún minuto válido (p.ej. min="23:57"), salta a la siguiente
// hora con minuto '00' — y si tampoco queda hora siguiente (min ya en la
// última hora del día), cae al último hueco disponible como mejor opción
// posible, aun a sabiendas de que puede seguir siendo <= min.
function firstValidDefault(): [string, string] {
  if (!props.min) return ['00', '00']
  const [mh, mmStr] = props.min.split(':')
  const mm = Number(mmStr)
  const laterMinuteSameHour = MINUTES.find((m) => Number(m) > mm)
  if (laterMinuteSameHour) return [mh, laterMinuteSameHour]
  const nextHour = HOURS.find((h) => h > mh)
  return nextHour ? [nextHour, '00'] : [HOURS[HOURS.length - 1], MINUTES[MINUTES.length - 1]]
}

const [defaultH, defaultM] = props.modelValue ? props.modelValue.split(':') : firstValidDefault()
const pendingHour = ref(defaultH)
const pendingMinute = ref(props.modelValue ? snapMinute(defaultM) : defaultM)

function hourId(h: string) { return `${hoursId}-${h}` }
function minuteId(m: string) { return `${minutesId}-${m}` }

async function scrollIntoView(id: string) {
  await nextTick()
  const el = document.getElementById(id)
  if (!el) return
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  el.scrollIntoView({ block: 'nearest', behavior: reducedMotion ? 'auto' : 'smooth' })
}

async function openField() {
  if (props.modelValue) {
    const [h, m] = props.modelValue.split(':')
    pendingHour.value = h
    pendingMinute.value = snapMinute(m)
  } else {
    const [h, m] = firstValidDefault()
    pendingHour.value = h
    pendingMinute.value = m
  }
  openPanel()
  scrollIntoView(hourId(pendingHour.value))
  scrollIntoView(minuteId(pendingMinute.value))
  // C1: foco real en la columna de horas — sin él, aria-activedescendant no
  // tiene dueño y el teclado no mueve nada para un usuario real. nextTick:
  // el <ul ref="hourListEl"> recién se monta tras este tick (v-if="open").
  await nextTick()
  hourListEl.value?.focus()
}

function toggleField() {
  if (open.value) closePanel()
  else openField()
}

// roving cíclico que salta las opciones disabled (mismo patrón que
// BkSelect.moveActive): min puede dejar huecos al principio de las horas o,
// dentro de la hora mínima, al principio de los minutos
function moveHour(delta: number) {
  const enabled = HOURS.filter((h) => !isHourDisabled(h))
  if (!enabled.length) return
  const currentIdx = enabled.indexOf(pendingHour.value)
  const nextIdx = currentIdx === -1 ? (delta > 0 ? 0 : enabled.length - 1) : (currentIdx + delta + enabled.length) % enabled.length
  pendingHour.value = enabled[nextIdx]
  scrollIntoView(hourId(pendingHour.value))
}

function moveMinute(delta: number) {
  const enabled = MINUTES.filter((m) => !isMinuteDisabled(m))
  if (!enabled.length) return
  const currentIdx = enabled.indexOf(pendingMinute.value)
  const nextIdx = currentIdx === -1 ? (delta > 0 ? 0 : enabled.length - 1) : (currentIdx + delta + enabled.length) % enabled.length
  pendingMinute.value = enabled[nextIdx]
  scrollIntoView(minuteId(pendingMinute.value))
}

// mismo tratamiento que BkSelect.selectOption: clic sobre una opción disabled
// no hace nada, en vez de dejar elegir una hora/minuto ya pasado
function selectHour(h: string) {
  if (isHourDisabled(h)) return
  pendingHour.value = h
  scrollIntoView(hourId(h))
}
function selectMinute(m: string) {
  if (isMinuteDisabled(m)) return
  pendingMinute.value = m
  scrollIntoView(minuteId(m))
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
  const enabledList = column === 'hour'
    ? HOURS.filter((h) => !isHourDisabled(h))
    : MINUTES.filter((m) => !isMinuteDisabled(m))
  const pending = column === 'hour' ? pendingHour : pendingMinute
  switch (event.key) {
    case 'ArrowDown': event.preventDefault(); move(1); break
    case 'ArrowUp': event.preventDefault(); move(-1); break
    case 'Home':
      event.preventDefault()
      if (!enabledList.length) break
      pending.value = enabledList[0]
      scrollIntoView(column === 'hour' ? hourId(pending.value) : minuteId(pending.value))
      break
    case 'End':
      event.preventDefault()
      if (!enabledList.length) break
      pending.value = enabledList[enabledList.length - 1]
      scrollIntoView(column === 'hour' ? hourId(pending.value) : minuteId(pending.value))
      break
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
  if (value) {
    const [h, m] = value.split(':')
    pendingHour.value = h
    pendingMinute.value = snapMinute(m)
  } else {
    const [h, m] = firstValidDefault()
    pendingHour.value = h
    pendingMinute.value = m
  }
})
</script>

<template>
  <div class="relative">
    <!-- M10: la etiqueta es un span (no un <label for>, no envuelve al
         trigger) asociado por aria-labelledby — un click ahí no enfoca nada
         por sí solo, así que se enfoca el trigger a mano -->
    <span :id="labelId" class="block mb-1 text-sm text-ink-muted cursor-pointer" @click="triggerEl?.focus()">{{ label }}</span>
    <button
      ref="triggerEl"
      type="button"
      role="combobox"
      aria-haspopup="dialog"
      :aria-expanded="open ? 'true' : 'false'"
      :aria-controls="open ? hoursId : undefined"
      :aria-labelledby="labelId"
      class="bk-form-control w-full flex items-center justify-between gap-2 rounded-sm border border-line bg-stone px-3 py-2.5 text-ink focus:border-aurora bk-metric"
      @click="toggleField"
      @keydown="onTriggerKeydown"
    >
      <span :class="modelValue ? 'text-ink' : 'text-ink-faint'">{{ modelValue ?? '--:--' }}</span>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="w-4 h-4 shrink-0 text-ink-muted" aria-hidden="true">
        <circle cx="12" cy="12" r="9" />
        <path d="M12 7v5l3 3" />
      </svg>
    </button>
    <span v-if="hint" class="block mt-1 text-sm text-ink-faint">{{ hint }}</span>

    <Teleport to="body">
      <Transition name="bk-pop-soft">
        <div
          v-if="open"
          ref="panelEl"
          :style="panelStyle"
          class="z-(--bk-z-sheet) bk-slab rounded-sm border border-line-strong overflow-hidden shadow-lg flex flex-col"
        >
          <div class="flex divide-x divide-line">
            <ul
              :id="hoursId"
              ref="hourListEl"
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
                :aria-disabled="isHourDisabled(h) ? 'true' : undefined"
                class="px-4 py-1.5 text-center text-sm"
                :class="isHourDisabled(h) ? 'text-ink-faint cursor-not-allowed' : (h === pendingHour ? 'bg-aurora/15 text-aurora cursor-pointer' : 'text-ink cursor-pointer')"
                @click="selectHour(h)"
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
                :aria-disabled="isMinuteDisabled(m) ? 'true' : undefined"
                class="px-4 py-1.5 text-center text-sm"
                :class="isMinuteDisabled(m) ? 'text-ink-faint cursor-not-allowed' : (m === pendingMinute ? 'bg-aurora/15 text-aurora cursor-pointer' : 'text-ink cursor-pointer')"
                @click="selectMinute(m)"
              >{{ m }}</li>
            </ul>
          </div>
          <!-- v0.11.0 (zurdi: "cancelar y limpiar son redundantes y hacen
               overflow por la derecha"): Cancelar muere — Escape y tocar
               fuera ya cancelan (layerStack), el botón solo duplicaba esos
               gestos y empujaba a Aplicar fuera del panel en 390px -->
          <div class="flex items-center gap-2 p-2 border-t border-line">
            <button type="button" class="bk-press text-sm text-ink-muted hover:text-ink px-2 py-1" data-testid="time-field-clear" @click="clear">
              {{ t('common.clear') }}
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

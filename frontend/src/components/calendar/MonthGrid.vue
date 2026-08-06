<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { monthGrid, weekdayHeaders, todayIso } from '@/utils/dates'
import { isValidRuneName } from '@/lib/runeResolve'
import BkRune from '@/lib/BkRune.vue'
import type { CalendarMonthOut } from '@/api/domain'
import type { RuneName } from '@/lib/runes'

const props = defineProps<{
  month: CalendarMonthOut
  year: number
  monthNum: number
  groupMap: Map<number, string>
  // color de dots por atleta observado (dato de usuario, no token): null → aurora
  dotColor?: string | null
}>()

const emit = defineEmits<{
  select: [date: string]
}>()

// el locale de los headers es el del VIEWER, no el del atleta que se está
// viendo (ver CalendarView.vue: el label del mes también usa useI18n().locale)
const { locale } = useI18n()
const grid = computed(() => monthGrid(props.year, props.monthNum))
const headers = computed(() => weekdayHeaders(locale.value))
const today = computed(() => todayIso())

// v0.3.0 item 3 (bug): "El dot del calendario debería ser un entreno, se
// haya programado antes o no" + "si añado un entreno sin ejercicios ni
// grupos, sale en actividad del año pero nada lo identifica en el
// calendario". Antes el dot de arriba salía de scheduled[] (por status): un
// entreno standalone (sin sesión programada detrás) no tenía sesión que
// mirar, así que no dejaba ningún rastro arriba — y sin grupos musculares
// tampoco dejaba runa abajo. Ahora el dot RELLENO sale de workouts[] (uno
// por entreno, exista o no una sesión detrás, tenga o no ejercicios), y el
// dot HUECO sigue reservado a lo que de verdad está solo planificado
// (status 'planned': algo que aún no ha pasado). 'skipped' no deja dot
// arriba — ni es un entreno ni es algo pendiente, y ya tiene su propia fila
// en el sheet del día.
type DayDot = { key: string; kind: 'done' | 'planned' }

const dotsByDate = computed(() => {
  const map = new Map<string, DayDot[]>()
  for (const workout of props.month.workouts) {
    const existing = map.get(workout.date) ?? []
    map.set(workout.date, [...existing, { key: `w-${workout.id}`, kind: 'done' }])
  }
  for (const session of props.month.scheduled) {
    if (session.status !== 'planned') continue
    const existing = map.get(session.date) ?? []
    map.set(session.date, [...existing, { key: `s-${session.id}`, kind: 'planned' }])
  }
  // mismo idiom que runesByDate: máximo 3 dots por día, en línea horizontal
  for (const [date, dots] of map) {
    if (dots.length > 3) map.set(date, dots.slice(0, 3))
  }
  return map
})

// Recolectar runas de grupos musculares por día (máx 3)
const runesByDate = computed(() => {
  const map = new Map<string, RuneName[]>()
  for (const workout of props.month.workouts) {
    const runes: RuneName[] = []
    for (const muscleId of workout.muscle_group_ids) {
      const slug = props.groupMap.get(muscleId)
      if (slug && isValidRuneName(slug)) {
        runes.push(slug as RuneName)
      }
    }
    if (runes.length > 0) {
      const existing = map.get(workout.date) ?? []
      map.set(workout.date, [...existing, ...runes].slice(0, 3))
    }
  }
  return map
})

function selectDay(date: string) {
  emit('select', date)
}
</script>

<template>
  <div class="space-y-4">
    <!-- Weekday headers -->
    <div class="grid grid-cols-7 gap-1 text-center text-sm font-medium text-ink-muted">
      <div v-for="(header, i) in headers" :key="`header-${i}`">
        {{ header }}
      </div>
    </div>

    <!-- Month grid: --bk-day-dot fija el color de los dots de arriba (item
         3), con el token aurora como default — una futura ola puede
         sobreescribirlo aquí mismo para colorear por atleta, sin tocar los
         dots en sí -->
    <div
      class="grid grid-cols-7 gap-1 bk-stagger"
      data-testid="month-grid"
      :style="{ '--bk-day-dot': dotColor ?? 'var(--color-aurora)' }"
    >
      <button
        v-for="(cell, i) in grid"
        :key="`day-${cell.date}`"
        :data-testid="`day-cell-${cell.date}`"
        :style="{ '--bk-stagger-i': i % 7 }"
        class="relative aspect-square rounded-sm border p-1 flex items-center justify-center overflow-hidden transition-colors hover:bg-slab"
        :class="{
          'border-ink-faint': !cell.inMonth,
          'text-ink-muted': !cell.inMonth,
          'bg-stone border-line': cell.inMonth,
          'border-2 border-aurora': cell.date === today && cell.inMonth,
        }"
        @click="selectDay(cell.date)"
      >
        <!-- Date number (timezone-safe): único hijo en flujo normal, centrado
             por el flex del botón — status dots y runas van en overlays
             absolute propios (arriba/abajo) para no estirar la celda ni
             empujar el número (item 6: antes compartían un mismo footer
             abajo y, con ambos presentes, el bloque crecía hacia el centro
             y tapaba el número) -->
        <!-- polish wave item 1: v0.3.0 item 4 había puesto también el número
             en aurora; zurdi pide que SOLO el borde de la celda brille — el
             número vuelve a su tinta normal, el borde (arriba) es lo único
             que marca "hoy" -->
        <span class="text-xs font-semibold">
          {{ Number(cell.date.slice(8, 10)) }}
        </span>

        <!-- Workout dots: arriba de la celda, uno por entreno (relleno) +
             uno por sesión aún planificada (hueco) — ver dotsByDate arriba -->
        <div
          v-if="dotsByDate.has(cell.date)"
          class="absolute inset-x-0 top-1 flex justify-center gap-0.5"
        >
          <span
            v-for="dot in dotsByDate.get(cell.date)!"
            :key="dot.key"
            :data-status="dot.kind"
            :class="[
              'w-1.5 h-1.5 rounded-full',
              dot.kind === 'done' ? 'bg-[var(--bk-day-dot)]' : 'border-2 border-[var(--bk-day-dot)]',
            ]"
          />
        </div>

        <!-- Muscle group runes (max 3 per day): abajo, como antes -->
        <div
          v-if="runesByDate.has(cell.date)"
          class="absolute inset-x-0 bottom-1 flex justify-center gap-0.5"
        >
          <BkRune
            v-for="(runeName, i) in runesByDate.get(cell.date)!"
            :key="`rune-${cell.date}-${i}`"
            :name="runeName"
            :size="12"
          />
        </div>
      </button>
    </div>
  </div>
</template>

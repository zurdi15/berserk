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
// (v0.25.0: el dot HUECO de planificadas murió con la feature entera).
type DayDot = {
  key: string
  kind: 'done'
  // color inline SOLO en dots del overlay compartido (dato de usuario, no
  // token del sistema de diseño — mismo criterio de exención que BkUser.vue):
  // los dots PROPIOS siguen pintándose vía la clase bg-[var(--bk-day-dot)],
  // sin style inline. undefined aquí == "usa el color propio de arriba".
  color?: string
  username?: string
}

const ownDotsByDate = computed(() => {
  const map = new Map<string, DayDot[]>()
  for (const workout of props.month.workouts) {
    const existing = map.get(workout.date) ?? []
    map.set(workout.date, [...existing, { key: `w-${workout.id}`, kind: 'done' }])
  }
  return map
})

// SHARED-DOTS OVERLAY (v0.4.1, pivote de producto de zurdi): un dot 'done'
// por usuario que me ha compartido su calendario, coloreado con SU color
// (dato de usuario -> style inline, no token) y con el mismo fallback aurora
// que --bk-day-dot arriba si no tiene uno propio. `month.shared` llega
// undefined en modo atleta (el backend lo OMITE del JSON entero, ver
// api/domain.ts::CalendarMonthOut), así que el `?? []` de abajo apaga el
// overlay solo, sin repetir el chequeo de "modo atleta" aquí.
const sharedDotsByDate = computed(() => {
  const map = new Map<string, DayDot[]>()
  for (const sharedUser of props.month.shared ?? []) {
    for (const date of sharedUser.dates) {
      const existing = map.get(date) ?? []
      map.set(date, [
        ...existing,
        {
          key: `shared-${sharedUser.user_id}-${date}`,
          kind: 'done',
          color: sharedUser.color ?? 'var(--color-aurora)',
          username: sharedUser.username,
        },
      ])
    }
  }
  return map
})

// composición: mías primero (mismo orden de siempre), compartidas después —
// cap total a 3 sin cambiar (item 3 wave), pero ahora repartido entre ambas
// fuentes en vez de solo la propia
const dotsByDate = computed(() => {
  const map = new Map<string, DayDot[]>()
  const dates = new Set([...ownDotsByDate.value.keys(), ...sharedDotsByDate.value.keys()])
  for (const date of dates) {
    const mine = ownDotsByDate.value.get(date) ?? []
    const shared = sharedDotsByDate.value.get(date) ?? []
    map.set(date, [...mine, ...shared].slice(0, 3))
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
      class="grid grid-cols-7 gap-1.5 bk-stagger"
      data-testid="month-grid"
      :style="{ '--bk-day-dot': dotColor ?? 'var(--color-aurora)' }"
    >
      <button
        v-for="(cell, i) in grid"
        :key="`day-${cell.date}`"
        :data-testid="`day-cell-${cell.date}`"
        :style="{ '--bk-stagger-i': i % 7 }"
        class="relative aspect-square rounded-md border p-1 flex items-center justify-center overflow-hidden transition-colors hover:bg-slab"
        :class="{
          'border-ink-faint': !cell.inMonth,
          'text-ink-muted': !cell.inMonth,
          'bg-stone': cell.inMonth,
          // v0.16.0 (zurdi: 'el día actual casi no se aprecia'): border-line
          // y border-aurora empatan en especificidad y con ambas puestas
          // gana la que salga después en el stylesheet (la gris) — la celda
          // de hoy debe llevar SOLO la aurora
          'border-line': cell.inMonth && cell.date !== today,
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
        <span class="text-sm font-semibold">
          {{ Number(cell.date.slice(8, 10)) }}
        </span>

        <!-- Workout dots: arriba de la celda, uno por entreno (relleno) +
             uno por sesión aún planificada (hueco) + overlay compartido (ver
             dotsByDate arriba). Los dots compartidos llevan title (tooltip
             nativo) con el username y su color por style inline; los propios
             siguen sin tocar, coloreados por la clase de --bk-day-dot. -->
        <div
          v-if="dotsByDate.has(cell.date)"
          class="absolute inset-x-0 top-1 flex justify-center gap-0.5"
        >
          <span
            v-for="dot in dotsByDate.get(cell.date)!"
            :key="dot.key"
            :data-status="dot.kind"
            :data-shared-user="dot.username"
            :title="dot.username"
            :style="dot.color ? { backgroundColor: dot.color } : undefined"
            :class="[
              'w-1.5 h-1.5 rounded-full',
              dot.color
                ? undefined
                : dot.kind === 'done' ? 'bg-[var(--bk-day-dot)]' : 'border-2 border-[var(--bk-day-dot)]',
            ]"
          />
        </div>

        <!-- Muscle group runes (max 3 per day): abajo, como antes.
             facelift v2 (zurdi): con las esquinas más redondas (rounded-md),
             el grupo tiene que ser más COMPACTO — sin gap y runas un punto
             más pequeñas, para que las de los extremos no rocen el radio -->
        <div
          v-if="runesByDate.has(cell.date)"
          class="absolute inset-x-0 bottom-1 flex justify-center"
        >
          <BkRune
            v-for="(runeName, i) in runesByDate.get(cell.date)!"
            :key="`rune-${cell.date}-${i}`"
            :name="runeName"
            :size="11"
          />
        </div>
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { monthGrid, weekdayHeaders, todayIso } from '@/utils/dates'
import { isValidRuneName } from './groupRune'
import { statusClasses } from './statusClasses'
import BkRune from '@/lib/BkRune.vue'
import type { CalendarMonthOut } from '@/api/domain'
import type { RuneName } from '@/lib/runes'

const props = defineProps<{
  month: CalendarMonthOut
  year: number
  monthNum: number
  groupMap: Map<number, string>
}>()

const emit = defineEmits<{
  select: [date: string]
}>()

const locale = computed(() => 'es')
const grid = computed(() => monthGrid(props.year, props.monthNum))
const headers = computed(() => weekdayHeaders(locale.value))
const today = computed(() => todayIso())

// Agrupar scheduled por fecha
const scheduledByDate = computed(() => {
  const map = new Map<string, typeof props.month.scheduled>()
  for (const s of props.month.scheduled) {
    if (!map.has(s.date)) map.set(s.date, [])
    map.get(s.date)!.push(s)
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

    <!-- Month grid -->
    <div class="grid grid-cols-7 gap-1">
      <button
        v-for="cell in grid"
        :key="`day-${cell.date}`"
        :data-testid="`day-cell-${cell.date}`"
        class="aspect-square rounded-sm border p-1 flex flex-col items-center justify-center gap-1 transition-colors hover:bg-ink-subtle"
        :class="{
          'border-ink-faint': !cell.inMonth,
          'text-ink-muted': !cell.inMonth,
          'bg-stone border-ink-border': cell.inMonth,
          'border-2 border-aurora': cell.date === today && cell.inMonth,
        }"
        @click="selectDay(cell.date)"
      >
        <!-- Date number (timezone-safe) -->
        <span class="text-xs font-semibold">
          {{ Number(cell.date.slice(8, 10)) }}
        </span>

        <!-- Status dots -->
        <div v-if="scheduledByDate.has(cell.date)" class="flex gap-0.5">
          <span
            v-for="session in scheduledByDate.get(cell.date)!"
            :key="`status-${session.id}`"
            :data-status="session.status"
            :class="['w-1.5 h-1.5', statusClasses(session.status)]"
          />
        </div>

        <!-- Muscle group runes (max 3 per day) -->
        <div v-if="runesByDate.has(cell.date)" class="flex gap-0.5">
          <BkRune
            v-for="runeName in runesByDate.get(cell.date)!"
            :key="`rune-${runeName}`"
            :name="runeName"
            :size="12"
          />
        </div>
      </button>
    </div>
  </div>
</template>

<style scoped>
/* entry animation cascade */
@keyframes cascade {
  from {
    opacity: 0;
    transform: translateY(-4px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.grid > button {
  animation: cascade 0.3s ease-out;
  animation-fill-mode: both;
}

.grid > button:nth-child(1) { animation-delay: 0ms; }
.grid > button:nth-child(2) { animation-delay: 30ms; }
.grid > button:nth-child(3) { animation-delay: 60ms; }
.grid > button:nth-child(4) { animation-delay: 90ms; }
.grid > button:nth-child(5) { animation-delay: 120ms; }
.grid > button:nth-child(6) { animation-delay: 150ms; }
.grid > button:nth-child(7) { animation-delay: 180ms; }
.grid > button:nth-child(n+8) { animation-delay: calc((var(--nth, 8) - 7) * 30ms); }
</style>

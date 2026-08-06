<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'

import { cellsFor, monthLabelsFor } from './heatmap'

const props = defineProps<{
  data: { date: string; count: number }[]
  year: number
}>()

// el idioma de los labels es el del VIEWER, no el del atleta (mismo criterio
// que el resto del calendario — ver CalendarView.vue/MonthGrid.vue)
const { locale } = useI18n()

const cells = computed(() => cellsFor(props.year, props.data))
const monthLabels = computed(() => monthLabelsFor(props.year))
// nº de columnas (semanas) real de la rejilla: labels y celdas comparten la
// MISMA rejilla CSS y las mismas pistas de columna, así quedan alineados sin
// medir nada a mano — grid-column es 1-based, de ahí el +1 en ambos v-for
const weekCount = computed(() => Math.max(...cells.value.map((c) => c.week)) + 1)

const levels = [0.15, 0.4, 0.7, 1]

function monthName(month: number): string {
  return new Intl.DateTimeFormat(locale.value, { month: 'short' }).format(new Date(props.year, month - 1, 1))
}
</script>

<template>
  <Transition name="bk-fade" appear>
    <div class="overflow-x-auto">
      <div
        class="grid gap-1"
        :style="{ gridTemplateColumns: `repeat(${weekCount}, auto)`, gridTemplateRows: 'auto repeat(7, 1fr)' }"
      >
        <span
          v-for="label in monthLabels"
          :key="`month-${label.month}`"
          class="text-xs text-ink-faint whitespace-nowrap"
          :style="{ gridColumn: label.column + 1, gridRow: 1 }"
        >
          {{ monthName(label.month) }}
        </span>
        <div
          v-for="cell in cells"
          :key="cell.date"
          :title="`${cell.date}: ${cell.count}`"
          class="w-2.5 h-2.5 rounded-xs bg-aurora"
          :style="{ gridColumn: cell.week + 1, gridRow: cell.day + 2, opacity: cell.count ? levels[Math.min(cell.count - 1, 3)] : 0.08 }"
        />
      </div>
    </div>
  </Transition>
</template>

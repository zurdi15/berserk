<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'

import { monthBlocksFor } from './heatmap'

const props = defineProps<{
  data: { date: string; count: number }[]
  year: number
}>()

// el idioma de los labels es el del VIEWER, no el del atleta (mismo criterio
// que el resto del calendario — ver CalendarView.vue/MonthGrid.vue)
const { locale } = useI18n()

const blocks = computed(() => monthBlocksFor(props.year, props.data))

const levels = [0.15, 0.4, 0.7, 1]

function monthName(month: number): string {
  return new Intl.DateTimeFormat(locale.value, { month: 'short' }).format(new Date(props.year, month - 1, 1))
}
</script>

<template>
  <Transition name="bk-fade" appear>
    <div class="overflow-x-auto">
      <!-- bloques por mes, separados por un hueco real (no una rejilla continua):
           cada bloque es su propia mini-rejilla, con el label centrado encima -->
      <div class="flex items-start gap-3">
        <div v-for="block in blocks" :key="`month-${block.month}`" class="flex flex-col items-center gap-1">
          <span class="text-xs text-ink-faint text-center whitespace-nowrap">{{ monthName(block.month) }}</span>
          <div
            class="grid gap-1"
            :style="{ gridTemplateColumns: `repeat(${block.columnCount}, auto)`, gridTemplateRows: 'repeat(7, 1fr)' }"
          >
            <div
              v-for="cell in block.cells"
              :key="cell.date"
              :title="`${cell.date}: ${cell.count}`"
              class="w-2.5 h-2.5 rounded-xs bg-aurora"
              :style="{ gridColumn: cell.column + 1, gridRow: cell.day + 1, opacity: cell.count ? levels[Math.min(cell.count - 1, 3)] : 0.08 }"
            />
          </div>
        </div>
      </div>
    </div>
  </Transition>
</template>

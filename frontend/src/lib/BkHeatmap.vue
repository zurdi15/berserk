<script setup lang="ts">
import { computed } from 'vue'

import { cellsFor } from './heatmap'

const props = defineProps<{
  data: { date: string; count: number }[]
  year: number
}>()

const cells = computed(() => cellsFor(props.year, props.data))

const levels = [0.15, 0.4, 0.7, 1]
</script>

<template>
  <Transition name="bk-fade" appear>
    <div class="overflow-x-auto">
      <div
        class="grid gap-1"
        style="grid-template-rows: repeat(7, 1fr); grid-auto-flow: column"
      >
        <div
          v-for="cell in cells"
          :key="cell.date"
          :title="`${cell.date}: ${cell.count}`"
          class="w-2.5 h-2.5 rounded-xs bg-aurora"
          :style="{ opacity: cell.count ? levels[Math.min(cell.count - 1, 3)] : 0.08 }"
        />
      </div>
    </div>
  </Transition>
</template>

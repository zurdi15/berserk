<script setup lang="ts">
import { computed } from 'vue'

import BkCard from '@/lib/BkCard.vue'
import BkRune from '@/lib/BkRune.vue'

interface StreakData {
  weeks: number
}

const props = withDefaults(defineProps<{ streak: StreakData | null }>(), {})

const weeks = computed(() => props.streak?.weeks ?? 0)
const tone = computed<'ember' | 'ink'>(() => (weeks.value >= 1 ? 'ember' : 'ink'))
</script>

<template>
  <BkCard :title="$t('today.streakWeeks', { n: weeks })" data-testid="streak-card" :class="{ 'text-ember': weeks >= 1 }">
    <div class="flex items-center justify-between">
      <div class="bk-metric text-6xl">
        {{ weeks }}
      </div>
      <BkRune name="streak" :size="48" :tone="tone" />
    </div>
  </BkCard>
</template>

<script setup lang="ts">
import { computed } from 'vue'

import { useAnimatedNumber } from '@/composables/useAnimatedNumber'
import BkCard from '@/lib/BkCard.vue'
import BkRune from '@/lib/BkRune.vue'

interface StreakData {
  weeks: number
}

const props = withDefaults(defineProps<{ streak: StreakData | null }>(), {})

const weeks = computed(() => props.streak?.weeks ?? 0)
// el tono usa el valor crudo, no el animado: el color final ya debe estar
// fijado cuando arranca el conteo (ver TodayView, gating de item 2), el roll
// solo anima los dígitos
const tone = computed<'ember' | 'ink'>(() => (weeks.value >= 1 ? 'ember' : 'ink'))
const animatedWeeks = useAnimatedNumber(() => weeks.value)
</script>

<template>
  <BkCard :title="$t('today.streakWeeks', { n: weeks })" data-testid="streak-card" :class="{ 'text-ember': weeks >= 1 }">
    <div class="flex items-center justify-between">
      <div class="bk-metric text-6xl">
        {{ animatedWeeks ?? 0 }}
      </div>
      <BkRune name="streak" :size="48" :tone="tone" />
    </div>
  </BkCard>
</template>

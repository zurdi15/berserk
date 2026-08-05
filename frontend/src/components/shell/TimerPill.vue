<script setup lang="ts">
import { computed } from 'vue'
import { useRouter } from 'vue-router'

import BkRing from '@/lib/BkRing.vue'
import { useRestTimerStore } from '@/stores/restTimer'

const timer = useRestTimerStore()
const router = useRouter()

const label = computed(() => {
  const m = Math.floor(timer.remaining / 60)
  const s = String(timer.remaining % 60).padStart(2, '0')
  return `${m}:${s}`
})
</script>

<template>
  <Transition name="bk-pop">
    <button
      v-if="timer.active"
      data-testid="timer-pill"
      type="button"
      class="bk-press bk-slab fixed bottom-[calc(4rem+env(safe-area-inset-bottom))] sm:bottom-4 left-1/2 -translate-x-1/2 z-(--bk-z-timer) flex items-center gap-2 px-4 py-2 border-aurora text-aurora"
      :aria-label="`${$t('timer.rest')} ${timer.remaining}s`"
      @click="router.push({ name: 'workout' })"
    >
      <!-- la nav crece con el safe-area; la pill debe crecer con ella o la tapa -->
      <BkRing :value="timer.progress" :size="28" :stroke="3" />
      <span class="bk-metric text-lg">{{ label }}</span>
    </button>
  </Transition>
</template>

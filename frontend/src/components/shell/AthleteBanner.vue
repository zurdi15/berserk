<script setup lang="ts">
import BkRune from '@/lib/BkRune.vue'
import { useAthleteStore } from '@/stores/athlete'

const athlete = useAthleteStore()
</script>

<template>
  <Transition name="bk-rise">
    <div
      v-if="athlete.isViewing"
      class="flex items-center justify-between gap-2 px-4 py-2 border-b border-aurora bg-stone text-sm"
    >
      <span class="flex items-center gap-2 text-aurora">
        <BkRune name="shoulders" :size="16" />
        {{ $t('athlete.viewing', { name: athlete.viewing!.username }) }}
      </span>
      <button type="button" class="bk-press text-ink-muted hover:text-ink" @click="athlete.clear()">
        {{ $t('athlete.stop') }}
      </button>
    </div>
  </Transition>
</template>

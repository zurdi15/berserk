<script setup lang="ts">
import BkRune from './BkRune.vue'
import type { RuneName } from './runes'

withDefaults(defineProps<{ rune?: RuneName; message: string }>(), { rune: 'berserk' })
</script>

<template>
  <div class="flex flex-col items-center gap-4 py-10 text-center">
    <BkRune :name="rune" :size="48" carve class="text-ink-faint" />
    <p class="text-ink-muted max-w-xs">{{ message }}</p>
    <slot />
  </div>
</template>

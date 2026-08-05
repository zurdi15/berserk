<script setup lang="ts">
import { onBeforeUnmount, onMounted } from 'vue'

defineProps<{ open: boolean; title?: string }>()
const emit = defineEmits<{ close: [] }>()

function onKey(event: KeyboardEvent) {
  if (event.key === 'Escape') emit('close')
}

onMounted(() => window.addEventListener('keydown', onKey))
onBeforeUnmount(() => window.removeEventListener('keydown', onKey))
</script>

<template>
  <Teleport to="body">
    <Transition name="bk-fade">
      <div
        v-if="open"
        class="fixed inset-0 z-(--bk-z-sheet) bg-void/70"
        @click="emit('close')"
      />
    </Transition>
    <Transition name="bk-rise">
      <div
        v-if="open"
        role="dialog"
        aria-modal="true"
        class="fixed inset-x-0 bottom-0 z-(--bk-z-sheet) bk-slab rounded-t-md border-b-0 p-4 pb-[env(safe-area-inset-bottom)] max-h-[85dvh] overflow-y-auto"
      >
        <div class="mx-auto mb-3 h-1 w-10 rounded-xs bg-line-strong" aria-hidden="true" />
        <h2 v-if="title" class="font-display font-semibold uppercase tracking-wider text-sm mb-3">
          {{ title }}
        </h2>
        <slot />
      </div>
    </Transition>
  </Teleport>
</template>

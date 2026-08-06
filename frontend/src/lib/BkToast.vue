<script setup lang="ts">
import { useToastStore } from '@/stores/toast'

const store = useToastStore()
</script>

<template>
  <Teleport to="body">
    <div class="fixed inset-x-0 bottom-20 z-(--bk-z-toast) flex flex-col items-center gap-2 px-4 pointer-events-none">
      <TransitionGroup name="bk-rise">
        <output
          v-for="toast in store.toasts"
          :key="toast.id"
          class="bk-slab pointer-events-auto flex items-center gap-3 px-4 py-2.5 text-sm max-w-md w-fit"
          :class="{
            'border-danger text-danger': toast.kind === 'error',
            'border-ember text-ember': toast.kind === 'ember',
          }"
          @mouseenter="store.pause(toast.id)"
          @mouseleave="store.resume(toast.id)"
          @focusin="store.pause(toast.id)"
          @focusout="store.resume(toast.id)"
        >
          <span>{{ toast.message }}</span>
          <button
            type="button"
            class="shrink-0 leading-none text-ink-muted hover:text-ink"
            :aria-label="$t('common.dismiss')"
            @click="store.dismiss(toast.id)"
          >
            ✕
          </button>
        </output>
      </TransitionGroup>
    </div>
  </Teleport>
</template>

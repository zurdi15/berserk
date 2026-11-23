<script setup lang="ts">
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'

import BkSheet from '@/lib/BkSheet.vue'

const props = defineProps<{
  exerciseId: number
  exerciseName: string
  note: string
}>()

const { t } = useI18n()
const open = ref(false)
</script>

<template>
  <template v-if="note">
    <button
      type="button"
      class="bk-press inline-flex items-center justify-center w-10 h-10 rounded-full shrink-0 text-aurora hover:bg-aurora/10"
      :data-testid="`exercise-note-button-${exerciseId}`"
      :aria-label="t('library.viewExerciseNote', { name: exerciseName })"
      :title="t('library.viewExerciseNote', { name: exerciseName })"
      @click.stop="open = true"
    >
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"
        class="w-4 h-4"
        aria-hidden="true"
      >
        <path d="M5 3.5h10l4 4V20.5H5z" />
        <path d="M15 3.5v4h4M8 12h8M8 16h6" />
      </svg>
    </button>

    <BkSheet
      :open="open"
      :title="t('library.exerciseNoteTitle', { name: exerciseName })"
      @close="open = false"
    >
      <p
        class="whitespace-pre-wrap break-words text-sm text-ink"
        :data-testid="`exercise-note-content-${exerciseId}`"
      >
        {{ note }}
      </p>
    </BkSheet>
  </template>
</template>

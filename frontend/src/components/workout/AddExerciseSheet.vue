<script setup lang="ts">
import { ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'

import type { ExerciseOut } from '@/api/domain'
import { listExercises } from '@/api/domain'
import { exerciseName } from '@/components/routines/exerciseName'
import { toastApiError } from '@/utils/apiErrors'
import { useActiveWorkoutStore } from '@/stores/activeWorkout'
import { useAuthStore } from '@/stores/auth'
import BkField from '@/lib/BkField.vue'
import BkSheet from '@/lib/BkSheet.vue'

const props = defineProps<{ open: boolean }>()
const emit = defineEmits<{ close: [] }>()

const { t } = useI18n()
const auth = useAuthStore()
const activeWorkout = useActiveWorkoutStore()

const query = ref('')
const results = ref<ExerciseOut[]>([])
let searchTimeout: ReturnType<typeof setTimeout> | null = null

function search() {
  if (searchTimeout) clearTimeout(searchTimeout)
  searchTimeout = setTimeout(async () => {
    const q = query.value.trim()
    if (!q) {
      results.value = []
      return
    }
    try {
      results.value = await listExercises({ q })
    } catch (error) {
      toastApiError(error)
    }
  }, 300)
}

async function pick(exercise: ExerciseOut) {
  try {
    await activeWorkout.addExercise(exercise.id)
    query.value = ''
    results.value = []
    emit('close')
  } catch (error) {
    toastApiError(error)
  }
}

watch(
  () => props.open,
  (open) => {
    if (!open) {
      query.value = ''
      results.value = []
    }
  },
)

watch(query, search)
</script>

<template>
  <BkSheet :open="open" :title="t('workout.addExercise')" @close="emit('close')">
    <div class="space-y-3">
      <BkField v-model="query" :label="t('workout.searchExercise')" />
      <div v-if="results.length" class="max-h-64 overflow-y-auto space-y-1">
        <button
          v-for="exercise in results"
          :key="exercise.id"
          type="button"
          :data-testid="`exercise-result-${exercise.id}`"
          class="w-full text-left p-2 rounded-sm hover:bg-stone transition-colors text-sm text-ink border border-transparent hover:border-line"
          @click="pick(exercise)"
        >
          {{ exerciseName(exercise, auth.user?.locale || 'es') }}
        </button>
      </div>
    </div>
  </BkSheet>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'

import type { ExerciseOut } from '@/api/domain'
import { listExercises } from '@/api/domain'
import { exerciseName } from '@/components/routines/exerciseName'
import { toastApiError } from '@/utils/apiErrors'
import { useAthleteStore } from '@/stores/athlete'
import BkField from '@/lib/BkField.vue'

const props = defineProps<{ modelValue: number | null }>()
const emit = defineEmits<{ 'update:modelValue': [value: number | null] }>()

const { t, locale } = useI18n()
const athlete = useAthleteStore()

const allExercises = ref<ExerciseOut[]>([])
const query = ref('')

async function load() {
  try {
    // catálogo completo con hilo de atleta: buscamos entre los ejercicios de
    // quien se está viendo, no siempre los propios — luego se filtra en cliente
    allExercises.value = await listExercises({ userId: athlete.userId })
  } catch (error) {
    toastApiError(error)
  }
}

const filtered = computed(() => {
  const q = query.value.trim().toLowerCase()
  if (!q) return allExercises.value
  return allExercises.value.filter((e) => exerciseName(e, locale.value).toLowerCase().includes(q))
})

function select(id: number | null) {
  emit('update:modelValue', id)
}

onMounted(load)
watch(() => athlete.userId, load)
</script>

<template>
  <div class="space-y-2">
    <BkField v-model="query" :label="t('progress.searchExercise')" />
    <div class="max-h-48 overflow-y-auto space-y-1">
      <button
        type="button"
        data-testid="exercise-option-all"
        class="w-full text-left p-2 rounded-sm hover:bg-stone transition-colors text-sm border border-transparent hover:border-line"
        :class="modelValue === null ? 'text-aurora' : 'text-ink'"
        @click="select(null)"
      >
        {{ t('progress.allExercises') }}
      </button>
      <button
        v-for="exercise in filtered"
        :key="exercise.id"
        type="button"
        :data-testid="`exercise-option-${exercise.id}`"
        class="w-full text-left p-2 rounded-sm hover:bg-stone transition-colors text-sm border border-transparent hover:border-line"
        :class="modelValue === exercise.id ? 'text-aurora' : 'text-ink'"
        @click="select(exercise.id)"
      >
        {{ exerciseName(exercise, locale) }}
      </button>
    </div>
  </div>
</template>

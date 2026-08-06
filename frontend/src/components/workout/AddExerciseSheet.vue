<script setup lang="ts">
import { onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'

import type { ExerciseOut, MuscleGroupOut } from '@/api/domain'
import { listExercises, listMuscleGroups } from '@/api/domain'
import { exerciseName } from '@/components/routines/exerciseName'
import { toastApiError } from '@/utils/apiErrors'
import { useAuthStore } from '@/stores/auth'
import BkField from '@/lib/BkField.vue'
import BkRune from '@/lib/BkRune.vue'
import BkSheet from '@/lib/BkSheet.vue'
import { isValidRuneName, primaryMuscleGroup } from '@/lib/runeResolve'
import type { RuneName } from '@/lib/runes'
import type { WorkoutActions } from './workoutActions'

// store-agnóstico (round 8): solo necesita addExercise, pero se tipa contra
// el mismo contrato que WorkoutExerciseCard para no inventar otra interfaz
const props = defineProps<{ open: boolean; actions: Pick<WorkoutActions, 'addExercise'> }>()
const emit = defineEmits<{ close: [] }>()

const { t } = useI18n()
const auth = useAuthStore()

const query = ref('')
const results = ref<ExerciseOut[]>([])
// item 6: catálogo de grupos, cargado una vez, para resolver el tag de
// runa+nombre de cada resultado de búsqueda
const muscleGroups = ref<MuscleGroupOut[]>([])
let searchTimeout: ReturnType<typeof setTimeout> | null = null

function groupLabel(group: MuscleGroupOut): string {
  return auth.user?.locale === 'en' ? group.name_en : group.name_es
}

function primaryGroup(exercise: ExerciseOut): MuscleGroupOut | undefined {
  return primaryMuscleGroup(exercise, muscleGroups.value)
}

onMounted(async () => {
  try {
    muscleGroups.value = await listMuscleGroups()
  } catch (error) {
    toastApiError(error)
  }
})

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
    await props.actions.addExercise(exercise.id)
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
          class="w-full flex items-center justify-between gap-2 text-left p-2 rounded-sm hover:bg-stone transition-colors text-sm text-ink border border-transparent hover:border-line"
          @click="pick(exercise)"
        >
          <span class="truncate">{{ exerciseName(exercise, auth.user?.locale || 'es') }}</span>
          <!-- item 6: tag runa (+ nombre en filas anchas) del grupo primario -->
          <span
            v-if="primaryGroup(exercise)"
            class="inline-flex items-center gap-1 text-ink-faint shrink-0"
            :data-testid="`exercise-group-tag-${exercise.id}`"
          >
            <BkRune
              v-if="isValidRuneName(primaryGroup(exercise)!.slug)"
              :name="(primaryGroup(exercise)!.slug as RuneName)"
              :size="14"
            />
            <span class="hidden sm:inline text-xs">{{ groupLabel(primaryGroup(exercise)!) }}</span>
          </span>
        </button>
      </div>
    </div>
  </BkSheet>
</template>

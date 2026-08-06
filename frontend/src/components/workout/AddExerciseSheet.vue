<script setup lang="ts">
import { onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'

import type { ExerciseOut, MuscleGroupOut } from '@/api/domain'
import { listExercises, listMuscleGroups } from '@/api/domain'
import { exerciseName } from '@/components/routines/exerciseName'
import { toastApiError } from '@/utils/apiErrors'
import { useAuthStore } from '@/stores/auth'
import BkRune from '@/lib/BkRune.vue'
import BkSearchList from '@/lib/BkSearchList.vue'
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
// item 5: catálogo COMPLETO cargado una vez — BkSearchList filtra en
// cliente, ya no hay debounce ni una llamada a listExercises por tecla
const exercises = ref<ExerciseOut[]>([])
// gatea la lista hasta que el catálogo carga (mismo patrón que WorkoutView):
// sin esto, "sin resultados" parpadearía un instante antes de que llegue el
// fetch. true también en error, igual que el resto de la app.
const catalogReady = ref(false)
// item 6: catálogo de grupos, cargado una vez, para resolver el tag de
// runa+nombre de cada resultado de búsqueda
const muscleGroups = ref<MuscleGroupOut[]>([])

function groupLabel(group: MuscleGroupOut): string {
  return auth.user?.locale === 'en' ? group.name_en : group.name_es
}

function primaryGroup(exercise: ExerciseOut): MuscleGroupOut | undefined {
  return primaryMuscleGroup(exercise, muscleGroups.value)
}

function labelFor(exercise: ExerciseOut): string {
  return exerciseName(exercise, auth.user?.locale || 'es')
}

onMounted(async () => {
  try {
    const [exercisesList, muscleGroupsList] = await Promise.all([
      listExercises({}),
      listMuscleGroups(),
    ])
    exercises.value = exercisesList
    muscleGroups.value = muscleGroupsList
  } catch (error) {
    toastApiError(error)
  } finally {
    catalogReady.value = true
  }
})

async function pick(exercise: ExerciseOut) {
  try {
    await props.actions.addExercise(exercise.id)
    query.value = ''
    emit('close')
  } catch (error) {
    toastApiError(error)
  }
}

watch(
  () => props.open,
  (open) => {
    if (!open) query.value = ''
  },
)
</script>

<template>
  <BkSheet :open="open" :title="t('workout.addExercise')" @close="emit('close')">
    <BkSearchList
      v-if="catalogReady"
      v-model="query"
      :items="exercises"
      :label-fn="labelFor"
      :key-fn="(exercise: ExerciseOut) => exercise.id"
      :label="t('workout.searchExercise')"
      @select="pick"
    >
      <template #item="{ item: exercise }">
        <div
          :data-testid="`exercise-result-${exercise.id}`"
          class="w-full flex items-center justify-between gap-2 text-left p-2 text-sm text-ink"
        >
          <span class="truncate">{{ labelFor(exercise) }}</span>
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
        </div>
      </template>
    </BkSearchList>
  </BkSheet>
</template>

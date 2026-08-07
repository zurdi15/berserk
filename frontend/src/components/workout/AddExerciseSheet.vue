<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'

import type { ExerciseOut, MuscleGroupOut } from '@/api/domain'
import { listExercises, listMuscleGroups } from '@/api/domain'
import { exerciseName } from '@/components/routines/exerciseName'
import { toastApiError } from '@/utils/apiErrors'
import { useAuthStore } from '@/stores/auth'
import BkRune from '@/lib/BkRune.vue'
import BkSearchList from '@/lib/BkSearchList.vue'
import BkSheet from '@/lib/BkSheet.vue'
import GroupFilterSelect from '@/lib/GroupFilterSelect.vue'
import { isValidRuneName, primaryMuscleGroup } from '@/lib/runeResolve'
import type { RuneName } from '@/lib/runes'
import type { WorkoutActions } from './workoutActions'

// store-agnóstico (round 8): se tipa contra el mismo contrato que
// WorkoutExerciseCard para no inventar otra interfaz. addSupersetPair es
// OPCIONAL en el contrato: el editor retroactivo no agrupa (v1) y este sheet
// esconde el check de superserie cuando la acción no está.
const props = defineProps<{ open: boolean; actions: Pick<WorkoutActions, 'addExercise' | 'addSupersetPair'> }>()
const emit = defineEmits<{ close: [] }>()

const { t } = useI18n()
const auth = useAuthStore()

const query = ref('')
// v0.8.0 (zurdi rediseña la creación de superseries: "en vez de enlazar con
// un botón entre cada ejercicio, un check de superserie al añadir y eliges
// DOS"): con el check activo, el primer tap selecciona (fila resaltada, el
// sheet no se cierra) y el segundo añade AMBOS ya enlazados. Tocar de nuevo
// el seleccionado lo deselecciona.
const supersetMode = ref(false)
const firstPick = ref<ExerciseOut | null>(null)
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

// v0.9.4 (zurdi: "los ejercicios de cardio no salen"): el pajar de búsqueda
// incluye el nombre en AMBOS idiomas y la etiqueta del tipo de medición —
// teclear "cardio" lista Cinta/Bici/Elíptica… aunque ninguno se llame así,
// y un usuario en ES también encuentra por el nombre EN (o viceversa)
function searchTextFor(exercise: ExerciseOut): string {
  return `${exercise.name_es} ${exercise.name_en} ${t(`library.measurements.${exercise.measurement}`)}`
}

// v0.10.0 (zurdi: "mismos filtros que en la biblioteca") — v0.11.0: el
// selector es el componente compartido GroupFilterSelect
const filterGroupId = ref('')
const groupFiltered = computed(() => {
  const groupId = filterGroupId.value ? Number(filterGroupId.value) : null
  if (groupId === null) return exercises.value
  return exercises.value.filter((e) => e.muscle_groups.some((l) => l.muscle_group_id === groupId))
})

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
    if (supersetMode.value && props.actions.addSupersetPair) {
      if (firstPick.value === null) {
        firstPick.value = exercise
        return
      }
      if (firstPick.value.id === exercise.id) {
        firstPick.value = null
        return
      }
      await props.actions.addSupersetPair(firstPick.value.id, exercise.id)
    } else {
      await props.actions.addExercise(exercise.id)
    }
    resetState()
    emit('close')
  } catch (error) {
    toastApiError(error)
  }
}

function resetState() {
  query.value = ''
  firstPick.value = null
  supersetMode.value = false
  filterGroupId.value = ''
}

// desmarcar el check a mitad de selección descarta la primera elección
watch(supersetMode, (on) => {
  if (!on) firstPick.value = null
})

watch(
  () => props.open,
  (open) => {
    if (!open) resetState()
  },
)
</script>

<template>
  <BkSheet :open="open" :title="t('workout.addExercise')" @close="emit('close')">
    <!-- v0.8.0: check de superserie sobre la lista (solo si el store de esta
         superficie sabe añadir pares — el editor retroactivo no lo enseña) -->
    <div v-if="actions.addSupersetPair" class="px-1 pb-2 space-y-1">
      <label class="flex items-center gap-2 cursor-pointer">
        <input
          v-model="supersetMode"
          type="checkbox"
          class="rounded border border-line"
          data-testid="superset-mode-checkbox"
        />
        <span class="text-sm text-ink-muted">{{ t('workout.supersetMode') }}</span>
      </label>
      <p v-if="supersetMode" class="text-xs text-aurora pl-6" data-testid="superset-pick-hint">
        {{ firstPick ? t('workout.supersetPickSecond', { name: labelFor(firstPick) }) : t('workout.supersetPickFirst') }}
      </p>
    </div>
    <!-- v0.8.0 (zurdi: "la lista debería ocupar más pantalla"): de la
         max-h-64 por defecto de BkSearchList a media pantalla larga — dvh
         para que la UI del navegador móvil no la empuje bajo el borde -->
    <!-- v0.11.0: filtro de grupo compartido (GroupFilterSelect) -->
    <div v-if="catalogReady" class="pb-2" data-testid="add-exercise-group-filter">
      <GroupFilterSelect v-model="filterGroupId" :muscle-groups="muscleGroups" />
    </div>
    <BkSearchList
      v-if="catalogReady"
      v-model="query"
      :items="groupFiltered"
      :label-fn="labelFor"
      :search-fn="searchTextFor"
      :key-fn="(exercise: ExerciseOut) => exercise.id"
      :label="t('workout.searchExercise')"
      max-height-class="max-h-[55dvh]"
      @select="pick"
    >
      <template #item="{ item: exercise }">
        <div
          :data-testid="`exercise-result-${exercise.id}`"
          class="w-full flex items-center justify-between gap-2 text-left p-2 text-sm"
          :class="firstPick?.id === exercise.id ? 'text-aurora border border-aurora/50 rounded-sm' : 'text-ink'"
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

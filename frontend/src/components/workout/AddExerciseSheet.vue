<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'

import type { ExerciseOut, MuscleGroupOut } from '@/api/domain'
import { listExercises, listMuscleGroups } from '@/api/domain'
import { exerciseName } from '@/components/routines/exerciseName'
import { toastApiError } from '@/utils/apiErrors'
import { useAuthStore } from '@/stores/auth'
import BkMedia from '@/lib/BkMedia.vue'
import BkRune from '@/lib/BkRune.vue'
import BkSearchList from '@/lib/BkSearchList.vue'
import BkCheck from '@/lib/BkCheck.vue'
import BkSheet from '@/lib/BkSheet.vue'
import GroupFilterSelect from '@/lib/GroupFilterSelect.vue'
import { groupRune, primaryMuscleGroup, primaryRune } from '@/lib/runeResolve'
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

// v0.22.1: runa del pozo de fallback de BkMedia (rune ?? slug, el resolver
// central) — misma que la del chip de grupo de debajo del nombre
function mediaRune(exercise: ExerciseOut): RuneName | null {
  return primaryRune(exercise, muscleGroups.value)
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

async function loadCatalog() {
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
}

onMounted(loadCatalog)

// facelift v4 (bug de zurdi: "añado un ejercicio en biblioteca a mitad de
// entreno y al volver la lista no lo tiene"): bajo el KeepAlive del player
// este sheet vive montado para siempre — cada APERTURA refresca el catálogo
// en fondo (la lista retenida pinta al instante y se actualiza reactiva)
watch(
  () => props.open,
  (open) => {
    if (open) void loadCatalog()
  },
)

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
  <!-- facelift v2 (zurdi: doble scroll): el panel NO scrollea (scroll=false),
       solo la lista — el sheet reparte con flex y la lista toma el resto -->
  <BkSheet :open="open" :title="t('workout.addExercise')" :scroll="false" @close="emit('close')">
    <!-- v0.8.0: check de superserie sobre la lista (solo si el store de esta
         superficie sabe añadir pares — el editor retroactivo no lo enseña) -->
    <div v-if="actions.addSupersetPair" class="px-1 pb-2 space-y-1">
      <div class="flex items-center gap-2">
        <BkCheck
          size="sm"
          :model-value="supersetMode"
          data-testid="superset-mode-checkbox"
          :aria-label="t('workout.supersetMode')"
          @update:model-value="supersetMode = $event"
        />
        <button type="button" class="bk-press text-sm text-ink-muted" @click="supersetMode = !supersetMode">
          {{ t('workout.supersetMode') }}
        </button>
      </div>
      <p v-if="supersetMode" class="text-xs text-aurora pl-6" data-testid="superset-pick-hint">
        {{ firstPick ? t('workout.supersetPickSecond', { name: labelFor(firstPick) }) : t('workout.supersetPickFirst') }}
      </p>
    </div>
    <!-- v0.8.0 (zurdi: "la lista debería ocupar más pantalla"): de la
         max-h-64 por defecto de BkSearchList a media pantalla larga — dvh
         para que la UI del navegador móvil no la empuje bajo el borde -->
    <!-- v0.11.0: filtro de grupo compartido — v0.24.2 (zurdi): en la MISMA
         fila que la búsqueda (1/3 + 2/3), vía el slot beside de BkSearchList -->
    <BkSearchList
      v-if="catalogReady"
      v-model="query"
      class="flex-1 min-h-0 flex flex-col"
      :items="groupFiltered"
      :label-fn="labelFor"
      :search-fn="searchTextFor"
      :key-fn="(exercise: ExerciseOut) => exercise.id"
      :label="t('workout.searchExercise')"
      max-height-class="flex-1 min-h-0"
      @select="pick"
    >
      <template #beside>
        <div data-testid="add-exercise-group-filter">
          <GroupFilterSelect v-model="filterGroupId" :muscle-groups="muscleGroups" />
        </div>
      </template>
      <!-- v0.22.1 (zurdi: "que se parezca al de la biblioteca — que se vean
           las imágenes, y bajo el nombre un chip del grupo muscular"):
           misma anatomía de fila que ExerciseManager — thumb 9:16 con pozo
           rúnico + nombre multilínea + chip runa+grupo debajo -->
      <template #item="{ item: exercise }">
        <div
          :data-testid="`exercise-result-${exercise.id}`"
          class="w-full flex items-center gap-3 text-left p-2 text-sm"
          :class="firstPick?.id === exercise.id ? 'text-aurora border border-aurora/50 rounded-sm' : 'text-ink'"
        >
          <!-- testid SIN el prefijo exercise-result-: los specs (y el E2E)
               listan filas por ese prefijo y el thumb no es una fila -->
          <BkMedia
            :exercise="exercise"
            :rune="mediaRune(exercise)"
            size="tallSm"
            :data-testid="`result-thumb-${exercise.id}`"
          />
          <div class="min-w-0 flex-1">
            <p class="break-words">{{ labelFor(exercise) }}</p>
            <div v-if="primaryGroup(exercise)" class="mt-1">
              <span
                class="inline-flex items-center gap-1 rounded-full border border-line px-1.5 py-0.5 text-2xs text-ink-faint"
                :data-testid="`exercise-group-tag-${exercise.id}`"
              >
                <BkRune
                  v-if="groupRune(primaryGroup(exercise))"
                  :name="groupRune(primaryGroup(exercise))!"
                  :size="12"
                />
                <span>{{ groupLabel(primaryGroup(exercise)!) }}</span>
              </span>
            </div>
          </div>
        </div>
      </template>
    </BkSearchList>
  </BkSheet>
</template>

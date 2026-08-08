<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'

import type { ExerciseOut, MuscleGroupOut } from '@/api/domain'
import { getTrainedExercises, listExercises, listMuscleGroups } from '@/api/domain'
import { exerciseName } from '@/components/routines/exerciseName'
import { toastApiError } from '@/utils/apiErrors'
import { foldSearchText } from '@/utils/searchFold'
import { useAthleteStore } from '@/stores/athlete'
import BkField from '@/lib/BkField.vue'
import BkRune from '@/lib/BkRune.vue'
import GroupFilterSelect from '@/lib/GroupFilterSelect.vue'
import { isValidRuneName, primaryMuscleGroup } from '@/lib/runeResolve'
import type { RuneName } from '@/lib/runes'

const props = defineProps<{ modelValue: number | null }>()
const emit = defineEmits<{ 'update:modelValue': [value: number | null] }>()

const { t, locale } = useI18n()
const athlete = useAthleteStore()

const allExercises = ref<ExerciseOut[]>([])
// item 6: catálogo de grupos, mismo hilo de atleta que el resto — para
// resolver el tag de runa+nombre de cada opción
const muscleGroups = ref<MuscleGroupOut[]>([])
const query = ref('')
// controla el esqueleto (item 3a), no un gating tipo TodayView: mientras
// carga se muestran filas shimmer con el mismo hueco que la lista real, para
// que lo de abajo (chart + selector de métrica) no salte de sitio al llegar
// los datos. true también en error, para no dejar el esqueleto para siempre.
const ready = ref(false)
// ids de ejercicios con al menos una serie registrada (item 5): el punto
// aurora junto al nombre — mismo Set para lookup O(1) en el template
const trainedIds = ref<Set<number>>(new Set())

async function load() {
  try {
    // catálogo completo con hilo de atleta: buscamos entre los ejercicios de
    // quien se está viendo, no siempre los propios — luego se filtra en cliente
    const [list, trained, groups] = await Promise.all([
      listExercises({ userId: athlete.userId }),
      getTrainedExercises(athlete.userId),
      listMuscleGroups(athlete.userId),
    ])
    allExercises.value = list
    trainedIds.value = new Set(trained.exercise_ids)
    muscleGroups.value = groups
  } catch (error) {
    toastApiError(error)
  } finally {
    ready.value = true
  }
}

// v0.10.0 (zurdi: "mismos filtros y barra de búsqueda que en la biblioteca"):
// mismo pajar (nombre ES+EN + etiqueta del tipo — "cardio" encuentra la
// cinta) y mismo filtro de grupo muscular que ExerciseManager
const filterGroupId = ref('')

const filtered = computed(() => {
  // v0.11.1: pliegue de acentos en ambos lados — "eliptica" encuentra "Elíptica"
  const q = foldSearchText(query.value.trim())
  const groupId = filterGroupId.value ? Number(filterGroupId.value) : null
  return allExercises.value.filter((e) => {
    if (groupId !== null && !e.muscle_groups.some((l) => l.muscle_group_id === groupId)) return false
    if (!q) return true
    const haystack = foldSearchText(`${e.name_es} ${e.name_en} ${t(`library.measurements.${e.measurement}`)}`)
    return haystack.includes(q)
  })
})

function select(id: number | null) {
  emit('update:modelValue', id)
}

function primaryGroup(exercise: ExerciseOut): MuscleGroupOut | undefined {
  return primaryMuscleGroup(exercise, muscleGroups.value)
}

function groupLabel(group: MuscleGroupOut): string {
  return locale.value === 'en' ? group.name_en : group.name_es
}

onMounted(load)
watch(() => athlete.userId, load)
</script>

<template>
  <div class="h-full flex flex-col gap-2">
    <!-- v0.8.2 (zurdi: "solo debería scrollear la lista, ocupe lo que
         ocupe"): el picker vuelve a rellenar el hueco que le da su padre —
         el panel de Entrenos ahora está acotado al viewport con altura
         MEDIDA (ver ProgressView.measureTrainingPanel), así que la lista
         toma el resto por flex (flex-1 min-h-0) y es lo ÚNICO que scrollea;
         los topes en dvh de la v0.8.1 (70/40) eran estimaciones y su
         sobrante generaba justo el mini-scroll de página que zurdi reportó.
         La cesión de espacio al chart la anima el propio bloque del chart
         (bk-reveal-y), no esta lista. La opción "Todos los ejercicios" murió
         en la v0.8.1 (seleccionaba null → sin chart, botón a ninguna parte).
         (comentario dentro de la raíz para no crear un fragmento de dos
         raíces que rompa el fall-through de atributos) -->
    <!-- v0.11.8 (zurdi: "siempre arriba el selector de grupo y abajo la
         búsqueda"): mismo orden en todas las superficies con filtro+buscador -->
    <div class="shrink-0" data-testid="picker-group-filter">
      <GroupFilterSelect v-model="filterGroupId" :muscle-groups="muscleGroups" />
    </div>
    <BkField v-model="query" :label="t('progress.searchExercise')" class="shrink-0" />

    <!-- esqueleto mientras carga: mismo hueco que la lista real -->
    <div v-if="!ready" class="flex-1 min-h-0 overflow-y-auto space-y-1" data-testid="exercise-list-skeleton">
      <div v-for="n in 6" :key="n" class="h-9 rounded-sm bg-stone bk-shimmer" aria-hidden="true" />
    </div>

    <div
      v-else
      class="flex-1 min-h-0 overflow-y-auto space-y-1"
      data-testid="exercise-picker-list"
    >
      <button
        v-for="exercise in filtered"
        :key="exercise.id"
        type="button"
        :data-testid="`exercise-option-${exercise.id}`"
        class="w-full text-left p-2 rounded-sm hover:bg-stone transition-colors text-sm border border-transparent hover:border-line flex items-center justify-between gap-1.5"
        :class="modelValue === exercise.id ? 'text-aurora' : 'text-ink'"
        @click="select(exercise.id)"
      >
        <span class="truncate">{{ exerciseName(exercise, locale) }}</span>
        <span class="flex items-center gap-1.5 shrink-0">
          <!-- item 6: tag runa (+ nombre en filas anchas) del grupo primario -->
          <span
            v-if="primaryGroup(exercise)"
            class="inline-flex items-center gap-1 text-ink-faint"
            :data-testid="`exercise-group-tag-${exercise.id}`"
          >
            <BkRune
              v-if="isValidRuneName(primaryGroup(exercise)!.slug)"
              :name="(primaryGroup(exercise)!.slug as RuneName)"
              :size="14"
            />
            <span class="hidden sm:inline text-xs">{{ groupLabel(primaryGroup(exercise)!) }}</span>
          </span>
          <!-- punto aurora (item 5): mismo visual que los dots "done" del
               calendario (w-1.5 h-1.5 rounded-full bg-aurora, ver MonthGrid.vue)
               — señal de que este ejercicio ya tiene series registradas -->
          <span
            v-if="trainedIds.has(exercise.id)"
            class="w-1.5 h-1.5 rounded-full bg-aurora shrink-0"
            data-testid="trained-dot"
            :title="t('progress.hasData')"
          >
            <span class="sr-only">{{ t('progress.hasData') }}</span>
          </span>
        </span>
      </button>
    </div>
  </div>
</template>

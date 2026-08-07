<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'

import type { ExerciseOut, MuscleGroupOut } from '@/api/domain'
import { getTrainedExercises, listExercises, listMuscleGroups } from '@/api/domain'
import { exerciseName } from '@/components/routines/exerciseName'
import { toastApiError } from '@/utils/apiErrors'
import { useAthleteStore } from '@/stores/athlete'
import BkField from '@/lib/BkField.vue'
import BkRune from '@/lib/BkRune.vue'
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

const filtered = computed(() => {
  const q = query.value.trim().toLowerCase()
  if (!q) return allExercises.value
  return allExercises.value.filter((e) => exerciseName(e, locale.value).toLowerCase().includes(q))
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
  <div class="flex flex-col gap-2">
    <!-- v0.5.0 (modelo de scroll único): este picker es una de las pocas
         cajas HOJA con scroll interno que sobreviven — la lista lleva su
         propia altura tope (max-h-[50dvh]: media pantalla, deja sitio al
         chart que la sigue en flujo en ProgressView) en vez de recibir el
         hueco por cadena flex del padre. dvh y no vh: en móvil el viewport
         dinámico descuenta la UI del navegador. (comentario dentro de la
         raíz para no crear un fragmento de dos raíces que rompa el
         fall-through de atributos) -->
    <BkField v-model="query" :label="t('progress.searchExercise')" class="shrink-0" />

    <!-- esqueleto mientras carga: mismo hueco que la lista real -->
    <div v-if="!ready" class="max-h-[50dvh] overflow-y-auto space-y-1" data-testid="exercise-list-skeleton">
      <div v-for="n in 6" :key="n" class="h-9 rounded-sm bg-stone bk-shimmer" aria-hidden="true" />
    </div>

    <div v-else class="max-h-[50dvh] overflow-y-auto space-y-1" data-testid="exercise-picker-list">
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

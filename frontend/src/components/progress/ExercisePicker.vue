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
// controla el esqueleto (item 3a), no un gating tipo TodayView: mientras
// carga se muestran filas shimmer con el mismo hueco que la lista real, para
// que lo de abajo (chart + selector de métrica) no salte de sitio al llegar
// los datos. true también en error, para no dejar el esqueleto para siempre.
const ready = ref(false)

async function load() {
  try {
    // catálogo completo con hilo de atleta: buscamos entre los ejercicios de
    // quien se está viendo, no siempre los propios — luego se filtra en cliente
    allExercises.value = await listExercises({ userId: athlete.userId })
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

onMounted(load)
watch(() => athlete.userId, load)
</script>

<template>
  <div class="h-full flex flex-col gap-2">
    <!-- columna flexible: el campo de búsqueda no crece, la lista se lleva
         todo el resto del alto disponible (item 3c — el padre le da el hueco
         vía flex-1 min-h-0). (comentario dentro de la raíz para no crear un
         fragmento de dos raíces que rompa el fall-through de atributos) -->
    <BkField v-model="query" :label="t('progress.searchExercise')" class="shrink-0" />

    <!-- esqueleto mientras carga: mismo hueco que la lista real -->
    <div v-if="!ready" class="flex-1 min-h-0 overflow-y-auto space-y-1" data-testid="exercise-list-skeleton">
      <div v-for="n in 6" :key="n" class="h-9 rounded-sm bg-stone bk-shimmer" aria-hidden="true" />
    </div>

    <div v-else class="flex-1 min-h-0 overflow-y-auto space-y-1">
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

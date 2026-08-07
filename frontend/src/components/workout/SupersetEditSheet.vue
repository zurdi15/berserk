<script setup lang="ts">
import { onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'

import type { ExerciseOut, MuscleGroupOut } from '@/api/domain'
import { listExercises, listMuscleGroups } from '@/api/domain'
import { exerciseName } from '@/components/routines/exerciseName'
import { toastApiError } from '@/utils/apiErrors'
import { useAuthStore } from '@/stores/auth'
import BkActionBtn from '@/lib/BkActionBtn.vue'
import BkButton from '@/lib/BkButton.vue'
import BkRune from '@/lib/BkRune.vue'
import BkSearchList from '@/lib/BkSearchList.vue'
import BkSheet from '@/lib/BkSheet.vue'
import { isValidRuneName, primaryMuscleGroup } from '@/lib/runeResolve'
import type { RuneName } from '@/lib/runes'

// v0.9.1 (zurdi: "en vez de un icono que la deshaga, un botón de editar
// donde se pueda quitar la superserie o cambiar alguno de los ejercicios"):
// el sheet de gestión del bloque — lista los miembros con su acción de
// cambiar (abre el buscador del catálogo para elegir el sustituto) y el
// deshacer como acción destructiva al pie. La mecánica real de cambiar
// (quitar+añadir+recolocar+reenlazar) vive en el store
// (activeWorkout.swapSupersetMember); aquí solo se elige QUÉ cambiar por QUÉ.
export interface SupersetMember {
  weid: number
  name: string
  rune: RuneName | null
  hasSets: boolean
}

const props = defineProps<{ open: boolean; label: string | null; members: SupersetMember[] }>()
const emit = defineEmits<{ close: []; dissolve: []; swap: [oldWeid: number, newExerciseId: number] }>()

const { t } = useI18n()
const auth = useAuthStore()

const query = ref('')
const swappingWeid = ref<number | null>(null)
const catalog = ref<ExerciseOut[]>([])
const muscleGroups = ref<MuscleGroupOut[]>([])
const catalogReady = ref(false)

onMounted(async () => {
  try {
    const [exercisesList, groupsList] = await Promise.all([listExercises({}), listMuscleGroups()])
    catalog.value = exercisesList
    muscleGroups.value = groupsList
  } catch (error) {
    toastApiError(error)
  } finally {
    catalogReady.value = true
  }
})

function labelFor(exercise: ExerciseOut): string {
  return exerciseName(exercise, auth.user?.locale || 'es')
}

function runeFor(exercise: ExerciseOut): RuneName | null {
  const group = primaryMuscleGroup(exercise, muscleGroups.value)
  return group && isValidRuneName(group.slug) ? (group.slug as RuneName) : null
}

function pickReplacement(exercise: ExerciseOut) {
  if (swappingWeid.value === null) return
  emit('swap', swappingWeid.value, exercise.id)
  reset()
  emit('close')
}

function reset() {
  query.value = ''
  swappingWeid.value = null
}

watch(
  () => props.open,
  (open) => {
    if (!open) reset()
  },
)
</script>

<template>
  <BkSheet
    :open="open"
    :title="t('workout.superset', { label: label ?? '' })"
    @close="emit('close')"
  >
    <div class="space-y-4 p-4">
      <template v-if="swappingWeid === null">
        <ul class="space-y-2" data-testid="superset-member-list">
          <li
            v-for="member in members"
            :key="member.weid"
            class="flex items-center justify-between gap-2 p-2 bg-stone rounded-sm border border-line"
          >
            <span class="flex items-center gap-2 min-w-0">
              <BkRune v-if="member.rune" :name="member.rune" :size="14" />
              <span class="text-sm text-ink truncate">{{ member.name }}</span>
            </span>
            <BkActionBtn
              icon="edit"
              :data-testid="`superset-swap-${member.weid}`"
              :aria-label="t('workout.supersetSwap')"
              @click="swappingWeid = member.weid"
            />
          </li>
        </ul>

        <BkButton
          variant="danger"
          block
          data-testid="superset-dissolve-btn"
          @click="emit('dissolve'); emit('close')"
        >
          {{ t('workout.supersetDissolve') }}
        </BkButton>
      </template>

      <template v-else>
        <p class="text-sm text-ink-muted">{{ t('workout.supersetSwapPick') }}</p>
        <!-- aviso solo cuando de verdad hay algo que perder: cambiar un
             miembro con series registradas las descarta con él -->
        <p
          v-if="members.find((m) => m.weid === swappingWeid)?.hasSets"
          class="text-xs text-danger"
          data-testid="superset-swap-warning"
        >
          {{ t('workout.supersetSwapWarning') }}
        </p>
        <BkSearchList
          v-if="catalogReady"
          v-model="query"
          :items="catalog"
          :label-fn="labelFor"
          :key-fn="(exercise: ExerciseOut) => exercise.id"
          :label="t('workout.searchExercise')"
          max-height-class="max-h-[50dvh]"
          @select="pickReplacement"
        >
          <template #item="{ item: exercise }">
            <div
              :data-testid="`superset-replacement-${exercise.id}`"
              class="w-full flex items-center justify-between gap-2 text-left p-2 text-sm text-ink"
            >
              <span class="truncate">{{ labelFor(exercise) }}</span>
              <BkRune v-if="runeFor(exercise)" :name="runeFor(exercise)!" :size="14" class="shrink-0" />
            </div>
          </template>
        </BkSearchList>
      </template>
    </div>
  </BkSheet>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute, useRouter } from 'vue-router'

import type { ExerciseOut, MuscleGroupOut, PersonalRecordOut } from '@/api/domain'
import { listExercises, listMuscleGroups } from '@/api/domain'
import { toastApiError } from '@/utils/apiErrors'
import { useAuthStore } from '@/stores/auth'
import { useToastStore } from '@/stores/toast'
import { useWorkoutEditorStore } from '@/stores/workoutEditor'
import AddExerciseSheet from '@/components/workout/AddExerciseSheet.vue'
import WorkoutExerciseCard from '@/components/workout/WorkoutExerciseCard.vue'
import BkButton from '@/lib/BkButton.vue'
import BkDateField from '@/lib/BkDateField.vue'
import BkField from '@/lib/BkField.vue'
import BkRune from '@/lib/BkRune.vue'

const { t, locale } = useI18n()
const route = useRoute()
const router = useRouter()
const auth = useAuthStore()
const toast = useToastStore()
const workoutEditor = useWorkoutEditorStore()

const exercises = ref<ExerciseOut[]>([])
const muscleGroups = ref<MuscleGroupOut[]>([])
const addSheetOpen = ref(false)
const muscleTagPending = ref(false)
const note = ref('')
let noteTimeout: ReturnType<typeof setTimeout> | null = null

const units = computed(() => ((auth.user?.units as 'kg' | 'lb') || 'kg'))
const exerciseMap = computed(() => new Map(exercises.value.map((e) => [e.id, e])))
const exerciseIds = computed(() => workoutEditor.workout?.exercises.map((e) => e.id) ?? [])

const dateModel = computed({
  get: () => workoutEditor.workout?.date ?? '',
  set: (value: string) => patchDate(value),
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
  }
}

async function patchDate(value: string) {
  try {
    await workoutEditor.patch({ date: value })
  } catch (error) {
    toastApiError(error)
  }
}

async function pickFeeling(value: number) {
  try {
    await workoutEditor.patch({ feeling: value })
  } catch (error) {
    toastApiError(error)
  }
}

async function saveNote() {
  try {
    await workoutEditor.patch({ note: note.value || null })
  } catch (error) {
    toastApiError(error)
  }
}

// nota con debounce, mismo patrón que FinishSummary: evita un request por tecla
watch(note, () => {
  if (noteTimeout) clearTimeout(noteTimeout)
  noteTimeout = setTimeout(saveNote, 600)
})

function isMuscleTagActive(id: number): boolean {
  return workoutEditor.workout?.muscle_tag_ids.includes(id) ?? false
}

async function toggleMuscleTag(id: number) {
  // mismo guard de vuelo único que WorkoutView: dos toggles en paralelo
  // partirían del mismo muscle_tag_ids "viejo" y perderían una actualización
  if (muscleTagPending.value) return
  const current = workoutEditor.workout?.muscle_tag_ids ?? []
  const next = current.includes(id) ? current.filter((tagId) => tagId !== id) : [...current, id]
  muscleTagPending.value = true
  try {
    await workoutEditor.setMuscleTags(next)
  } catch (error) {
    toastApiError(error)
  } finally {
    muscleTagPending.value = false
  }
}

// un PR recalculado al corregir historial no se celebra con BkCelebration
// (esa fanfarria es solo para el registro EN VIVO, ver WorkoutView.vue) —
// aquí un toast discreto con el conteo es suficiente, y solo cuando hay algo
// nuevo que contar
function onRecorded(records: PersonalRecordOut[]) {
  if (!records.length) return
  toast.push('ember', t('workout.retroPrs', { n: records.length }))
}

async function loadWorkout() {
  const id = Number(route.params.id)
  try {
    await workoutEditor.load(id)
    note.value = workoutEditor.workout?.note || ''
  } catch (error) {
    toastApiError(error)
    router.push({ name: 'calendar' })
  }
}

onMounted(() => {
  loadCatalog()
  loadWorkout()
})
</script>

<template>
  <div v-if="workoutEditor.workout" class="space-y-4 bk-stagger">
    <div class="flex items-center gap-2" :style="{ '--bk-stagger-i': 0 }">
      <button
        type="button"
        data-testid="back-to-calendar"
        class="bk-press w-8 h-8 shrink-0 text-ink-muted hover:text-ink"
        :aria-label="t('workout.backToCalendar')"
        @click="router.push({ name: 'calendar' })"
      >
        <span aria-hidden="true">‹</span>
      </button>
      <h1 class="font-display font-semibold uppercase tracking-wider text-sm text-ink">
        {{ t('workout.editTitle') }}
      </h1>
    </div>

    <div class="bk-slab p-4" :style="{ '--bk-stagger-i': 1 }">
      <BkDateField v-model="dateModel" :label="t('calendar.date')" />
    </div>

    <div v-if="muscleGroups.length" class="bk-slab p-4 space-y-2" :style="{ '--bk-stagger-i': 2 }">
      <p class="text-sm text-ink-muted">{{ t('workout.muscleTags') }}</p>
      <div class="flex flex-wrap gap-2">
        <button
          v-for="group in muscleGroups"
          :key="group.id"
          type="button"
          :data-testid="`muscle-tag-${group.id}`"
          class="bk-press px-3 py-1.5 rounded-sm border text-sm disabled:opacity-50"
          :class="isMuscleTagActive(group.id) ? 'border-aurora text-aurora bg-aurora/10' : 'border-line text-ink-muted'"
          :aria-pressed="isMuscleTagActive(group.id) ? 'true' : 'false'"
          :disabled="muscleTagPending"
          @click="toggleMuscleTag(group.id)"
        >
          {{ locale === 'es' ? group.name_es : group.name_en }}
        </button>
      </div>
    </div>

    <WorkoutExerciseCard
      v-for="(we, i) in workoutEditor.workout.exercises"
      :key="we.id"
      :style="{ '--bk-stagger-i': i + 3 }"
      :workout-exercise="we"
      :exercise="exerciseMap.get(we.exercise_id)"
      :muscle-groups="muscleGroups"
      :exercise-ids="exerciseIds"
      :units="units"
      :locale="locale"
      :actions="workoutEditor"
      :rest-enabled="false"
      @recorded="onRecorded"
    />

    <BkButton
      variant="ghost"
      block
      :style="{ '--bk-stagger-i': workoutEditor.workout.exercises.length + 3 }"
      @click="addSheetOpen = true"
    >
      {{ t('workout.addExercise') }}
    </BkButton>

    <AddExerciseSheet :open="addSheetOpen" :actions="workoutEditor" @close="addSheetOpen = false" />

    <div class="bk-slab p-4 space-y-3" :style="{ '--bk-stagger-i': workoutEditor.workout.exercises.length + 4 }">
      <p class="text-sm text-ink-muted">{{ t('workout.feeling') }}</p>
      <div class="flex gap-2">
        <button
          v-for="n in 5"
          :key="n"
          type="button"
          :data-testid="`feeling-${n}`"
          class="p-2 rounded-sm border"
          :class="workoutEditor.workout.feeling === n ? 'border-aurora text-aurora bg-aurora/10' : 'border-line text-ink-muted'"
          :aria-label="`${t('workout.feeling')} ${n}`"
          @click="pickFeeling(n)"
        >
          <BkRune name="berserk" :size="20" />
        </button>
      </div>
      <BkField v-model="note" :label="t('workout.note')" />
    </div>
  </div>
</template>

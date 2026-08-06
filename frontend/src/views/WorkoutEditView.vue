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
import NeonPulse from '@/components/workout/NeonPulse.vue'
import SaveAsRoutineSheet from '@/components/workout/SaveAsRoutineSheet.vue'
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
const saveAsRoutineOpen = ref(false)
const note = ref('')
// item 9: mismo pulso que WorkoutView, disparado en CUALQUIER logueo exitoso
// (aquí nunca compite con una celebración de PR: ver onRecorded, que solo
// lanza un toast discreto — la corrección retroactiva de historial no celebra)
const neonPulse = ref(false)
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

async function toggleStretched() {
  if (!workoutEditor.workout) return
  const next = !workoutEditor.workout.stretched
  try {
    await workoutEditor.patch({ stretched: next })
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

// item 4: derivados de los ejercicios del entreno, de solo lectura (ver
// WorkoutView.vue, mismo criterio) — ya no hay editor manual de tags
const derivedMuscleGroups = computed(() =>
  muscleGroups.value.filter((g) => workoutEditor.workout?.muscle_tag_ids.includes(g.id)),
)

// un PR recalculado al corregir historial no se celebra con BkCelebration
// (esa fanfarria es solo para el registro EN VIVO, ver WorkoutView.vue) —
// aquí un toast discreto con el conteo es suficiente, y solo cuando hay algo
// nuevo que contar
function onRecorded(records: PersonalRecordOut[]) {
  if (!records.length) return
  toast.push('ember', t('workout.retroPrs', { n: records.length }))
}

// item 9: aquí SIEMPRE dispara (nunca hay celebración de PR con la que
// competir en este editor retroactivo, ver onRecorded arriba)
function onLogged() {
  neonPulse.value = true
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
    <NeonPulse :show="neonPulse" @done="neonPulse = false" />

    <div class="flex items-center justify-between gap-2" :style="{ '--bk-stagger-i': 0 }">
      <div class="flex items-center gap-2 min-w-0">
        <button
          type="button"
          data-testid="back-to-calendar"
          class="bk-press w-8 h-8 shrink-0 text-ink-muted hover:text-ink"
          :aria-label="t('workout.backToCalendar')"
          @click="router.push({ name: 'calendar' })"
        >
          <span aria-hidden="true">‹</span>
        </button>
        <h1 class="font-display font-semibold uppercase tracking-wider text-sm text-ink truncate">
          {{ t('workout.editTitle') }}
        </h1>
      </div>
      <BkButton
        variant="ghost"
        size="sm"
        data-testid="save-as-routine-btn"
        @click="saveAsRoutineOpen = true"
      >
        {{ t('workout.saveAsRoutine') }}
      </BkButton>
    </div>

    <div class="bk-slab p-4" :style="{ '--bk-stagger-i': 1 }">
      <BkDateField v-model="dateModel" :label="t('calendar.date')" />
    </div>

    <div v-if="derivedMuscleGroups.length" class="bk-slab p-4 space-y-2" :style="{ '--bk-stagger-i': 2 }">
      <p class="text-sm text-ink-muted">{{ t('workout.muscleTags') }}</p>
      <div class="flex flex-wrap gap-2">
        <span
          v-for="group in derivedMuscleGroups"
          :key="group.id"
          :data-testid="`muscle-tag-${group.id}`"
          class="px-3 py-1.5 rounded-sm border border-line text-sm text-ink-muted"
        >
          {{ locale === 'es' ? group.name_es : group.name_en }}
        </span>
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
      @logged="onLogged"
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

      <button
        type="button"
        data-testid="stretched-toggle"
        class="bk-press flex items-center gap-2 text-sm"
        :class="workoutEditor.workout.stretched ? 'text-aurora' : 'text-ink-muted'"
        :aria-pressed="workoutEditor.workout.stretched ? 'true' : 'false'"
        @click="toggleStretched"
      >
        <span
          class="w-4 h-4 rounded-xs border shrink-0"
          :class="workoutEditor.workout.stretched ? 'border-aurora bg-aurora/20' : 'border-line'"
          aria-hidden="true"
        />
        {{ t('workout.stretched') }}
      </button>
    </div>

    <SaveAsRoutineSheet
      :open="saveAsRoutineOpen"
      :workout="workoutEditor.workout"
      @close="saveAsRoutineOpen = false"
    />
  </div>
</template>

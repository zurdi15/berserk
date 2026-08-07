<script setup lang="ts">
import { computed, nextTick, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute, useRouter } from 'vue-router'

import type { ExerciseOut, MuscleGroupOut, PersonalRecordOut } from '@/api/domain'
import { listExercises, listMuscleGroups } from '@/api/domain'
import { toastApiError } from '@/utils/apiErrors'
import { formatDateTimeShort, isoDate } from '@/utils/dates'
import { parseUtc } from '@/utils/datetime'
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
import BkStepper from '@/lib/BkStepper.vue'
import BkTimeField from '@/lib/BkTimeField.vue'

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

// item 5 (post-0.3.0): timing editable de un entreno retroactivo — 8A lo
// crea con started_at == ended_at (duración 0), lo que sesgaba las stats de
// tiempo de gym. Solo aplica sobre un entreno YA CERRADO (el backend
// devuelve 409 workout_not_finished si no lo está; este editor SIEMPRE
// trabaja sobre entrenos cerrados, pero se guarda igual por si acaso).
const finished = computed(() => workoutEditor.workout?.ended_at != null)

// se lee con el MISMO pipeline (parseUtc + hora local) que el resto de la
// app muestra started_at (ver WorkoutDayInfo.vue, round 10) — así el campo
// de edición y la tarjeta del calendario siempre coinciden en lo que enseñan
const startTimeModel = computed({
  get: () => (workoutEditor.workout?.started_at ? formatDateTimeShort(workoutEditor.workout.started_at) : null),
  set: (value: string | null) => { if (value) patchStartedTime(value) },
})

// convierte la hora LOCAL elegida (lo que el usuario ve/escribe) a la hora
// UTC que el backend combina de forma naive con workout.date (mismo criterio
// que start_workout: ver update_workout en el backend). Si la conversión
// cruza medianoche, la fecha UTC resultante ya no es workout.date — se
// manda esa fecha corregida en el MISMO patch (el backend ya sabe componer
// fecha+hora en un solo request, ver el orden documentado ahí).
function localTimeToUtcPatch(dateIso: string, hhmm: string): { date?: string; started_time: string } {
  const [y, m, d] = dateIso.split('-').map(Number)
  const [h, min] = hhmm.split(':').map(Number)
  const local = new Date(y, m - 1, d, h, min)
  const utcDate = isoDate(new Date(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate()))
  const utcTime = `${String(local.getUTCHours()).padStart(2, '0')}:${String(local.getUTCMinutes()).padStart(2, '0')}`
  return utcDate === dateIso ? { started_time: utcTime } : { date: utcDate, started_time: utcTime }
}

async function patchStartedTime(hhmm: string) {
  if (!workoutEditor.workout) return
  try {
    await workoutEditor.patch(localTimeToUtcPatch(workoutEditor.workout.date, hhmm))
  } catch (error) {
    toastApiError(error)
  }
}

// minutos: no lleva conversión de huso (es una duración, no un instante
// absoluto) — solo started_at/ended_at (parseUtc) para calcularla
const durationMinutes = ref(0)

async function patchDuration(minutes: number) {
  try {
    await workoutEditor.patch({ duration_minutes: minutes })
  } catch (error) {
    toastApiError(error)
  }
}

// mismo patrón de debounce que la nota de abajo: evita un request por click
// del stepper (repite cada 140ms mientras se mantiene pulsado)
let durationTimeout: ReturnType<typeof setTimeout> | null = null
watch(durationMinutes, (value) => {
  if (durationTimeout) clearTimeout(durationTimeout)
  durationTimeout = setTimeout(() => patchDuration(value), 600)
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
//
// fix M4 (revisión, mismo criterio que WorkoutView.vue): ciclo false→true
// real vía nextTick para que un segundo logueo mientras el pulso anterior
// seguía animándose SÍ remonte NeonPulse y reinicie la animación
async function onLogged() {
  neonPulse.value = false
  await nextTick()
  neonPulse.value = true
}

async function loadWorkout() {
  const id = Number(route.params.id)
  try {
    await workoutEditor.load(id)
    note.value = workoutEditor.workout?.note || ''
    const w = workoutEditor.workout
    if (w?.started_at && w?.ended_at) {
      durationMinutes.value = Math.max(
        0,
        Math.round((parseUtc(w.ended_at).getTime() - parseUtc(w.started_at).getTime()) / 60000),
      )
    }
  } catch (error) {
    toastApiError(error)
    router.push({ name: 'calendar' })
  }
}

onMounted(() => {
  loadCatalog()
  loadWorkout()
})

// v0.5.0 (modelo de scroll único, ver ShellView.vue): la raíz FLUYE contra
// <main> — sin cabecera de navegación que fijar arriba (el back-button/
// título son parte del contenido normal, no una tab strip persistente),
// mismo criterio que TodayView.vue.
// (comentario aquí y no como primer hijo de <template>: un comentario ahí
// convierte la raíz en un fragmento de dos nodos y rompe wrapper.classes(),
// ver BkStepper.vue/TodayView.vue.)
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

    <div class="bk-slab p-4 space-y-3" :style="{ '--bk-stagger-i': 1 }">
      <BkDateField v-model="dateModel" :label="t('calendar.date')" />

      <!-- item 5 (post-0.3.0): timing editable — 8A crea el retroactivo con
           duración 0, esto deja corregirla desde aquí -->
      <div v-if="finished" class="grid grid-cols-2 gap-3">
        <BkTimeField v-model="startTimeModel" :label="t('workout.startTime')" />
        <div class="min-w-0 flex flex-col items-center">
          <span class="block text-xs text-ink-muted mb-2">{{ t('workout.durationMinutes') }}</span>
          <BkStepper v-model="durationMinutes" size="compact" :step="5" :min="0" :max="600" suffix="min" />
        </div>
      </div>
      <p v-if="finished && startTimeModel" class="text-sm text-ink-faint" data-testid="workout-time-range">
        {{ startTimeModel }} → {{ formatDateTimeShort(workoutEditor.workout.ended_at) }}
      </p>
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

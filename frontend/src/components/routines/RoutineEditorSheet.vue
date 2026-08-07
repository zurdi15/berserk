<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'

import type { ExerciseOut, RoutineOut } from '@/api/domain'
import { createRoutine, listExercises, listMuscleGroups, replaceRoutineExercises, updateRoutine } from '@/api/domain'
import { toastApiError } from '@/utils/apiErrors'
import { displayToKg, kgToDisplay } from '@/utils/units'
import { useAuthStore } from '@/stores/auth'
import { useToastStore } from '@/stores/toast'
import BkActionBtn from '@/lib/BkActionBtn.vue'
import BkSheet from '@/lib/BkSheet.vue'
import BkButton from '@/lib/BkButton.vue'
import BkField from '@/lib/BkField.vue'
import BkSelect from '@/lib/BkSelect.vue'
import BkStepper from '@/lib/BkStepper.vue'
import BkRune from '@/lib/BkRune.vue'
import { FUTHARK_RUNE_NAMES, type RuneName } from '@/lib/runes'
import {
  isLinkedAt,
  normalizeSupersets,
  supersetLabels,
  toggleSupersetLink,
  type SupersetValue,
} from '@/lib/supersets'
import { exerciseName } from './exerciseName'

const props = defineProps<{ open: boolean; routine?: RoutineOut }>()
const emit = defineEmits<{ close: [] }>()

const { t } = useI18n()
const auth = useAuthStore()
const toast = useToastStore()

// kg es el canónico en el store/API; el stepper de peso objetivo se muestra y
// edita en la unidad del usuario (ver frontend/src/utils/units.ts)
const units = computed(() => (auth.user?.units as 'kg' | 'lb') || 'kg')

// State
const name = ref('')
const description = ref('')
const selectedRune = ref<string | null>(null)
// ROUTINES-OPEN: check "Global" (renombrado desde is_public), ahora vive en
// el editor — disponible a CUALQUIER usuario sobre su propia rutina, ya
// marcable al crear (a diferencia del viejo flujo globalize, admin-only y
// que cedía la propiedad)
const isGlobal = ref(false)
const exercises = ref<Array<{
  id: string
  exercise_id: number
  target_sets: number
  target_reps: number | null
  target_weight_kg: number | null
  rest_seconds: string | null
  // v0.5.0 superseries: índice de grupo normalizado (0,1,2…) o null =
  // suelto — SIEMPRE se mantiene normalizado tras cada mutación (enlazar,
  // reordenar, quitar), ver renormalizeSupersets
  superset_group: number | null
}>>([])
// Immutable full catalog (loaded once, used for row-name resolution)
const allExercises = ref<ExerciseOut[]>([])
// Search results buffer (used only for picker display)
const searchResults = ref<ExerciseOut[]>([])
const muscleGroups = ref<Array<{ id: number; slug: string; name_es: string; name_en: string; owner_id: number | null }>>([])
const searchQuery = ref('')
const loading = ref(false)
let searchTimeout: ReturnType<typeof setTimeout> | null = null

// Computed
// v0.3.0: el picker ya no cura runas de grupo muscular (esas quedan
// reservadas a los propios grupos, ver WeekSummaryCard) — ofrece el futhark
// antiguo completo, para que la runa de la rutina sea una elección libre y
// no se confunda visualmente con "esta rutina trabaja este músculo"
const runes: RuneName[] = FUTHARK_RUNE_NAMES
const berserkerRune: RuneName = 'berserk'

const groupedExercises = computed(() => {
  if (!searchQuery.value) return []

  // Use searchResults for picker display
  const groups = new Map<number, ExerciseOut[]>()
  searchResults.value.forEach(exercise => {
    const primaryMuscle = exercise.muscle_groups.find(m => m.is_primary)
    if (primaryMuscle) {
      if (!groups.has(primaryMuscle.muscle_group_id)) {
        groups.set(primaryMuscle.muscle_group_id, [])
      }
      groups.get(primaryMuscle.muscle_group_id)!.push(exercise)
    }
  })
  return groups
})

const restOptions = computed(() => [
  { value: '30', label: '30 s' },
  { value: '60', label: '60 s' },
  { value: '90', label: '90 s' },
  { value: '120', label: '120 s' },
  { value: '180', label: '180 s' },
])

// Methods
async function loadData() {
  try {
    const [exercisesData, muscleGroupsData] = await Promise.all([
      listExercises({}),
      listMuscleGroups(),
    ])
    allExercises.value = exercisesData
    muscleGroups.value = muscleGroupsData
  } catch (error) {
    toastApiError(error)
  }
}

async function searchExercises() {
  if (searchTimeout) clearTimeout(searchTimeout)

  searchTimeout = setTimeout(async () => {
    try {
      const query = searchQuery.value.trim()
      if (!query) {
        searchResults.value = []
        return
      }
      const results = await listExercises({ q: query })
      searchResults.value = results
    } catch (error) {
      toastApiError(error)
    }
  }, 300)
}

async function initializeForm() {
  if (props.routine) {
    name.value = props.routine.name
    description.value = props.routine.description || ''
    selectedRune.value = props.routine.rune || null
    isGlobal.value = props.routine.is_global ?? false
    exercises.value = props.routine.exercises.map(e => ({
      id: String(e.id),
      exercise_id: e.exercise_id,
      target_sets: e.target_sets,
      target_reps: e.target_reps || 0,
      target_weight_kg: e.target_weight_kg || null,
      rest_seconds: e.rest_seconds ? String(e.rest_seconds) : '60',
      superset_group: e.superset_group ?? null,
    }))
    // defensivo: lo guardado puede venir sin normalizar (p.ej. un
    // save-as-routine con contigüidad rota por un reorden mid-workout) —
    // el editor trabaja siempre sobre la forma canónica
    renormalizeSupersets()
  } else {
    name.value = ''
    description.value = ''
    selectedRune.value = null
    // v0.4.3 item 10 (zurdi): "Global" nace marcado al crear — la mayoría de
    // rutinas nuevas se quieren compartidas de entrada, y el backend ya
    // asume lo mismo (RoutineIn.is_global default True). Editar sigue
    // leyendo el valor REAL de la rutina (rama de arriba, sin cambios).
    isGlobal.value = true
    exercises.value = []
  }

  await loadData()
}

function addExercise(exercise: ExerciseOut) {
  exercises.value.push({
    id: String(Date.now()),
    exercise_id: exercise.id,
    target_sets: 3,
    target_reps: 0,
    target_weight_kg: null,
    rest_seconds: '60',
    // un ejercicio recién añadido nace suelto: se enlaza a mano después
    superset_group: null,
  })
  // Only clear search query and results, keep allExercises immutable
  searchQuery.value = ''
  searchResults.value = []
}

function removeExercise(id: string) {
  exercises.value = exercises.value.filter(e => e.id !== id)
  // quitar un miembro puede dejar su grupo en 1 (se disuelve) o unir dos
  // runs del mismo valor que ahora quedan contiguos (siguen siendo un grupo)
  renormalizeSupersets()
}

function moveExerciseUp(index: number) {
  if (index > 0) {
    const temp = exercises.value[index]
    exercises.value[index] = exercises.value[index - 1]
    exercises.value[index - 1] = temp
    // reordenar recomputa la contigüidad: un grupo roto por el movimiento se
    // parte (los runs de 1 que queden se disuelven a sueltos)
    renormalizeSupersets()
  }
}

function moveExerciseDown(index: number) {
  if (index < exercises.value.length - 1) {
    const temp = exercises.value[index]
    exercises.value[index] = exercises.value[index + 1]
    exercises.value[index + 1] = temp
    renormalizeSupersets()
  }
}

// ── v0.5.0 superseries ─────────────────────────────────────────────────────

function currentSupersetValues(): SupersetValue[] {
  return exercises.value.map(e => e.superset_group)
}

// referencia NUEVA de array y de cada fila cambiada — mutar el cache
// reactivo in-place esquiva el proxy de Vue (gotcha del repo)
function applySupersetValues(values: SupersetValue[]) {
  exercises.value = exercises.value.map((e, i) =>
    e.superset_group === (values[i] ?? null) ? e : { ...e, superset_group: values[i] ?? null },
  )
}

function renormalizeSupersets() {
  applySupersetValues(normalizeSupersets(currentSupersetValues()))
}

// frontera entre la fila index-1 y la fila index (el botón vive entre ambas)
function toggleLink(index: number) {
  applySupersetValues(toggleSupersetLink(currentSupersetValues(), index))
}

function linkedAt(index: number): boolean {
  return isLinkedAt(currentSupersetValues(), index)
}

// etiqueta presentacional A/B/C… por fila (null = suelto)
const rowSupersetLabels = computed(() => supersetLabels(exercises.value.map(e => e.superset_group)))

async function saveRoutine() {
  if (!name.value.trim()) {
    toast.push('error', t('routines.nameRequired'))
    return
  }

  try {
    loading.value = true

    let routine: RoutineOut
    if (props.routine) {
      routine = await updateRoutine(props.routine.id, {
        name: name.value,
        description: description.value || null,
        rune: selectedRune.value,
        is_global: isGlobal.value,
      })
    } else {
      routine = await createRoutine({
        name: name.value,
        description: description.value || null,
        rune: selectedRune.value,
        is_global: isGlobal.value,
      })
    }

    // Always save exercises (even if empty)
    await replaceRoutineExercises(routine.id, exercises.value.map(e => ({
      exercise_id: e.exercise_id,
      target_sets: e.target_sets,
      target_reps: e.target_reps || null,
      target_weight_kg: e.target_weight_kg || null,
      rest_seconds: e.rest_seconds ? parseInt(e.rest_seconds, 10) : null,
      // ya normalizado (0,1,2…): cada mutación local renormaliza
      superset_group: e.superset_group,
    })))

    emit('close')
  } catch (error) {
    toastApiError(error)
  } finally {
    loading.value = false
  }
}

watch(
  () => props.open,
  async (open) => {
    if (open) {
      await initializeForm()
    }
  },
  { immediate: true }
)

watch(
  () => searchQuery.value,
  () => {
    searchExercises()
  },
  { flush: 'post' }
)
</script>

<template>
  <BkSheet :open="open" :title="routine ? $t('routines.editRoutine') : $t('routines.newRoutine')" @close="emit('close')">
    <div class="space-y-4">
      <!-- Name Field -->
      <BkField
        v-model="name"
        :label="$t('routines.name')"
      />

      <!-- Description Field -->
      <BkField
        v-model="description"
        :label="$t('routines.description')"
        type="text"
      />

      <!-- Rune Picker: futhark completo (24) + berserk aparte — con el
           grupo muscular fuera del picker, la lista es larga, así que se
           limita la altura y se deja scroll (mismo patrón que la lista de
           ejercicios agrupados más abajo) en vez de empujar el resto del sheet -->
      <div class="space-y-2">
        <span class="block text-sm text-ink-muted">{{ $t('routines.rune') }}</span>
        <div class="flex gap-3 flex-wrap max-h-48 overflow-y-auto">
          <button
            v-for="runeName in runes"
            :key="runeName"
            type="button"
            class="flex items-center justify-center p-3 rounded-sm border transition-all"
            :class="selectedRune === runeName
              ? 'border-aurora bg-aurora/10 text-aurora'
              : 'border-line text-ink-muted hover:border-line-strong hover:text-ink'
            "
            @click="selectedRune = selectedRune === runeName ? null : runeName"
          >
            <BkRune :name="(runeName as RuneName)" :size="24" />
          </button>
          <button
            type="button"
            class="flex items-center justify-center p-3 rounded-sm border transition-all"
            :class="selectedRune === 'berserk'
              ? 'border-aurora bg-aurora/10 text-aurora'
              : 'border-line text-ink-muted hover:border-line-strong hover:text-ink'
            "
            @click="selectedRune = selectedRune === 'berserk' ? null : 'berserk'"
          >
            <BkRune name="berserk" :size="24" />
          </button>
        </div>
      </div>

      <!-- ROUTINES-OPEN (course correction): check "Global" — disponible a
           CUALQUIER usuario sobre su propia rutina, ya marcable al crear.
           Sustituye al viejo toggle "Compartir como plantilla" de la
           tarjeta y a la conversión admin-only "Convertir en global" (que
           cedía la propiedad) — mismo patrón visual que el checkbox
           isPublic de ExerciseManager. -->
      <div class="space-y-1">
        <label class="flex items-center gap-2 cursor-pointer">
          <input
            v-model="isGlobal"
            type="checkbox"
            class="rounded border border-line"
            data-testid="routine-is-global-checkbox"
          />
          <span class="text-sm text-ink-muted">{{ $t('routines.isGlobal') }}</span>
        </label>
        <p class="text-xs text-ink-faint pl-6">{{ $t('routines.isGlobalHint') }}</p>
      </div>

      <!-- Exercises Section -->
      <div class="space-y-3">
        <h3 class="text-sm font-semibold text-ink">{{ $t('routines.exercises') }}</h3>

        <!-- Exercise Rows -->
        <div v-if="exercises.length > 0" class="space-y-3 border-t border-line pt-3">
          <template v-for="(exercise, index) in exercises" :key="exercise.id">
            <!-- v0.5.0 superseries: botón de enlazar ENTRE filas consecutivas
                 — enlaza/desenlaza esta fila con la anterior; el icono cambia
                 de eslabón a eslabón roto según el estado (BkActionBtn) -->
            <div v-if="index > 0" class="flex justify-center">
              <BkActionBtn
                :icon="linkedAt(index) ? 'unlink' : 'link'"
                :data-testid="`superset-toggle-${index}`"
                :aria-label="linkedAt(index) ? $t('routines.unlinkSuperset') : $t('routines.linkSuperset')"
                :aria-pressed="linkedAt(index) ? 'true' : 'false'"
                @click="toggleLink(index)"
              />
            </div>
            <div
              class="space-y-2 p-3 bg-stone rounded-sm border"
              :class="rowSupersetLabels[index] ? 'border-aurora/40' : 'border-line'"
            >
            <!-- Exercise name (read-only) + chip de superserie (A/B/C…) -->
            <div class="flex items-center gap-2">
              <span class="text-sm font-medium text-ink">
                {{ exerciseName(allExercises.find(e => e.id === exercise.exercise_id), auth.user?.locale || 'es') }}
              </span>
              <span
                v-if="rowSupersetLabels[index]"
                :data-testid="`superset-row-chip-${index}`"
                class="text-xs text-aurora border border-aurora/40 rounded-sm px-1.5 py-0.5 shrink-0"
              >
                {{ $t('routines.supersetLabel', { label: rowSupersetLabels[index] }) }}
              </span>
            </div>

            <!-- Target Sets -->
            <div>
              <label class="block text-xs text-ink-muted mb-2">{{ $t('routines.targetSets') }}</label>
              <BkStepper
                :model-value="exercise.target_sets"
                :min="1"
                :max="10"
                @update:model-value="exercise.target_sets = $event"
              />
            </div>

            <!-- Target Reps (optional) -->
            <div>
              <label class="block text-xs text-ink-muted mb-2">{{ $t('routines.targetReps') }}</label>
              <BkStepper
                :model-value="exercise.target_reps || 0"
                :min="0"
                :max="100"
                @update:model-value="exercise.target_reps = $event"
              />
            </div>

            <!-- Target Weight -->
            <div>
              <label class="block text-xs text-ink-muted mb-2">{{ $t('routines.targetWeight') }}</label>
              <BkStepper
                :model-value="kgToDisplay(exercise.target_weight_kg || 0, units)"
                :min="0"
                :max="kgToDisplay(300, units)"
                :step="2.5"
                :suffix="`${auth.user?.units || 'kg'}`"
                @update:model-value="exercise.target_weight_kg = $event > 0 ? displayToKg($event, units) : null"
              />
            </div>

            <!-- Rest Seconds -->
            <BkSelect
              :model-value="exercise.rest_seconds || '60'"
              :label="$t('routines.restSeconds')"
              :options="restOptions"
              @update:model-value="exercise.rest_seconds = $event"
            />

            <!-- Action buttons — item 6 (ola de pulido v0.3.0): flechas
                 icon-only en vez de los botones "Arriba"/"Abajo" de texto,
                 mismo affordance compacto que WorkoutExerciseCard.vue (↑/↓,
                 aria-label conservado en vez del texto visible) -->
            <div class="flex items-center gap-1">
              <button
                v-if="index > 0"
                type="button"
                class="bk-press w-8 h-8 text-ink-muted hover:text-ink"
                :aria-label="$t('routines.moveUp')"
                @click="moveExerciseUp(index)"
              >
                ↑
              </button>
              <button
                v-if="index < exercises.length - 1"
                type="button"
                class="bk-press w-8 h-8 text-ink-muted hover:text-ink"
                :aria-label="$t('routines.moveDown')"
                @click="moveExerciseDown(index)"
              >
                ↓
              </button>
              <BkButton
                variant="danger"
                size="sm"
                class="ml-auto"
                @click="removeExercise(exercise.id)"
              >
                {{ $t('routines.remove') }}
              </BkButton>
            </div>
            </div>
          </template>
        </div>

        <!-- Add Exercise -->
        <div class="space-y-2 border-t border-line pt-3">
          <BkField
            v-model="searchQuery"
            data-testid="exercise-search"
            :label="$t('routines.addExercise')"
            type="text"
          />

          <!-- Grouped exercises by muscle -->
          <div v-if="searchQuery && allExercises.length > 0" class="max-h-40 overflow-y-auto space-y-2">
            <div v-for="[muscleId, groupExercises] in groupedExercises" :key="muscleId" class="space-y-1">
              <div class="flex items-center gap-2 px-2 text-xs text-ink-muted font-semibold">
                <BkRune
                  v-if="muscleGroups.find(m => m.id === muscleId)"
                  :name="(muscleGroups.find(m => m.id === muscleId)!.slug as RuneName)"
                  :size="16"
                />
                <span>{{ muscleGroups.find(m => m.id === muscleId)?.[auth.user?.locale === 'es' ? 'name_es' : 'name_en'] }}</span>
              </div>
              <button
                v-for="exercise in groupExercises"
                :key="exercise.id"
                type="button"
                class="w-full text-left p-2 pl-6 rounded-sm hover:bg-stone transition-colors text-sm text-ink border border-transparent hover:border-line"
                @click="addExercise(exercise)"
              >
                {{ exerciseName(exercise, auth.user?.locale || 'es') }}
              </button>
            </div>
          </div>
        </div>
      </div>

      <!-- Action Buttons -->
      <div class="flex gap-2 pt-3 border-t border-line">
        <BkButton
          variant="primary"
          block
          :loading="loading"
          @click="saveRoutine"
        >
          {{ $t('common.save') }}
        </BkButton>
        <BkButton
          variant="ghost"
          block
          @click="emit('close')"
        >
          {{ $t('common.cancel') }}
        </BkButton>
      </div>
    </div>
  </BkSheet>
</template>

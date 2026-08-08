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
import BkRune from '@/lib/BkRune.vue'
import { FUTHARK_RUNE_NAMES, type RuneName } from '@/lib/runes'
import { normalizeSupersets, supersetLabels, type SupersetValue } from '@/lib/supersets'
import { primaryRune } from '@/lib/runeResolve'
import { exerciseName } from './exerciseName'
import RoutineExerciseRow, { type EditorRow } from './RoutineExerciseRow.vue'
import AddExerciseSheet from '@/components/workout/AddExerciseSheet.vue'
import SupersetEditSheet from '@/components/workout/SupersetEditSheet.vue'

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
// v0.10.0: filas tipadas por el componente de fila (misma anatomía que la
// card del entreno) — superset_group SIEMPRE normalizado tras cada mutación
const exercises = ref<EditorRow[]>([])
// Immutable full catalog (loaded once, used for row-name resolution)
const allExercises = ref<ExerciseOut[]>([])
const muscleGroups = ref<Array<{ id: number; slug: string; name_es: string; name_en: string; owner_id: number | null }>>([])
const loading = ref(false)

// v0.3.0: el picker ya no cura runas de grupo muscular (esas quedan
// reservadas a los propios grupos, ver WeekSummaryCard) — ofrece el futhark
// antiguo completo, para que la runa de la rutina sea una elección libre y
// no se confunda visualmente con "esta rutina trabaja este músculo"
const runes: RuneName[] = FUTHARK_RUNE_NAMES
const berserkerRune: RuneName = 'berserk'

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

// v0.10.0 (zurdi: "el flow de rutina, exactamente el mismo que el de
// entrenamiento"): añadir pasa por el MISMO AddExerciseSheet del entreno
// (buscador con pajar ES+EN+tipo, filtro de grupo y check de superserie) —
// este adaptador satisface su contrato WorkoutActions con mutaciones locales
let rowSeq = 0
function pushRow(exerciseId: number) {
  exercises.value.push({
    id: `row-${++rowSeq}-${exercises.value.length}`,
    exercise_id: exerciseId,
    target_sets: 3,
    target_reps: 0,
    target_weight_kg: null,
    rest_seconds: '60',
    // un ejercicio recién añadido nace suelto (o enlazado vía addSupersetPair)
    superset_group: null,
  })
}

const addSheetOpen = ref(false)
const editorActions = {
  addExercise: async (exerciseId: number) => {
    pushRow(exerciseId)
  },
  addSupersetPair: async (exerciseA: number, exerciseB: number) => {
    pushRow(exerciseA)
    pushRow(exerciseB)
    const values = currentSupersetValues()
    const marker = values.length
    values[values.length - 2] = marker
    values[values.length - 1] = marker
    applySupersetValues(normalizeSupersets(values))
  },
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

// etiqueta presentacional A/B/C… por fila (null = suelto)
const rowSupersetLabels = computed(() => supersetLabels(exercises.value.map(e => e.superset_group)))

// v0.10.0: bloques como en WorkoutView — miembros de superserie DENTRO de un
// contenedor con chip de cabecera + botón de editar (SupersetEditSheet
// reutilizado tal cual: cambiar un miembro aquí es una mutación local de la
// fila, sin baile de servidor); los toggles de frontera de la v0.5.0 mueren
// también aquí, igual que murieron en el entreno en la v0.8.0.
type EditorBlock = {
  grouped: boolean
  label: string | null
  entries: { row: EditorRow; index: number }[]
}
const editorBlocks = computed<EditorBlock[]>(() => {
  const labels = rowSupersetLabels.value
  const blocks: EditorBlock[] = []
  exercises.value.forEach((row, index) => {
    const label = labels[index]
    const last = blocks[blocks.length - 1]
    if (label !== null && last?.grouped && last.label === label) {
      last.entries.push({ row, index })
    } else {
      blocks.push({ grouped: label !== null, label, entries: [{ row, index }] })
    }
  })
  return blocks
})

const editingBlock = ref<EditorBlock | null>(null)
const editingMembers = computed(() =>
  (editingBlock.value?.entries ?? []).map((entry) => {
    const exercise = allExercises.value.find((e) => e.id === entry.row.exercise_id)
    return {
      weid: entry.index,
      name: exerciseName(exercise, auth.user?.locale || 'es'),
      rune: primaryRune(exercise, muscleGroups.value) ?? null,
      // en el editor no hay series que perder al cambiar
      hasSets: false,
    }
  }),
)

function dissolveEditingBlock() {
  const block = editingBlock.value
  if (!block) return
  const values = currentSupersetValues()
  for (const entry of block.entries) values[entry.index] = null
  applySupersetValues(normalizeSupersets(values))
}

function swapEditingMember(index: number, newExerciseId: number) {
  exercises.value = exercises.value.map((row, i) =>
    i === index ? { ...row, exercise_id: newExerciseId } : row,
  )
}

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
    await replaceRoutineExercises(routine.id, exercises.value.map(e => {
      // v0.11.1: cardio no tiene reps/peso/descanso — la fila los esconde,
      // pero una rutina vieja puede traerlos guardados: se purgan al salvar
      const isCardio = allExercises.value.find(x => x.id === e.exercise_id)?.measurement === 'cardio'
      return {
        exercise_id: e.exercise_id,
        target_sets: e.target_sets,
        target_reps: isCardio ? null : e.target_reps || null,
        target_weight_kg: isCardio ? null : e.target_weight_kg || null,
        rest_seconds: !isCardio && e.rest_seconds ? parseInt(e.rest_seconds, 10) : null,
        // ya normalizado (0,1,2…): cada mutación local renormaliza
        superset_group: e.superset_group,
      }
    }))

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
    } else {
      addSheetOpen.value = false
      editingBlock.value = null
    }
  },
  { immediate: true }
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

        <!-- v0.10.0 (zurdi: "el flow de rutina, exactamente el mismo que el
             de entrenamiento"): bloques de superserie con contenedor aurora
             + chip + editar (SupersetEditSheet), filas como cards
             (RoutineExerciseRow) y añadir vía el MISMO AddExerciseSheet del
             entreno (buscador+filtros+check de superserie). Los toggles de
             frontera y el buscador inline con debounce murieron. -->
        <!-- v0.11.7: quitar una fila la difumina mientras las demás cierran
             el hueco (bk-remove, mismas keys en ambas ramas — ver WorkoutView) -->
        <div v-if="exercises.length > 0" class="relative space-y-3 border-t border-line pt-3">
          <TransitionGroup name="bk-remove">
          <template v-for="block in editorBlocks">
            <div
              v-if="block.grouped"
              :key="`block-${block.entries[0].row.id}`"
              class="border border-aurora/50 rounded-sm p-2 space-y-3"
              :data-testid="`editor-superset-container-${block.label}`"
            >
              <div class="flex items-center justify-center gap-2">
                <span class="text-xs text-aurora border border-aurora/40 rounded-sm px-1.5 py-0.5">
                  {{ $t('routines.supersetLabel', { label: block.label }) }}
                </span>
                <BkActionBtn
                  icon="edit"
                  :data-testid="`editor-superset-edit-${block.label}`"
                  :aria-label="$t('workout.supersetEdit')"
                  @click="editingBlock = block"
                />
              </div>
              <RoutineExerciseRow
                v-for="entry in block.entries"
                :key="entry.row.id"
                :row="entry.row"
                :index="entry.index"
                :count="exercises.length"
                :all-exercises="allExercises"
                :muscle-groups="muscleGroups"
                :units="units"
                :locale="auth.user?.locale || 'es'"
                @move-up="moveExerciseUp"
                @move-down="moveExerciseDown"
                @remove="removeExercise"
              />
            </div>
            <RoutineExerciseRow
              v-else
              :key="`block-${block.entries[0].row.id}`"
              :row="block.entries[0].row"
              :index="block.entries[0].index"
              :count="exercises.length"
              :all-exercises="allExercises"
              :muscle-groups="muscleGroups"
              :units="units"
              :locale="auth.user?.locale || 'es'"
              @move-up="moveExerciseUp"
              @move-down="moveExerciseDown"
              @remove="removeExercise"
            />
          </template>
          </TransitionGroup>
        </div>

        <BkButton
          variant="ghost"
          block
          data-testid="routine-add-exercise-btn"
          @click="addSheetOpen = true"
        >
          {{ $t('routines.addExercise') }}
        </BkButton>

        <AddExerciseSheet :open="addSheetOpen" :actions="editorActions" @close="addSheetOpen = false" />

        <SupersetEditSheet
          :open="editingBlock !== null"
          :label="editingBlock?.label ?? null"
          :members="editingMembers"
          @close="editingBlock = null"
          @dissolve="dissolveEditingBlock"
          @swap="swapEditingMember"
        />
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

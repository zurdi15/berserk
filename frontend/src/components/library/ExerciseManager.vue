<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'

import type { ExerciseOut, Measurement, MuscleGroupOut } from '@/api/domain'
import { createExercise, deleteExercise, listExercises, listMuscleGroups, updateExercise } from '@/api/domain'
import { exerciseName } from '@/components/routines/exerciseName'
import { toastApiError } from '@/utils/apiErrors'
import { useAuthStore } from '@/stores/auth'
import { useToastStore } from '@/stores/toast'
import BkCard from '@/lib/BkCard.vue'
import BkActionBtn from '@/lib/BkActionBtn.vue'
import BkButton from '@/lib/BkButton.vue'
import BkField from '@/lib/BkField.vue'
import BkRune from '@/lib/BkRune.vue'
import BkSelect from '@/lib/BkSelect.vue'
import BkSheet from '@/lib/BkSheet.vue'
import BkEmpty from '@/lib/BkEmpty.vue'
import BkUser from '@/lib/BkUser.vue'
import { groupRune, primaryMuscleGroup } from '@/lib/runeResolve'
import type { RuneName } from '@/lib/runes'

const { t } = useI18n()
const auth = useAuthStore()
const toast = useToastStore()

const exercises = ref<ExerciseOut[]>([])
const muscleGroups = ref<MuscleGroupOut[]>([])

// UNIFIED-LISTINGS: zurdi no quiere "una sección de ejercicios y otra de
// catálogo" — UNA lista, con una label de quién la creó cuando no es mía.
// Orden: míos primero, luego el catálogo predefinido, luego los públicos de
// otros usuarios — cada bucket llega YA ordenado (listExercises hace
// .order_by(Exercise.name_en) en el backend), así que basta con filtrar en
// buckets sin reordenar de nuevo.
//
// Búsqueda: se DESCARTA adoptar BkSearchList aquí (59 filas de catálogo +
// públicas de otros es la lista más larga del carril). BkSearchList es un
// combobox de selección única (role="combobox"/listbox/option, un único
// item "activo", Enter confirma UNA fila) pensado para pickers — esta lista
// necesita 0-2 botones de acción POR FILA (editar/borrar), lo que exige
// botones interactivos dentro de un role="option" ya clicable: mismo
// anti-patrón de accesibilidad que RoutineList evita desde side-quest 1
// manteniendo las acciones como HERMANAS del botón de expansión, no anidadas
// dentro. Añadir búsqueda de verdad aquí pide un patrón nuevo ("lista
// filtrable con acciones por fila") que no existe todavía — fuera de
// alcance de una reorganización pura.
type ExerciseKind = 'own' | 'catalog' | 'other'
interface DisplayExercise extends ExerciseOut {
  kind: ExerciseKind
}

const displayExercises = computed<DisplayExercise[]>(() => [
  ...exercises.value
    .filter((e) => e.owner_id === auth.user?.id)
    .map((e): DisplayExercise => ({ ...e, kind: 'own' })),
  ...exercises.value
    .filter((e) => e.owner_id === null)
    .map((e): DisplayExercise => ({ ...e, kind: 'catalog' })),
  ...exercises.value
    .filter((e) => e.owner_id !== null && e.owner_id !== auth.user?.id)
    .map((e): DisplayExercise => ({ ...e, kind: 'other' })),
])

const measurementValues: Measurement[] = ['strength', 'bodyweight', 'timed', 'cardio']
const measurementOptions = computed(() =>
  measurementValues.map((value) => ({ value, label: t(`library.measurements.${value}`) })),
)

function groupLabel(group: MuscleGroupOut): string {
  return auth.user?.locale === 'en' ? group.name_en : group.name_es
}

// item 6: tag runa+nombre del grupo muscular primario, en cada fila de
// ejercicio (propio o del catálogo) — mismo resolver que AddExerciseSheet/
// ExercisePicker, un único punto de verdad para "qué grupo es el primario"
function primaryGroup(exercise: ExerciseOut): MuscleGroupOut | undefined {
  return primaryMuscleGroup(exercise, muscleGroups.value)
}

// item 14(c): runa EFECTIVA (rune ?? slug-derivada) vía el resolver
// centralizado — antes esta tag leía group.slug a pelo, así que un grupo con
// una runa dedicada distinta de su slug no se veía reflejado aquí
function primaryGroupRune(exercise: ExerciseOut): RuneName | null {
  return groupRune(primaryGroup(exercise))
}

const formOpen = ref(false)
const editingId = ref<number | null>(null)
// owner_id de la fila que se está editando (null en creación, o si es una
// fila del catálogo admin) — W2 feature 1: decide si el checkbox is_public
// tiene sentido (una fila del catálogo admin ya es global, no aplica)
const editingOwnerId = ref<number | null>(null)
const nameEs = ref('')
const nameEn = ref('')
const measurement = ref<Measurement>('strength')
const checkedGroupIds = ref<number[]>([])
const primaryGroupId = ref<number | null>(null)
// item 3: solo en creación (igual que measurement arriba) — is_global no es
// patchable en el backend, así que no tiene sentido mostrarlo al editar
const isGlobal = ref(false)
// W2 feature 1: check de "globales" de un ejercicio PROPIO — a diferencia
// de isGlobal, SÍ es patchable (round-trip en create Y edit)
const isPublic = ref(false)
const saving = ref(false)

const deleteConfirmOpen = ref(false)
const deleteId = ref<number | null>(null)
// gatea lista/vacío hasta que la carga resuelve (mismo patrón que TodayView):
// sin esto la lista entra vacía y los ejercicios propios aparecen de golpe
// ~100ms después. true también en error, para no dejar la sección en blanco.
const ready = ref(false)

async function loadAll() {
  try {
    const [exercisesData, groupsData] = await Promise.all([listExercises(), listMuscleGroups()])
    exercises.value = exercisesData
    muscleGroups.value = groupsData
  } catch (error) {
    toastApiError(error)
  } finally {
    ready.value = true
  }
}

onMounted(loadAll)

function openCreate() {
  editingId.value = null
  editingOwnerId.value = null
  nameEs.value = ''
  nameEn.value = ''
  measurement.value = 'strength'
  checkedGroupIds.value = []
  primaryGroupId.value = null
  isGlobal.value = false
  isPublic.value = false
  formOpen.value = true
}

function openEdit(exercise: ExerciseOut) {
  editingId.value = exercise.id
  editingOwnerId.value = exercise.owner_id
  nameEs.value = exercise.name_es
  nameEn.value = exercise.name_en
  measurement.value = exercise.measurement
  checkedGroupIds.value = exercise.muscle_groups.map((l) => l.muscle_group_id)
  primaryGroupId.value = exercise.muscle_groups.find((l) => l.is_primary)?.muscle_group_id ?? null
  isPublic.value = exercise.is_public ?? false
  formOpen.value = true
}

function setGroupChecked(id: number, checked: boolean) {
  if (checked) {
    if (!checkedGroupIds.value.includes(id)) {
      checkedGroupIds.value = [...checkedGroupIds.value, id]
    }
    // el primer grupo marcado se propone como primario; el usuario puede cambiarlo
    if (primaryGroupId.value === null) primaryGroupId.value = id
  } else {
    checkedGroupIds.value = checkedGroupIds.value.filter((g) => g !== id)
    if (primaryGroupId.value === id) primaryGroupId.value = null
  }
}

async function submitForm() {
  saving.value = true
  const muscle_groups = checkedGroupIds.value.map((id) => ({
    muscle_group_id: id,
    is_primary: id === primaryGroupId.value,
  }))

  try {
    if (editingId.value !== null) {
      await updateExercise(editingId.value, {
        name_es: nameEs.value,
        name_en: nameEn.value,
        muscle_groups,
        is_public: isPublic.value,
      })
    } else {
      await createExercise({
        name_es: nameEs.value,
        name_en: nameEn.value,
        measurement: measurement.value,
        muscle_groups,
        is_global: isGlobal.value,
        is_public: isPublic.value,
      })
    }
    formOpen.value = false
    await loadAll()
    toast.push('info', t('common.saved'))
  } catch (error) {
    toastApiError(error)
  } finally {
    saving.value = false
  }
}

function askDelete(id: number) {
  deleteId.value = id
  deleteConfirmOpen.value = true
}

async function confirmDelete() {
  if (deleteId.value === null) return

  deleteConfirmOpen.value = false
  try {
    await deleteExercise(deleteId.value)
    await loadAll()
    toast.push('info', t('common.saved'))
  } catch (error) {
    toastApiError(error)
  }
}
</script>

<template>
  <div class="space-y-4">
    <!-- UNIFIED-LISTINGS: una sola lista (míos + catálogo predefinido +
         públicos de otros), en vez de una sección propia y un catálogo
         colapsable aparte — mismo patrón que MuscleGroupManager, que ya
         vivía así. -->
    <BkCard :title="$t('library.exercises')">
      <div class="space-y-4">
        <div v-if="ready && displayExercises.length > 0" class="space-y-2">
          <div
            v-for="exercise in displayExercises"
            :key="exercise.id"
            :data-testid="exercise.kind === 'own' ? `exercise-row-${exercise.id}` : `catalog-exercise-row-${exercise.id}`"
            class="flex items-center justify-between gap-2 p-2 rounded border border-line text-sm"
          >
            <span class="flex items-center gap-2 min-w-0 flex-wrap">
              <span class="truncate">{{ exerciseName(exercise, auth.user?.locale || 'es') }}</span>
              <!-- item 6: tag runa (+ nombre en filas anchas) del grupo primario -->
              <span
                v-if="primaryGroup(exercise)"
                class="inline-flex items-center gap-1 text-ink-faint shrink-0"
                :data-testid="`exercise-group-tag-${exercise.id}`"
              >
                <BkRune
                  v-if="primaryGroupRune(exercise)"
                  :name="primaryGroupRune(exercise)!"
                  :size="14"
                />
                <span class="hidden sm:inline text-xs">{{ groupLabel(primaryGroup(exercise)!) }}</span>
              </span>
              <!-- UNIFIED-LISTINGS: label de creador SOLO cuando no es mío —
                   chip "Catálogo predefinido" para el catálogo admin, BkUser
                   (punto de color + nombre) para lo público de otro usuario.
                   Sin owner_color en ExerciseOut (fuera de este carril),
                   BkUser cae a su fallback aurora. -->
              <span
                v-if="exercise.kind !== 'own'"
                class="shrink-0"
                :data-testid="`exercise-attribution-${exercise.id}`"
              >
                <span
                  v-if="exercise.kind === 'catalog'"
                  class="inline-flex items-center rounded-full border border-line px-2 py-0.5 text-xs text-ink-muted"
                >
                  {{ $t('library.catalog') }}
                </span>
                <BkUser
                  v-else-if="exercise.owner_username"
                  :user="{ username: exercise.owner_username, color: null }"
                  size="sm"
                />
              </span>
            </span>
            <!-- item 1: icon-only, como en RoutineList/AdminCard. item 5: un
                 admin puede editar/borrar filas predefinidas (owner_id
                 null), mismo sheet/flow que los ejercicios propios. W2
                 feature 1: lo público de OTRO usuario NUNCA es editable por
                 mí (ni siquiera admin — _can_edit es owner-o-admin-de-
                 global, no admin-de-lo-ajeno), así que sin acciones ahí -->
            <div
              v-if="exercise.kind === 'own' || (exercise.kind === 'catalog' && auth.user?.is_admin)"
              class="flex items-center gap-2 shrink-0"
            >
              <BkActionBtn
                icon="edit"
                :data-testid="`edit-exercise-${exercise.id}`"
                :aria-label="$t('common.edit')"
                @click="openEdit(exercise)"
              />
              <BkActionBtn
                icon="delete"
                :data-testid="`delete-exercise-${exercise.id}`"
                :aria-label="$t('common.delete')"
                @click="askDelete(exercise.id)"
              />
            </div>
          </div>
        </div>

        <!-- item 10: en vacío el botón de crear se muda dentro del BkEmpty;
             fuera de ahí (aún no listo, o con filas) se queda donde estaba.
             UNIFIED-LISTINGS: una sola vez, cuando NADA de la lista
             unificada (mías + catálogo + públicas de otros) hay que mostrar -->
        <BkEmpty
          v-else-if="ready"
          :message="$t('library.noExercises')"
          :action-label="$t('library.newExercise')"
          action-testid="new-exercise-btn"
          @action="openCreate"
        />

        <BkButton v-if="!ready || displayExercises.length > 0" data-testid="new-exercise-btn" @click="openCreate">
          {{ $t('library.newExercise') }}
        </BkButton>
      </div>
    </BkCard>

    <BkSheet
      :open="formOpen"
      :title="editingId !== null ? $t('common.edit') : $t('library.newExercise')"
      @close="formOpen = false"
    >
      <div class="space-y-4 p-4">
        <BkField
          v-model="nameEs"
          :label="$t('library.nameEs')"
          data-testid="exercise-name-es-field"
        />
        <BkField
          v-model="nameEn"
          :label="$t('library.nameEn')"
          data-testid="exercise-name-en-field"
        />
        <BkSelect
          v-if="editingId === null"
          v-model="measurement"
          :label="$t('library.measurement')"
          :options="measurementOptions"
          data-testid="exercise-measurement-select"
        />
        <!-- item 3: global (owner_id null, visible a todos) — solo admin,
             y solo al crear (no es patchable, mismo criterio que measurement) -->
        <label
          v-if="editingId === null && auth.user?.is_admin"
          class="flex items-center gap-2 cursor-pointer"
        >
          <input
            v-model="isGlobal"
            type="checkbox"
            class="rounded border border-line"
            data-testid="exercise-is-global-checkbox"
          />
          <span class="text-sm text-ink-muted">{{ $t('library.isGlobal') }}</span>
        </label>

        <!-- W2 feature 1: "Visible para todos" — a diferencia de isGlobal,
             cualquier usuario lo ve (sigue siendo el dueño), y SÍ es
             patchable (crear Y editar); no tiene sentido sobre una fila del
             catálogo admin (owner_id null ya es global de por sí) -->
        <label
          v-if="editingOwnerId !== null || editingId === null"
          class="flex items-center gap-2 cursor-pointer"
        >
          <input
            v-model="isPublic"
            type="checkbox"
            class="rounded border border-line"
            data-testid="exercise-is-public-checkbox"
          />
          <span class="text-sm text-ink-muted">{{ $t('library.isPublic') }}</span>
        </label>

        <div class="space-y-2">
          <span class="block text-sm text-ink-muted">{{ $t('library.muscleGroups') }}</span>
          <div v-for="group in muscleGroups" :key="group.id" class="flex items-center gap-3">
            <label class="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                class="rounded border border-line"
                :data-testid="`muscle-group-checkbox-${group.id}`"
                :checked="checkedGroupIds.includes(group.id)"
                @change="setGroupChecked(group.id, ($event.target as HTMLInputElement).checked)"
              />
              <span class="text-sm text-ink-muted">{{ groupLabel(group) }}</span>
            </label>
            <label v-if="checkedGroupIds.includes(group.id)" class="flex items-center gap-2 cursor-pointer">
              <input
                type="radio"
                name="exercise-primary-muscle-group"
                class="border border-line"
                :data-testid="`muscle-group-primary-${group.id}`"
                :checked="primaryGroupId === group.id"
                @change="primaryGroupId = group.id"
              />
              <span class="text-sm text-ink-muted">{{ $t('library.primary') }}</span>
            </label>
          </div>
        </div>

        <div class="flex gap-2">
          <BkButton variant="ghost" @click="formOpen = false">
            {{ $t('common.cancel') }}
          </BkButton>
          <BkButton
            :loading="saving"
            data-testid="save-exercise-btn"
            @click="submitForm"
          >
            {{ $t('common.save') }}
          </BkButton>
        </div>
      </div>
    </BkSheet>

    <BkSheet
      :open="deleteConfirmOpen"
      :title="$t('library.confirmDeleteExercise')"
      @close="deleteConfirmOpen = false"
    >
      <div class="space-y-4 p-4" data-testid="delete-exercise-confirm-sheet">
        <p>{{ $t('library.confirmDeleteExerciseMessage') }}</p>
        <div class="flex gap-2">
          <BkButton
            variant="ghost"
            data-testid="delete-exercise-cancel-btn"
            @click="deleteConfirmOpen = false"
          >
            {{ $t('common.cancel') }}
          </BkButton>
          <BkButton
            variant="danger"
            data-testid="delete-exercise-confirm-btn"
            @click="confirmDelete"
          >
            {{ $t('common.delete') }}
          </BkButton>
        </div>
      </div>
    </BkSheet>
  </div>
</template>

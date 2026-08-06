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
import BkSelect from '@/lib/BkSelect.vue'
import BkSheet from '@/lib/BkSheet.vue'
import BkEmpty from '@/lib/BkEmpty.vue'

const { t } = useI18n()
const auth = useAuthStore()
const toast = useToastStore()

const exercises = ref<ExerciseOut[]>([])
const muscleGroups = ref<MuscleGroupOut[]>([])

const ownExercises = computed(() => exercises.value.filter((e) => e.owner_id !== null))
// item 4: catálogo predefinido (owner_id null) en su propia sección,
// colapsada por defecto — de solo lectura para un usuario normal; item 5
// añade edición/borrado ahí mismo para un admin
const catalogExercises = computed(() => exercises.value.filter((e) => e.owner_id === null))
const catalogOpen = ref(false)

const measurementValues: Measurement[] = ['strength', 'bodyweight', 'timed', 'cardio']
const measurementOptions = computed(() =>
  measurementValues.map((value) => ({ value, label: t(`library.measurements.${value}`) })),
)

function groupLabel(group: MuscleGroupOut): string {
  return auth.user?.locale === 'en' ? group.name_en : group.name_es
}

const formOpen = ref(false)
const editingId = ref<number | null>(null)
const nameEs = ref('')
const nameEn = ref('')
const measurement = ref<Measurement>('strength')
const checkedGroupIds = ref<number[]>([])
const primaryGroupId = ref<number | null>(null)
// item 3: solo en creación (igual que measurement arriba) — is_global no es
// patchable en el backend, así que no tiene sentido mostrarlo al editar
const isGlobal = ref(false)
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
  nameEs.value = ''
  nameEn.value = ''
  measurement.value = 'strength'
  checkedGroupIds.value = []
  primaryGroupId.value = null
  isGlobal.value = false
  formOpen.value = true
}

function openEdit(exercise: ExerciseOut) {
  editingId.value = exercise.id
  nameEs.value = exercise.name_es
  nameEn.value = exercise.name_en
  measurement.value = exercise.measurement
  checkedGroupIds.value = exercise.muscle_groups.map((l) => l.muscle_group_id)
  primaryGroupId.value = exercise.muscle_groups.find((l) => l.is_primary)?.muscle_group_id ?? null
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
      })
    } else {
      await createExercise({
        name_es: nameEs.value,
        name_en: nameEn.value,
        measurement: measurement.value,
        muscle_groups,
        is_global: isGlobal.value,
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
    <BkCard :title="$t('library.exercises')">
      <div class="space-y-4">
        <div v-if="ready && ownExercises.length > 0" class="space-y-2">
          <div
            v-for="exercise in ownExercises"
            :key="exercise.id"
            :data-testid="`exercise-row-${exercise.id}`"
            class="flex items-center justify-between gap-2 p-2 rounded border border-line text-sm"
          >
            <span>{{ exerciseName(exercise, auth.user?.locale || 'es') }}</span>
            <!-- item 1: icon-only, como en RoutineList/AdminCard -->
            <div class="flex items-center gap-2 shrink-0">
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

        <BkEmpty v-else-if="ready" :message="$t('library.noExercises')" />

        <BkButton data-testid="new-exercise-btn" @click="openCreate">
          {{ $t('library.newExercise') }}
        </BkButton>
      </div>
    </BkCard>

    <!-- item 4: catálogo predefinido, colapsado por defecto — mismo patrón
         de expandir/colapsar que las rutinas de RoutineList -->
    <BkCard>
      <div class="space-y-4">
        <button
          type="button"
          class="bk-press flex w-full items-center justify-between text-left"
          :aria-expanded="catalogOpen ? 'true' : 'false'"
          data-testid="toggle-catalog"
          @click="catalogOpen = !catalogOpen"
        >
          <h2 class="font-display font-semibold text-ink uppercase tracking-wider text-sm">
            {{ $t('library.catalog') }}
          </h2>
          <svg
            viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
            stroke-linecap="round" stroke-linejoin="round"
            class="w-4 h-4 shrink-0 text-ink-muted transition-transform"
            :class="{ 'rotate-180': catalogOpen }"
            aria-hidden="true"
          >
            <path d="M6 9l6 6 6-6" />
          </svg>
        </button>

        <div v-if="catalogOpen" :data-testid="'catalog-list'" class="space-y-2">
          <div v-if="ready && catalogExercises.length > 0" class="space-y-2">
            <div
              v-for="exercise in catalogExercises"
              :key="exercise.id"
              :data-testid="`catalog-exercise-row-${exercise.id}`"
              class="flex items-center justify-between gap-2 p-2 rounded border border-line text-sm"
            >
              <span>{{ exerciseName(exercise, auth.user?.locale || 'es') }}</span>
              <!-- item 5: un admin puede editar/borrar filas predefinidas —
                   reutiliza el mismo sheet/flow que los ejercicios propios,
                   el backend ya lo permite sobre owner_id null -->
              <div v-if="auth.user?.is_admin" class="flex items-center gap-2 shrink-0">
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

          <BkEmpty v-else-if="ready" :message="$t('library.noCatalog')" />
        </div>
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

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'

import type { ExerciseOut, Measurement, MuscleGroupOut } from '@/api/domain'
import { createExercise, deleteExercise, listExercises, listMuscleGroups, updateExercise } from '@/api/domain'
import { exerciseName } from '@/components/routines/exerciseName'
import { deleteExerciseImage, exerciseImageUrl, uploadExerciseImage } from '@/api/domain'
import { toastApiError } from '@/utils/apiErrors'
import { getViewCache, setViewCache } from '@/utils/viewCache'
import { foldSearchText } from '@/utils/searchFold'
import { useAuthStore } from '@/stores/auth'
import { useToastStore } from '@/stores/toast'
import BkCard from '@/lib/BkCard.vue'
import BkActionBtn from '@/lib/BkActionBtn.vue'
import BkButton from '@/lib/BkButton.vue'
import BkCheck from '@/lib/BkCheck.vue'
import BkMedia from '@/lib/BkMedia.vue'
import BkRadio from '@/lib/BkRadio.vue'
import BkField from '@/lib/BkField.vue'
import BkRune from '@/lib/BkRune.vue'
import BkSelect from '@/lib/BkSelect.vue'
import GroupFilterSelect from '@/lib/GroupFilterSelect.vue'
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

// v0.9.4 (zurdi): cada bucket se reordena por el nombre MOSTRADO — el
// backend ordena por name_en, así que un usuario en ES veía la lista en un
// orden aparentemente aleatorio ("Bicicleta estática" donde tocaría
// "Stationary bike"), y encontrar nada a ojo era una lotería
function sortByDisplayName(bucket: DisplayExercise[]): DisplayExercise[] {
  const locale = auth.user?.locale || 'es'
  return bucket.sort((a, b) => exerciseName(a, locale).localeCompare(exerciseName(b, locale), locale))
}

const displayExercises = computed<DisplayExercise[]>(() => [
  ...sortByDisplayName(
    exercises.value
      .filter((e) => e.owner_id === auth.user?.id)
      .map((e): DisplayExercise => ({ ...e, kind: 'own' })),
  ),
  ...sortByDisplayName(
    exercises.value
      .filter((e) => e.owner_id === null)
      .map((e): DisplayExercise => ({ ...e, kind: 'catalog' })),
  ),
  ...sortByDisplayName(
    exercises.value
      .filter((e) => e.owner_id !== null && e.owner_id !== auth.user?.id)
      .map((e): DisplayExercise => ({ ...e, kind: 'other' })),
  ),
])

// v0.9.4 (zurdi): "añadir filtro por grupo en biblioteca y también barra de
// búsqueda" — filtrado en CLIENTE sobre la lista unificada ya cargada (59
// filas de catálogo + propias + públicas: el mismo tamaño que AddExerciseSheet
// ya filtra en cliente sin despeinarse). La búsqueda matchea el nombre en
// AMBOS idiomas Y la etiqueta del tipo de medición — así "cardio" encuentra
// Cinta de correr aunque ningún ejercicio se llame literalmente así (el
// origen del "los ejercicios de cardio no salen" de zurdi). El filtro de
// grupo matchea CUALQUIER grupo enlazado, igual que el query param
// muscle_group_id del backend.
const query = ref('')
const filterGroupId = ref('')

const filteredExercises = computed<DisplayExercise[]>(() => {
  // v0.11.1: pliegue de acentos en ambos lados — "eliptica" encuentra "Elíptica"
  const q = foldSearchText(query.value.trim())
  const groupId = filterGroupId.value ? Number(filterGroupId.value) : null
  return displayExercises.value.filter((e) => {
    if (groupId !== null && !e.muscle_groups.some((l) => l.muscle_group_id === groupId)) return false
    if (!q) return true
    const haystack = foldSearchText(`${e.name_es} ${e.name_en} ${t(`library.measurements.${e.measurement}`)}`)
    return haystack.includes(q)
  })
})

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
// (v0.18.0: el selector de "Carga" de la v0.17.x murió — el modo kg/nivel
// se elige al registrar cada serie, en el cajón del entreno)
const checkedGroupIds = ref<number[]>([])
const primaryGroupId = ref<number | null>(null)
// v0.9.4 (zurdi: "visible para todos y global es un poco redundante"): los
// dos checks (is_global admin-only + is_public) colapsan en UN select de
// visibilidad — privado / visible para todos / catálogo global. El catálogo
// global solo aparece creando Y siendo admin (is_global no es patchable,
// mismo criterio que measurement); editando una fila del catálogo admin no
// se muestra nada (ya es global de por sí, igual que antes)
// (v0.20.x: el selector de visibilidad MURIÓ — todos los ejercicios son de
// catálogo global; la propiedad solo decide quién edita)
const saving = ref(false)

const deleteConfirmOpen = ref(false)
const deleteId = ref<number | null>(null)
// gatea lista/vacío hasta que la carga resuelve (mismo patrón que TodayView):
// sin esto la lista entra vacía y los ejercicios propios aparecen de golpe
// ~100ms después. true también en error, para no dejar la sección en blanco.
const ready = ref(false)

async function loadAll() {
  // facelift v3: hidratar la última carga al instante y refrescar en fondo
  type Snapshot = { exercises: ExerciseOut[]; groups: MuscleGroupOut[] }
  const cached = getViewCache<Snapshot>('library:all')
  if (cached) {
    exercises.value = cached.exercises
    muscleGroups.value = cached.groups
    ready.value = true
  }
  try {
    const [exercisesData, groupsData] = await Promise.all([listExercises(), listMuscleGroups()])
    exercises.value = exercisesData
    muscleGroups.value = groupsData
    setViewCache<Snapshot>('library:all', { exercises: exercisesData, groups: groupsData })
  } catch (error) {
    if (!cached) toastApiError(error)
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
  formOpen.value = true
}

function openEdit(exercise: ExerciseOut) {
  editingId.value = exercise.id
  editingOwnerId.value = exercise.owner_id
  editingHasImage.value = exercise.has_image ?? false
  nameEs.value = exercise.name_es
  nameEn.value = exercise.name_en
  measurement.value = exercise.measurement
  checkedGroupIds.value = exercise.muscle_groups.map((l) => l.muscle_group_id)
  primaryGroupId.value = exercise.muscle_groups.find((l) => l.is_primary)?.muscle_group_id ?? null
  formOpen.value = true
}

// v0.12.0 (zurdi: "añadir fotos a un ejercicio para mejor visual"): la
// imagen se sube/borra sobre un ejercicio YA existente (en creación el
// bloque no aparece — primero se crea, luego se edita para ilustrarlo)
const editingHasImage = ref(false)
const imageBust = ref(0)
const imageUploading = ref(false)
const imageFileEl = ref<HTMLInputElement | null>(null)

async function onImageChosen(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file || editingId.value === null) return
  try {
    imageUploading.value = true
    await uploadExerciseImage(editingId.value, file)
    editingHasImage.value = true
    // rompe la cache del <img> del preview y de las filas tras reemplazar
    imageBust.value = Date.now()
    await loadAll()
  } catch (error) {
    toastApiError(error)
  } finally {
    imageUploading.value = false
    input.value = ''
  }
}

async function removeImage() {
  if (editingId.value === null) return
  try {
    await deleteExerciseImage(editingId.value)
    editingHasImage.value = false
    await loadAll()
  } catch (error) {
    toastApiError(error)
  }
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
    <!-- facelift v4 (zurdi: "el botón añadir está abajo del todo y hay que
         hacer mucho scroll"): el alta vive ARRIBA, en la fila del título -->
    <BkCard :title="$t('library.exercises')">
      <template #header>
        <BkButton size="sm" data-testid="new-exercise-btn" @click="openCreate">
          {{ $t('library.newExercise') }}
        </BkButton>
      </template>
      <div class="space-y-4">
        <!-- item 2/3 (v0.4.3, zurdi): esqueleto shimmer mientras carga, mismo
             hueco que las filas reales (nombre+chip a la izquierda, dos
             acciones icon-only a la derecha) — reemplaza el gate a blanco
             (v-if="ready") que hacía saltar el layout al llegar los datos. -->
        <div v-if="!ready" class="space-y-2" data-testid="exercise-list-skeleton">
          <div
            v-for="n in 5"
            :key="n"
            class="flex items-center justify-between gap-2 p-2 rounded border border-line"
            aria-hidden="true"
          >
            <div class="flex-1 min-w-0 space-y-1.5">
              <div class="h-4 w-1/2 rounded-sm bk-shimmer" />
              <div class="h-3 w-1/4 rounded-sm bk-shimmer" />
            </div>
            <div class="flex items-center gap-2 shrink-0">
              <div class="w-8 h-8 rounded-sm bk-shimmer" />
              <div class="w-8 h-8 rounded-sm bk-shimmer" />
            </div>
          </div>
        </div>

        <template v-else-if="displayExercises.length > 0">
          <!-- v0.9.4 (zurdi): barra de búsqueda + filtro por grupo, encima
               de la lista — cliente puro sobre lo ya cargado, ver el
               computed filteredExercises -->
          <!-- v0.11.8 (zurdi): grupo SIEMPRE arriba, búsqueda debajo — mismo
               orden que AddExerciseSheet y el picker de progresión -->
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <!-- v0.11.0: filtro de grupo compartido (GroupFilterSelect) -->
            <div data-testid="exercise-group-filter">
              <GroupFilterSelect v-model="filterGroupId" :muscle-groups="muscleGroups" />
            </div>
            <BkField
              v-model="query"
              :label="$t('library.searchExercises')"
              data-testid="exercise-search-field"
            />
          </div>

          <!-- v0.11.7: borrar un ejercicio difumina su fila (bk-remove) -->
          <div v-if="filteredExercises.length > 0" class="relative space-y-2">
          <TransitionGroup name="bk-remove">
          <div
            v-for="exercise in filteredExercises"
            :key="exercise.id"
            :data-testid="exercise.kind === 'own' ? `exercise-row-${exercise.id}` : `catalog-exercise-row-${exercise.id}`"
            class="flex items-start justify-between gap-2 p-2 rounded border border-line text-sm"
          >
            <!-- v0.12.0 → facelift v4 (zurdi: "que la imagen se vea más y
                 con aspect ratio vertical"): thumb 9:16 con pozo rúnico de
                 fallback, en TODAS las filas -->
            <BkMedia
              :exercise="exercise"
              :cache-bust="imageBust"
              :rune="primaryGroupRune(exercise)"
              size="tallSm"
              :data-testid="`exercise-thumb-${exercise.id}`"
            />
            <div class="min-w-0 flex-1">
              <p class="truncate">{{ exerciseName(exercise, auth.user?.locale || 'es') }}</p>
              <!-- item 2+6 (v0.4.2, records-tab layout): fila de chips
                   DEDICADA debajo del nombre, más pequeña (text-2xs) que el
                   cuerpo de la fila — mismo criterio que la fila de
                   atribución de RoutineList, un nivel más compacto porque
                   aquí comparte sitio con el chip de grupo. El grupo primario
                   (item 6) sale en TODA fila (propia o no); la atribución
                   (item 2) solo en las que no son mías — comparten esta
                   misma fila cuando ambas existen en vez de apilar dos filas
                   sueltas, así que una fila propia SIN grupo primario no
                   renderiza esta fila en absoluto (item 2: "own items get no
                   chip row at all"). -->
              <div
                v-if="primaryGroup(exercise) || exercise.kind !== 'own' || exercise.measurement !== 'strength'"
                class="flex items-center gap-1.5 flex-wrap mt-1"
              >
                <span
                  v-if="primaryGroup(exercise)"
                  class="inline-flex items-center gap-1 rounded-full border border-line px-1.5 py-0.5 text-2xs text-ink-faint"
                  :data-testid="`exercise-group-tag-${exercise.id}`"
                >
                  <BkRune
                    v-if="primaryGroupRune(exercise)"
                    :name="primaryGroupRune(exercise)!"
                    :size="12"
                  />
                  <span>{{ groupLabel(primaryGroup(exercise)!) }}</span>
                </span>
                <!-- v0.9.4 (zurdi: "los de cardio no salen"): chip del TIPO
                     para todo lo que no es fuerza (cardio/tiempo/peso
                     corporal) — el chip de grupo dice "Piernas" en una cinta
                     de correr, así que sin esto nada de la fila delataba que
                     era cardio. Fuerza (la mayoría de la lista) no lo lleva:
                     sería ruido repetido en 40 filas. -->
                <span
                  v-if="exercise.measurement !== 'strength'"
                  class="inline-flex items-center rounded-full border border-aurora/40 px-1.5 py-0.5 text-2xs text-aurora"
                  :data-testid="`exercise-measurement-tag-${exercise.id}`"
                >
                  {{ $t(`library.measurements.${exercise.measurement}`) }}
                </span>
                <!-- UNIFIED-LISTINGS: label de creador SOLO cuando no es mío —
                     chip "Catálogo predefinido" para el catálogo admin, BkUser
                     (punto de color + nombre) para lo público de otro usuario.
                     Sin owner_color en ExerciseOut (fuera de este carril),
                     BkUser cae a su fallback aurora. -->
                <span
                  v-if="exercise.kind !== 'own'"
                  :data-testid="`exercise-attribution-${exercise.id}`"
                >
                  <span
                    v-if="exercise.kind === 'catalog'"
                    class="inline-flex items-center rounded-full border border-line px-1.5 py-0.5 text-2xs text-ink-muted"
                  >
                    {{ $t('library.catalog') }}
                  </span>
                  <BkUser
                    v-else-if="exercise.owner_username"
                    :user="{ username: exercise.owner_username, color: null }"
                    size="sm"
                  />
                </span>
              </div>
            </div>
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
          </TransitionGroup>
          </div>

          <!-- filtro/búsqueda sin resultados: mensaje plano, NUNCA el BkEmpty
               de abajo (ese es "no hay nada en absoluto" y arrastra el CTA de
               crear a otro sitio) -->
          <p v-else class="text-sm text-ink-faint" data-testid="exercise-filter-empty">
            {{ $t('common.noResults') }}
          </p>
        </template>

        <!-- item 10: en vacío el botón de crear se muda dentro del BkEmpty;
             fuera de ahí (aún no listo, o con filas) se queda donde estaba.
             UNIFIED-LISTINGS: una sola vez, cuando NADA de la lista
             unificada (mías + catálogo + públicas de otros) hay que mostrar -->
        <!-- sin action propia: el alta ya vive arriba, en la fila del
             título — duplicar el testid rompería los selectores -->
        <BkEmpty v-else :message="$t('library.noExercises')" />
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

        <div class="space-y-2">
          <span class="block text-sm text-ink-muted">{{ $t('library.muscleGroups') }}</span>
          <div v-for="group in muscleGroups" :key="group.id" class="flex items-center gap-3">
            <div class="flex items-center gap-2">
              <BkCheck
                size="sm"
                :model-value="checkedGroupIds.includes(group.id)"
                :data-testid="`muscle-group-checkbox-${group.id}`"
                :aria-label="groupLabel(group)"
                @update:model-value="setGroupChecked(group.id, $event)"
              />
              <button
                type="button"
                class="bk-press text-sm text-ink-muted text-left"
                @click="setGroupChecked(group.id, !checkedGroupIds.includes(group.id))"
              >{{ groupLabel(group) }}</button>
            </div>
            <div v-if="checkedGroupIds.includes(group.id)" class="flex items-center gap-2">
              <BkRadio
                :checked="primaryGroupId === group.id"
                :data-testid="`muscle-group-primary-${group.id}`"
                :aria-label="$t('library.primary')"
                @select="primaryGroupId = group.id"
              />
              <button
                type="button"
                class="bk-press text-sm text-ink-muted"
                @click="primaryGroupId = group.id"
              >{{ $t('library.primary') }}</button>
            </div>
          </div>
        </div>

        <!-- v0.12.0: imagen del ejercicio (solo editando — ver comment
             del script) -->
        <div v-if="editingId !== null" class="space-y-2">
          <span class="block text-sm text-ink-muted">{{ $t('library.image') }}</span>
          <img
            v-if="editingHasImage"
            :src="exerciseImageUrl(editingId, imageBust)"
            :alt="nameEs"
            class="w-full max-h-40 object-cover rounded-sm border border-line"
            data-testid="exercise-image-preview"
          />
          <div class="flex gap-2">
            <BkButton
              variant="ghost"
              size="sm"
              :loading="imageUploading"
              data-testid="exercise-image-upload"
              @click="imageFileEl?.click()"
            >
              {{ editingHasImage ? $t('library.imageReplace') : $t('library.imageAdd') }}
            </BkButton>
            <BkButton
              v-if="editingHasImage"
              variant="danger"
              size="sm"
              data-testid="exercise-image-delete"
              @click="removeImage"
            >
              {{ $t('common.delete') }}
            </BkButton>
          </div>
          <input
            ref="imageFileEl"
            type="file"
            accept="image/jpeg,image/png,image/webp"
            class="hidden"
            data-testid="exercise-image-input"
            @change="onImageChosen"
          />
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

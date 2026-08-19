<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'

import type { MuscleGroupOut } from '@/api/domain'
import { createMuscleGroup, deleteMuscleGroup, listMuscleGroups, updateMuscleGroup } from '@/api/domain'
import { toastApiError } from '@/utils/apiErrors'
import { groupRune } from '@/lib/runeResolve'
import { useAuthStore } from '@/stores/auth'
import { useToastStore } from '@/stores/toast'
import BkCheck from '@/lib/BkCheck.vue'
import BkCard from '@/lib/BkCard.vue'
import BkActionBtn from '@/lib/BkActionBtn.vue'
import BkButton from '@/lib/BkButton.vue'
import BkField from '@/lib/BkField.vue'
import BkRune from '@/lib/BkRune.vue'
import BkSheet from '@/lib/BkSheet.vue'
import BkEmpty from '@/lib/BkEmpty.vue'
import type { RuneName } from '@/lib/runes'
import GroupRunePicker from './GroupRunePicker.vue'

// v0.9.2 (zurdi: "card dentro de drawer con el título repetido en ambos no
// está bien"): frameless — el host (el sheet de biblioteca, ver ProfileView)
// ya aporta superficie y título, así que el manager pinta su contenido a
// pelo, sin BkCard ni título propio. El modo con card sigue siendo el
// default por si el manager vuelve a vivir en una página algún día.
withDefaults(defineProps<{ frameless?: boolean }>(), { frameless: false })

const { t } = useI18n()
const auth = useAuthStore()
const toast = useToastStore()

const groups = ref<MuscleGroupOut[]>([])

// UNIFIED-LISTINGS: esta lista YA era una sola (mías + globales, sin
// sección aparte) — lo único que faltaba para "sorted sensibly" (mismo
// criterio que RoutineList/ExerciseManager) es el orden mías-primero. El
// backend devuelve .order_by(MuscleGroup.id), mezclando ambas categorías;
// aquí se reordena en buckets (mías, luego globales), alfabético dentro de
// cada uno por la etiqueta ya localizada.
const sortedGroups = computed(() => {
  const byLabel = (a: MuscleGroupOut, b: MuscleGroupOut) => groupLabel(a).localeCompare(groupLabel(b))
  const own = groups.value.filter((g) => g.owner_id === auth.user?.id).sort(byLabel)
  const global = groups.value.filter((g) => g.owner_id === null).sort(byLabel)
  return [...own, ...global]
})

function groupLabel(group: MuscleGroupOut): string {
  return auth.user?.locale === 'en' ? group.name_en : group.name_es
}

// item 14(c): icono de fila vía el resolver centralizado (rune ?? slug),
// no group.slug a pelo
function rowRune(group: MuscleGroupOut): RuneName | null {
  return groupRune(group)
}

// item 14: dueño de un grupo PROPIO puede editar/borrar el suyo, un admin
// además puede sobre filas globales (owner_id NULL) — mismo criterio que
// _can_edit en el backend. ANTES el botón de editar solo aparecía para
// filas globales con admin (bug de zurdi: el dueño de su propio grupo
// custom nunca veía "editar"); delete ya era correcto en la práctica
// (list_muscle_groups solo devuelve grupos propios o globales, así que
// owner_id !== null implicaba "mío"), pero se unifica con el mismo helper.
function canManage(group: MuscleGroupOut): boolean {
  return group.owner_id === auth.user?.id || (group.owner_id === null && !!auth.user?.is_admin)
}

// item 2: formulario de creación en drawer (antes inline), mismo patrón que
// el alta de usuarios de AdminCard
const createGroupOpen = ref(false)
const slug = ref('')
const nameEs = ref('')
const nameEn = ref('')
const isGlobal = ref(false)
// item 14: runa dedicada, libre desde la creación — ya no atada al slug
const rune = ref<RuneName | null>(null)
const creating = ref(false)

// item 14: edición de grupos — la runa vive en su propia columna, así que el
// picker (GroupRunePicker, MISMO componente que en creación) edita `rune`,
// no `slug`. El slug pasa a ser identidad estable tras la creación: de solo
// lectura aquí (antes doblaba como "runa" y era lo único que este sheet
// tocaba además del nombre — comportamiento retirado a propósito, más
// seguro: renombrar el slug podía romper cualquier integración externa que
// lo usara como id estable)
const editGroupOpen = ref(false)
const editGroupId = ref<number | null>(null)
const editSlugDisplay = ref('')
const editNameEs = ref('')
const editNameEn = ref('')
const editRune = ref<RuneName | null>(null)
const editSaving = ref(false)

const deleteConfirmOpen = ref(false)
const deleteId = ref<number | null>(null)
// gatea lista/vacío hasta que la carga resuelve (mismo patrón que TodayView):
// sin esto la lista entra vacía y los grupos aparecen de golpe ~100ms
// después. true también en error, para no dejar la sección en blanco.
const ready = ref(false)

async function loadGroups() {
  try {
    groups.value = await listMuscleGroups()
  } catch (error) {
    toastApiError(error)
  } finally {
    ready.value = true
  }
}

onMounted(loadGroups)

function openCreateGroup() {
  slug.value = ''
  nameEs.value = ''
  nameEn.value = ''
  isGlobal.value = false
  rune.value = null
  createGroupOpen.value = true
}

async function submitGroup() {
  creating.value = true
  try {
    await createMuscleGroup({
      slug: slug.value,
      name_es: nameEs.value,
      name_en: nameEn.value,
      is_global: isGlobal.value,
      rune: rune.value,
    })
    createGroupOpen.value = false
    await loadGroups()
    toast.push('info', t('common.saved'))
  } catch (error) {
    toastApiError(error)
  } finally {
    creating.value = false
  }
}

function openEditGroup(group: MuscleGroupOut) {
  editGroupId.value = group.id
  editNameEs.value = group.name_es
  editNameEn.value = group.name_en
  editSlugDisplay.value = group.slug
  // precarga la runa EFECTIVA (rune ?? slug-derivada): si el usuario guarda
  // sin tocar el picker, lo que ya se veía en todos lados (item 14c) queda
  // materializado explícitamente en la columna dedicada
  editRune.value = groupRune(group)
  editGroupOpen.value = true
}

async function submitEditGroup() {
  if (editGroupId.value === null) return

  editSaving.value = true
  try {
    await updateMuscleGroup(editGroupId.value, {
      name_es: editNameEs.value,
      name_en: editNameEn.value,
      rune: editRune.value,
    })
    editGroupOpen.value = false
    await loadGroups()
    toast.push('info', t('common.saved'))
  } catch (error) {
    toastApiError(error)
  } finally {
    editSaving.value = false
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
    await deleteMuscleGroup(deleteId.value)
    await loadGroups()
    toast.push('info', t('common.saved'))
  } catch (error) {
    toastApiError(error)
  }
}
</script>

<template>
  <div class="space-y-4">
    <component
      :is="frameless ? 'div' : BkCard"
      v-bind="frameless ? {} : { title: $t('library.muscleGroups') }"
    >
      <div class="space-y-4">
        <!-- item 2/3 (v0.4.3, zurdi): esqueleto shimmer mientras carga, mismo
             hueco que las filas reales — reemplaza el gate a blanco
             (v-if="ready") que hacía saltar el layout al llegar los datos. -->
        <div v-if="!ready" class="space-y-2" data-testid="muscle-group-list-skeleton">
          <div
            v-for="n in 5"
            :key="n"
            class="flex items-center justify-between p-2 rounded border border-line"
            aria-hidden="true"
          >
            <div class="h-4 w-1/3 rounded-sm bk-shimmer" />
            <div class="flex items-center gap-2 shrink-0">
              <div class="w-8 h-8 rounded-sm bk-shimmer" />
              <div class="w-8 h-8 rounded-sm bk-shimmer" />
            </div>
          </div>
        </div>

        <!-- v0.11.7: borrar un grupo difumina su fila (bk-remove) -->
        <div v-else-if="sortedGroups.length > 0" class="relative space-y-2">
          <TransitionGroup name="bk-remove">
          <div
            v-for="group in sortedGroups"
            :key="group.id"
            :data-testid="`muscle-group-row-${group.id}`"
            class="flex items-start justify-between p-2 rounded border border-line text-sm"
          >
            <div class="min-w-0">
              <span class="flex items-center gap-2">
                <BkRune v-if="rowRune(group)" :name="rowRune(group)!" :size="16" />
                <span class="truncate">{{ groupLabel(group) }}</span>
              </span>
              <!-- item 2 (v0.4.2, records-tab layout): "Global" pasa de ir
                   pegado al nombre a su propia fila de chip debajo, más
                   pequeña (text-2xs) — mismo criterio y misma clase de chip
                   que la atribución de ExerciseManager/RoutineList, para que
                   las tres listas de biblioteca/rutinas compartan el mismo
                   idioma visual de "atribución". Una fila propia (owner_id
                   del usuario) no renderiza esta fila en absoluto. -->
              <div v-if="group.owner_id === null" class="mt-1">
                <span
                  data-testid="global-group-badge"
                  class="inline-flex items-center rounded-full border border-line px-1.5 py-0.5 text-2xs text-ink-faint uppercase"
                >
                  {{ $t('library.globalGroup') }}
                </span>
              </div>
            </div>
            <!-- item 1: icon-only, como en RoutineList/AdminCard. item 14:
                 canManage unifica dueño-de-lo-propio y admin-de-lo-global
                 (antes editar solo aparecía en la segunda rama, bug) -->
            <div class="flex items-center gap-2 shrink-0">
              <BkActionBtn
                v-if="canManage(group)"
                icon="edit"
                data-testid="edit-muscle-group-btn"
                :aria-label="$t('common.edit')"
                @click="openEditGroup(group)"
              />
              <BkActionBtn
                v-if="canManage(group)"
                icon="delete"
                data-testid="delete-muscle-group-btn"
                :aria-label="$t('common.delete')"
                @click="askDelete(group.id)"
              />
            </div>
          </div>
          </TransitionGroup>
        </div>

        <!-- item 10: en vacío el botón de crear se muda dentro del BkEmpty -->
        <BkEmpty
          v-else
          :message="$t('library.noGroups')"
          :action-label="$t('library.newGroup')"
          action-testid="open-create-group-btn"
          @action="openCreateGroup"
        />

        <div v-if="!ready || sortedGroups.length > 0">
          <BkButton data-testid="open-create-group-btn" @click="openCreateGroup">
            {{ $t('library.newGroup') }}
          </BkButton>
        </div>
      </div>
    </component>

    <BkSheet
      :open="createGroupOpen"
      :title="$t('library.newGroup')"
      @close="createGroupOpen = false"
    >
      <div class="space-y-4 p-4">
        <BkField v-model="slug" :label="$t('library.slug')" data-testid="group-slug-field" />
        <BkField v-model="nameEs" :label="$t('library.nameEs')" data-testid="group-name-es-field" />
        <BkField v-model="nameEn" :label="$t('library.nameEn')" data-testid="group-name-en-field" />

        <!-- item 14: mismo picker que el sheet de editar, aquí YA desde la
             creación (antes el alta no tenía forma de elegir runa) -->
        <div class="space-y-2">
          <span class="block text-sm text-ink-muted">{{ $t('library.rune') }}</span>
          <GroupRunePicker v-model="rune" />
        </div>

        <div v-if="auth.user?.is_admin" class="flex items-center gap-2">
          <BkCheck
            size="sm"
            :model-value="isGlobal"
            data-testid="group-is-global-checkbox"
            :aria-label="$t('library.isGlobal')"
            @update:model-value="isGlobal = $event"
          />
          <button type="button" class="bk-press text-sm text-ink-muted" @click="isGlobal = !isGlobal">
            {{ $t('library.isGlobal') }}
          </button>
        </div>
        <div class="flex gap-2">
          <BkButton variant="ghost" @click="createGroupOpen = false">
            {{ $t('common.cancel') }}
          </BkButton>
          <BkButton
            :loading="creating"
            data-testid="create-group-btn"
            @click="submitGroup"
          >
            {{ $t('common.save') }}
          </BkButton>
        </div>
      </div>
    </BkSheet>

    <!-- item 14: edición — slug de solo lectura (identidad estable), runa
         en su propia columna vía el MISMO picker que la creación -->
    <BkSheet
      :open="editGroupOpen"
      :title="$t('common.edit')"
      @close="editGroupOpen = false"
    >
      <div class="space-y-4 p-4">
        <div class="space-y-1">
          <span class="block text-sm text-ink-muted">{{ $t('library.slug') }}</span>
          <p class="text-sm text-ink" data-testid="edit-group-slug-readonly">{{ editSlugDisplay }}</p>
        </div>

        <BkField v-model="editNameEs" :label="$t('library.nameEs')" data-testid="edit-group-name-es-field" />
        <BkField v-model="editNameEn" :label="$t('library.nameEn')" data-testid="edit-group-name-en-field" />

        <div class="space-y-2">
          <span class="block text-sm text-ink-muted">{{ $t('library.rune') }}</span>
          <GroupRunePicker v-model="editRune" />
        </div>

        <div class="flex gap-2">
          <BkButton variant="ghost" @click="editGroupOpen = false">
            {{ $t('common.cancel') }}
          </BkButton>
          <BkButton
            :loading="editSaving"
            data-testid="save-group-btn"
            @click="submitEditGroup"
          >
            {{ $t('common.save') }}
          </BkButton>
        </div>
      </div>
    </BkSheet>

    <BkSheet
      :open="deleteConfirmOpen"
      :title="$t('library.confirmDeleteGroup')"
      @close="deleteConfirmOpen = false"
    >
      <div class="space-y-4 p-4" data-testid="delete-group-confirm-sheet">
        <p>{{ $t('library.confirmDeleteGroupMessage') }}</p>
        <div class="flex gap-2">
          <BkButton
            variant="ghost"
            data-testid="delete-group-cancel-btn"
            @click="deleteConfirmOpen = false"
          >
            {{ $t('common.cancel') }}
          </BkButton>
          <BkButton
            variant="danger"
            data-testid="delete-group-confirm-btn"
            @click="confirmDelete"
          >
            {{ $t('common.delete') }}
          </BkButton>
        </div>
      </div>
    </BkSheet>
  </div>
</template>

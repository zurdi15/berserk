<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'

import type { MuscleGroupOut } from '@/api/domain'
import { createMuscleGroup, deleteMuscleGroup, listMuscleGroups } from '@/api/domain'
import { toastApiError } from '@/utils/apiErrors'
import { useAuthStore } from '@/stores/auth'
import { useToastStore } from '@/stores/toast'
import BkCard from '@/lib/BkCard.vue'
import BkActionBtn from '@/lib/BkActionBtn.vue'
import BkButton from '@/lib/BkButton.vue'
import BkField from '@/lib/BkField.vue'
import BkSheet from '@/lib/BkSheet.vue'
import BkEmpty from '@/lib/BkEmpty.vue'

const { t } = useI18n()
const auth = useAuthStore()
const toast = useToastStore()

const groups = ref<MuscleGroupOut[]>([])

function groupLabel(group: MuscleGroupOut): string {
  return auth.user?.locale === 'en' ? group.name_en : group.name_es
}

// item 2: formulario de creación en drawer (antes inline), mismo patrón que
// el alta de usuarios de AdminCard
const createGroupOpen = ref(false)
const slug = ref('')
const nameEs = ref('')
const nameEn = ref('')
const isGlobal = ref(false)
const creating = ref(false)

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
    <BkCard :title="$t('library.muscleGroups')">
      <div class="space-y-4">
        <div v-if="ready && groups.length > 0" class="space-y-2">
          <div
            v-for="group in groups"
            :key="group.id"
            :data-testid="`muscle-group-row-${group.id}`"
            class="flex items-center justify-between p-2 rounded border border-line text-sm"
          >
            <span class="flex items-center gap-2">
              {{ groupLabel(group) }}
              <span v-if="group.owner_id === null" data-testid="global-group-badge" class="text-xs text-ink-faint uppercase">
                {{ $t('library.globalGroup') }}
              </span>
            </span>
            <!-- item 1: icon-only, como en RoutineList/AdminCard -->
            <BkActionBtn
              v-if="group.owner_id !== null"
              icon="delete"
              data-testid="delete-muscle-group-btn"
              :aria-label="$t('common.delete')"
              @click="askDelete(group.id)"
            />
          </div>
        </div>

        <BkEmpty v-else-if="ready" :message="$t('library.noGroups')" />

        <!-- item 2: crear ya no es inline — un botón abre el drawer, mismo
             patrón que el alta de usuarios de AdminCard -->
        <div>
          <BkButton data-testid="open-create-group-btn" @click="openCreateGroup">
            {{ $t('library.newGroup') }}
          </BkButton>
        </div>
      </div>
    </BkCard>

    <BkSheet
      :open="createGroupOpen"
      :title="$t('library.newGroup')"
      @close="createGroupOpen = false"
    >
      <div class="space-y-4 p-4">
        <BkField v-model="slug" :label="$t('library.slug')" data-testid="group-slug-field" />
        <BkField v-model="nameEs" :label="$t('library.nameEs')" data-testid="group-name-es-field" />
        <BkField v-model="nameEn" :label="$t('library.nameEn')" data-testid="group-name-en-field" />
        <label v-if="auth.user?.is_admin" class="flex items-center gap-2 cursor-pointer">
          <input
            v-model="isGlobal"
            type="checkbox"
            class="rounded border border-line"
            data-testid="group-is-global-checkbox"
          />
          <span class="text-sm text-ink-muted">{{ $t('library.isGlobal') }}</span>
        </label>
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

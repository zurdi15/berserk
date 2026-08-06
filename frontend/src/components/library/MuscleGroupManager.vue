<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'

import type { MuscleGroupOut } from '@/api/domain'
import { createMuscleGroup, deleteMuscleGroup, listMuscleGroups } from '@/api/domain'
import { toastApiError } from '@/utils/apiErrors'
import { useAuthStore } from '@/stores/auth'
import { useToastStore } from '@/stores/toast'
import BkCard from '@/lib/BkCard.vue'
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

// Estado del formulario de creación (no hay edición: la API no la ofrece)
const slug = ref('')
const nameEs = ref('')
const nameEn = ref('')
const isGlobal = ref(false)
const creating = ref(false)

const deleteConfirmOpen = ref(false)
const deleteId = ref<number | null>(null)

async function loadGroups() {
  try {
    groups.value = await listMuscleGroups()
  } catch (error) {
    toastApiError(error)
  }
}

onMounted(loadGroups)

async function submitGroup() {
  creating.value = true
  try {
    await createMuscleGroup({
      slug: slug.value,
      name_es: nameEs.value,
      name_en: nameEn.value,
      is_global: isGlobal.value,
    })
    slug.value = ''
    nameEs.value = ''
    nameEn.value = ''
    isGlobal.value = false
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
        <div v-if="groups.length > 0" class="space-y-2">
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
            <BkButton
              v-if="group.owner_id !== null"
              variant="danger"
              size="sm"
              data-testid="delete-muscle-group-btn"
              @click="askDelete(group.id)"
            >
              {{ $t('common.delete') }}
            </BkButton>
          </div>
        </div>

        <BkEmpty v-else :message="$t('library.noGroups')" />

        <!-- Formulario de creación (inline, como el alta de usuarios de AdminCard) -->
        <div class="space-y-3 pt-4 border-t border-line">
          <h3 class="text-sm font-medium">{{ $t('library.newGroup') }}</h3>
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
          <BkButton
            :loading="creating"
            data-testid="create-group-btn"
            @click="submitGroup"
          >
            {{ $t('common.save') }}
          </BkButton>
        </div>
      </div>
    </BkCard>

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

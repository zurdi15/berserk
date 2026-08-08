<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'

import { getSharing, grantSharing, listUserDirectory, revokeSharing } from '@/api/domain'
import type { UserDirectoryEntry } from '@/api/domain'
import type { UserOut } from '@/api/auth'
import { toastApiError } from '@/utils/apiErrors'
import { ApiError } from '@/api/client'
import BkCard from '@/lib/BkCard.vue'
import BkActionBtn from '@/lib/BkActionBtn.vue'
import BkButton from '@/lib/BkButton.vue'
import BkEmpty from '@/lib/BkEmpty.vue'
import BkSelect from '@/lib/BkSelect.vue'
import BkSheet from '@/lib/BkSheet.vue'
import BkUser from '@/lib/BkUser.vue'
import { useAthleteStore } from '@/stores/athlete'
import { useToastStore } from '@/stores/toast'

const { t } = useI18n()
const router = useRouter()
const athlete = useAthleteStore()
const toast = useToastStore()

const givenUsers = ref<UserOut[]>([])
const receivedUsers = ref<UserOut[]>([])
// item 11: picker en vez de textfield con el username a ciegas — se elige
// de una lista real (directory), sin adivinar
const directory = ref<UserDirectoryEntry[]>([])
const selectedUsername = ref('')
const grantError = ref('')
const isLoading = ref(false)
const revokeConfirmOpen = ref(false)
const revokeUserId = ref<number | null>(null)
// gatea las dos listas (given/received) hasta que la carga inicial resuelve:
// sin esto cada una muestra su mensaje de "nadie" y ~100ms después aparece
// el contenido real de golpe — mismo patrón que TodayView. true también en
// error, para no dejar la sección en blanco.
const ready = ref(false)

// item 11: excluye a quien YA tiene acceso concedido (givenUsers) — el
// directorio en sí ya excluye a uno mismo (ver backend GET /users/directory)
const grantableUsers = computed(() =>
  directory.value.filter((u) => !givenUsers.value.some((g) => g.id === u.id)),
)
const grantOptions = computed(() =>
  grantableUsers.value.map((u) => ({ value: u.username, label: u.username })),
)

async function loadSharing() {
  try {
    const sharing = await getSharing()
    givenUsers.value = sharing.given
    receivedUsers.value = sharing.received
  } catch (error) {
    toastApiError(error)
  } finally {
    ready.value = true
  }
}

async function loadDirectory() {
  try {
    directory.value = await listUserDirectory()
  } catch (error) {
    toastApiError(error)
  }
}

onMounted(() => {
  loadSharing()
  loadDirectory()
})

async function handleGrant() {
  // el picker puede quedar vacío (nada seleccionado, o sin candidatos):
  // no hay nada que enviar todavía
  if (!selectedUsername.value) return

  grantError.value = ''
  isLoading.value = true

  try {
    // contrato sin cambios (item 11): grantSharing sigue mandando el
    // username, no un id — el picker solo cambia CÓMO se elige, no qué se envía
    await grantSharing(selectedUsername.value)
    selectedUsername.value = ''
    const sharing = await getSharing()
    givenUsers.value = sharing.given
    receivedUsers.value = sharing.received
    toast.push('info', t('common.saved'))
  } catch (error) {
    if (error instanceof ApiError) {
      if (error.slug === 'user_not_found' || error.slug === 'cannot_share_self' || error.slug === 'already_shared') {
        grantError.value = t(`errors.${error.slug}`)
      } else {
        toastApiError(error)
      }
    } else {
      toastApiError(error)
    }
  } finally {
    isLoading.value = false
  }
}

async function handleRevoke(userId: number) {
  revokeUserId.value = userId
  revokeConfirmOpen.value = true
}

async function confirmRevoke() {
  revokeConfirmOpen.value = false
  if (revokeUserId.value === null) return

  try {
    await revokeSharing(revokeUserId.value)
    const sharing = await getSharing()
    givenUsers.value = sharing.given
    receivedUsers.value = sharing.received
    toast.push('info', t('common.saved'))
  } catch (error) {
    toastApiError(error)
  }
}

function handleViewUser(user: UserOut) {
  athlete.view(user)
  router.push({ name: 'today' })
}
</script>

<template>
  <BkCard :title="$t('profile.sharing')">
    <div class="space-y-6">
      <!-- Given sharing -->
      <div>
        <h3 class="text-sm font-medium mb-3">{{ $t('profile.sharingGiven') }}</h3>
        <template v-if="ready">
          <!-- item 10: BkEmpty unificado — sin acción propia, conceder
               acceso exige elegir a alguien primero (picker de abajo), no
               es un botón de un solo click -->
          <BkEmpty v-if="givenUsers.length === 0" :message="$t('profile.noSharingGiven')" />
          <!-- v0.11.7: revocar difumina la fila (bk-remove) -->
          <div v-else class="relative space-y-2">
            <TransitionGroup name="bk-remove">
            <div v-for="user in givenUsers" :key="user.id" class="flex items-center justify-between p-2 rounded border border-line">
              <BkUser :user="user" />
              <!-- item 5: icon-only (borrar = misma X que en el resto de la app) -->
              <BkActionBtn
                icon="delete"
                data-testid="revoke-btn"
                :aria-label="$t('common.delete')"
                @click="handleRevoke(user.id)"
              />
            </div>
            </TransitionGroup>
          </div>
        </template>
      </div>

      <!-- Received sharing -->
      <div>
        <h3 class="text-sm font-medium mb-3">{{ $t('profile.sharingReceived') }}</h3>
        <template v-if="ready">
          <BkEmpty v-if="receivedUsers.length === 0" :message="$t('profile.noSharingReceived')" />
          <div v-else class="space-y-2">
            <div v-for="user in receivedUsers" :key="user.id" class="flex items-center justify-between p-2 rounded border border-line">
              <BkUser :user="user" />
              <!-- item 5: icon-only (ojo, nuevo icono de BkActionBtn) -->
              <BkActionBtn
                icon="view"
                data-testid="view-user-btn"
                :aria-label="$t('profile.view')"
                @click="handleViewUser(user)"
              />
            </div>
          </div>
        </template>
      </div>

      <!-- Grant sharing: item 11, picker de la lista real de usuarios en vez
           de un textfield con el username a ciegas -->
      <div class="space-y-3 pt-4 border-t border-line">
        <h3 class="text-sm font-medium">{{ $t('profile.grantSharing') }}</h3>
        <p v-if="!grantOptions.length" class="text-sm text-ink-muted" data-testid="no-grantable-users">
          {{ $t('profile.noUsersToGrant') }}
        </p>
        <div v-else class="space-y-2">
          <div class="flex gap-2">
            <BkSelect
              v-model="selectedUsername"
              :label="$t('profile.username')"
              :options="grantOptions"
              data-testid="grant-user-select"
              class="flex-1"
            />
            <div class="flex items-end">
              <BkButton
                :loading="isLoading"
                data-testid="grant-btn"
                @click="handleGrant"
              >
                {{ $t('common.save') }}
              </BkButton>
            </div>
          </div>
          <p v-if="grantError" data-testid="grant-error" class="text-sm text-danger">{{ grantError }}</p>
        </div>
      </div>
    </div>

    <!-- Revoke confirmation sheet -->
    <BkSheet
      :open="revokeConfirmOpen"
      :title="$t('profile.confirmRevoke')"
      @close="revokeConfirmOpen = false"
    >
      <div class="space-y-4 p-4">
        <p>{{ $t('profile.confirmRevokeMessage') }}</p>
        <div class="flex gap-2">
          <BkButton
            variant="ghost"
            @click="revokeConfirmOpen = false"
          >
            {{ $t('common.cancel') }}
          </BkButton>
          <BkButton
            @click="confirmRevoke"
          >
            {{ $t('common.delete') }}
          </BkButton>
        </div>
      </div>
    </BkSheet>
  </BkCard>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'

import {
  adminListUsers,
  adminCreateUser,
  adminUpdateUser,
  adminDeleteUser,
  adminCreateInvite,
  adminListInvites,
  adminDeleteInvite,
  type UserOut,
  type InviteOut,
} from '@/api/domain'
import { restoreBackup, BACKUP_EXPORT_URL } from '@/api/backup'
import { toastApiError } from '@/utils/apiErrors'
import { parseUtc } from '@/utils/datetime'
import { ApiError } from '@/api/client'
import { useAuthStore } from '@/stores/auth'
import { useToastStore } from '@/stores/toast'
import BkCard from '@/lib/BkCard.vue'
import BkField from '@/lib/BkField.vue'
import BkButton from '@/lib/BkButton.vue'
import BkActionBtn from '@/lib/BkActionBtn.vue'
import BkSheet from '@/lib/BkSheet.vue'

const { t } = useI18n()
const auth = useAuthStore()
const toast = useToastStore()

// Users section
const users = ref<UserOut[]>([])
const createUsername = ref('')
const createPassword = ref('')
const createIsAdmin = ref(false)
const createError = ref('')
const isCreatingUser = ref(false)
const createUserOpen = ref(false)
const resetPasswordOpen = ref(false)
const resetUserId = ref<number | null>(null)
const resetNewPassword = ref('')
const resetError = ref('')
const isResettingPassword = ref(false)

// Delete user confirmation
const deleteUserConfirmOpen = ref(false)
const deleteUserId = ref<number | null>(null)

// Invites section
const invites = ref<InviteOut[]>([])
const newToken = ref<string | null>(null)
const isCreatingInvite = ref(false)
const deleteInviteConfirmOpen = ref(false)
const deleteInviteId = ref<number | null>(null)

// Backup section
const restoreFileInput = ref<HTMLInputElement | null>(null)
const restoreFile = ref<File | null>(null)
const restoreConfirmOpen = ref(false)
const isRestoring = ref(false)

// cada tabla se gatea con su propia bandera (no una compartida): users e
// invites cargan en paralelo lógico pero secuenciados abajo, y la tabla de
// usuarios no debería esperar a que termine invites para dejar de estar en
// blanco — mismo patrón que TodayView, true también en error
const usersReady = ref(false)
const invitesReady = ref(false)

onMounted(async () => {
  await loadUsers()
  await loadInvites()
})

async function loadUsers() {
  try {
    users.value = await adminListUsers()
  } catch (error) {
    toastApiError(error)
  } finally {
    usersReady.value = true
  }
}

async function loadInvites() {
  try {
    invites.value = await adminListInvites()
  } catch (error) {
    toastApiError(error)
  } finally {
    invitesReady.value = true
  }
}

function openCreateUser() {
  createUsername.value = ''
  createPassword.value = ''
  createIsAdmin.value = false
  createError.value = ''
  createUserOpen.value = true
}

async function handleCreateUser() {
  createError.value = ''
  isCreatingUser.value = true

  try {
    await adminCreateUser({
      username: createUsername.value,
      password: createPassword.value,
      is_admin: createIsAdmin.value,
    })
    createUsername.value = ''
    createPassword.value = ''
    createIsAdmin.value = false
    createUserOpen.value = false
    await loadUsers()
    toast.push('info', t('common.saved'))
  } catch (error) {
    if (error instanceof ApiError && error.slug === 'username_taken') {
      createError.value = t(`errors.${error.slug}`)
    } else {
      toastApiError(error)
    }
  } finally {
    isCreatingUser.value = false
  }
}

function handleResetPassword(userId: number) {
  resetUserId.value = userId
  resetNewPassword.value = ''
  resetError.value = ''
  resetPasswordOpen.value = true
}

async function confirmResetPassword() {
  if (resetUserId.value === null) return

  resetError.value = ''
  isResettingPassword.value = true

  try {
    await adminUpdateUser(resetUserId.value, {
      password: resetNewPassword.value,
    })
    resetPasswordOpen.value = false
    await loadUsers()
    toast.push('info', t('common.saved'))
  } catch (error) {
    toastApiError(error)
  } finally {
    isResettingPassword.value = false
  }
}

function handleDeleteUser(userId: number) {
  deleteUserId.value = userId
  deleteUserConfirmOpen.value = true
}

async function confirmDeleteUser() {
  if (deleteUserId.value === null) return

  deleteUserConfirmOpen.value = false
  try {
    await adminDeleteUser(deleteUserId.value)
    await loadUsers()
    toast.push('info', t('common.saved'))
  } catch (error) {
    toastApiError(error)
  }
}

async function handleCreateInvite() {
  isCreatingInvite.value = true
  try {
    const result = await adminCreateInvite()
    newToken.value = result.token
    await loadInvites()
  } catch (error) {
    toastApiError(error)
  } finally {
    isCreatingInvite.value = false
  }
}

async function handleCopyToken() {
  if (!newToken.value) return

  try {
    await navigator.clipboard.writeText(redeemUrl(newToken.value))
    toast.push('info', t('common.saved'))
  } catch {
    // Silently fail if clipboard is not available
  }
}

function handleDeleteInvite(inviteId: number) {
  deleteInviteId.value = inviteId
  deleteInviteConfirmOpen.value = true
}

async function confirmDeleteInvite() {
  if (deleteInviteId.value === null) return

  deleteInviteConfirmOpen.value = false
  try {
    await adminDeleteInvite(deleteInviteId.value)
    await loadInvites()
    toast.push('info', t('common.saved'))
  } catch (error) {
    toastApiError(error)
  }
}

function openRestorePicker() {
  restoreFileInput.value?.click()
}

function onRestoreFileSelected(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0] ?? null
  if (!file) return
  restoreFile.value = file
  restoreConfirmOpen.value = true
}

function cancelRestore() {
  restoreConfirmOpen.value = false
  restoreFile.value = null
  if (restoreFileInput.value) restoreFileInput.value.value = ''
}

async function confirmRestore() {
  if (!restoreFile.value) return

  isRestoring.value = true
  try {
    await restoreBackup(restoreFile.value)
    restoreConfirmOpen.value = false
    toast.push('info', t('admin.backup.restoreSuccess'))
    // la DB restaurada decide quién sigue con sesión: recargar es la única
    // forma fiable de que el resto de la app vea el estado nuevo de golpe
    window.location.reload()
  } catch (error) {
    toastApiError(error)
  } finally {
    isRestoring.value = false
    if (restoreFileInput.value) restoreFileInput.value.value = ''
  }
}

function isOwnUser(userId: number): boolean {
  return userId === auth.user?.id
}

function formatDate(dateString: string): string {
  return parseUtc(dateString).toLocaleDateString()
}

function isInviteUsed(invite: InviteOut): boolean {
  return invite.used_at !== null
}

// el token bare no es un destino: la persona invitada necesita la URL completa
function redeemUrl(token: string): string {
  return `${window.location.origin}/invite/${token}`
}
</script>

<template>
  <div class="space-y-4">
    <!-- Users section -->
    <BkCard :title="$t('admin.users')">
      <div class="space-y-4">
        <!-- Users table: botones icon-only en móvil (aria-label), texto de
             vuelta desde sm — objetivo: sin scroll lateral en 390px. El
             overflow-x-auto queda como red de seguridad, no como caso normal.
             Gateada en usersReady: sin esto, el "sin usuarios" aparece y
             ~100ms después la tabla real la reemplaza de golpe. -->
        <div v-if="usersReady && users.length > 0" class="overflow-x-auto">
          <table class="w-full text-sm">
            <thead>
              <tr class="border-b border-line">
                <th class="text-left py-2 px-2">{{ $t('admin.username') }}</th>
                <th class="text-left py-2 px-2"><span class="sr-only">{{ $t('admin.actions') }}</span></th>
              </tr>
            </thead>
            <tbody class="divide-y divide-line">
              <tr v-for="user in users" :key="user.id" :data-testid="`user-row-${user.id}`" class="hover:bg-stone/30">
                <td class="py-2 px-2">
                  <span class="inline-flex items-center gap-2">
                    {{ user.username }}
                    <!-- estrella en vez de columna: la columna "Administrador"
                         ensanchaba la tabla en móvil sin aportar mucho más que
                         esto — la etiqueta accesible reutiliza admin.isAdmin,
                         ya tiene exactamente el texto que hacía falta -->
                    <span v-if="user.is_admin" class="text-aurora font-semibold" data-testid="admin-badge">
                      ✦
                      <span class="sr-only">{{ $t('admin.isAdmin') }}</span>
                    </span>
                  </span>
                </td>
                <td class="py-2 px-2">
                  <div class="flex justify-end gap-2">
                    <!-- icon-only en todos los tamaños ahora (BkActionBtn,
                         item 7): el "hidden sm:inline" de antes ya no hace
                         falta, ese era justo el punto de unificar -->
                    <BkActionBtn
                      v-if="!isOwnUser(user.id)"
                      icon="key"
                      :aria-label="$t('admin.resetPassword')"
                      data-testid="reset-password-btn"
                      @click="handleResetPassword(user.id)"
                    />
                    <BkActionBtn
                      v-if="!isOwnUser(user.id)"
                      icon="delete"
                      :aria-label="$t('common.delete')"
                      data-testid="delete-user-btn"
                      @click="handleDeleteUser(user.id)"
                    />
                  </div>
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <div v-else-if="usersReady" class="text-sm text-ink-muted">
          {{ $t('admin.noUsers') }}
        </div>

        <!-- Crear usuario: dialog en vez de form inline (sin divider extra
             entre la tabla y esto — space-y-4 del contenedor ya separa) -->
        <div>
          <BkButton data-testid="open-create-user-btn" @click="openCreateUser">
            {{ $t('admin.createUser') }}
          </BkButton>
        </div>
      </div>
    </BkCard>

    <!-- Invites section -->
    <BkCard :title="$t('admin.invites')">
      <div class="space-y-4">
        <!-- Generate invite button and token display -->
        <div class="space-y-3">
          <BkButton
            :loading="isCreatingInvite"
            data-testid="create-invite-btn"
            @click="handleCreateInvite"
          >
            {{ $t('admin.generateInvite') }}
          </BkButton>

          <div v-if="newToken" class="space-y-2">
            <div class="text-sm text-ink-muted">{{ $t('admin.token') }}</div>
            <div class="bk-slab p-3 mono text-sm break-all" data-testid="token-display">
              {{ newToken }}
            </div>
            <div class="flex gap-2">
              <BkButton
                variant="ghost"
                size="sm"
                data-testid="copy-token-btn"
                @click="handleCopyToken"
              >
                {{ $t('admin.copyToken') }}
              </BkButton>
            </div>
            <div class="text-xs text-ink-muted italic">
              {{ $t('admin.tokenOnce') }}
            </div>
          </div>
        </div>

        <!-- Invites list: gateada en invitesReady, mismo motivo que la tabla de usuarios -->
        <div v-if="invitesReady && invites.length > 0" class="space-y-2 pt-4 border-t border-line">
          <h3 class="text-sm font-medium">{{ $t('admin.invites') }}</h3>
          <div class="space-y-2">
            <div
              v-for="invite in invites"
              :key="invite.id"
              class="flex items-center justify-between p-2 rounded border border-line text-sm"
              :data-testid="`invite-row-${invite.id}`"
            >
              <div>
                <div>
                  <span class="text-ink-muted">{{ $t('admin.created') }}: </span>
                  {{ formatDate(invite.created_at) }}
                </div>
                <div>
                  <span class="text-ink-muted">{{ $t('admin.expires') }}: </span>
                  {{ formatDate(invite.expires_at) }}
                </div>
                <div v-if="isInviteUsed(invite)" class="text-ink-muted">
                  {{ $t('admin.used') }}: {{ formatDate(invite.used_at || '') }}
                </div>
                <div v-else class="text-aurora">
                  {{ $t('admin.pending') }}
                </div>
              </div>
              <BkButton
                variant="danger"
                size="sm"
                data-testid="delete-invite-btn"
                @click="handleDeleteInvite(invite.id)"
              >
                {{ $t('common.delete') }}
              </BkButton>
            </div>
          </div>
        </div>

        <div v-else-if="invitesReady" class="text-sm text-ink-muted">
          {{ $t('admin.noInvites') }}
        </div>
      </div>
    </BkCard>

    <!-- Backup section -->
    <BkCard :title="$t('admin.backup.title')">
      <div class="flex flex-wrap gap-2">
        <!-- anchor real (no fetch+blob): mismas clases que BkButton variant
             primary/md para que se vea igual, pero navega de verdad — un
             ZIP puede pesar cientos de MB y el navegador ya sabe transmitir
             una descarga de FileResponse sin que JS tenga que bufferearla -->
        <a
          :href="BACKUP_EXPORT_URL"
          download
          data-testid="export-backup-link"
          class="bk-press inline-flex items-center justify-center gap-2 font-display font-semibold uppercase tracking-wide rounded-sm border transition-colors px-5 py-2.5 bg-aurora-deep border-aurora text-ink hover:bg-aurora hover:text-void"
        >
          {{ $t('admin.backup.export') }}
        </a>
        <BkButton
          variant="ghost"
          data-testid="restore-backup-btn"
          @click="openRestorePicker"
        >
          {{ $t('admin.backup.restore') }}
        </BkButton>
        <input
          ref="restoreFileInput"
          type="file"
          accept=".zip"
          class="hidden"
          data-testid="restore-backup-input"
          @change="onRestoreFileSelected"
        />
      </div>
    </BkCard>

    <!-- Create user sheet -->
    <BkSheet
      :open="createUserOpen"
      :title="$t('admin.createUser')"
      @close="createUserOpen = false"
    >
      <div class="space-y-4 p-4">
        <BkField
          v-model="createUsername"
          :label="$t('admin.username')"
          :error="createError"
          data-testid="create-username-field"
        />
        <BkField
          v-model="createPassword"
          type="password"
          :label="$t('admin.password')"
          data-testid="create-password-field"
        />
        <label class="flex items-center gap-2 cursor-pointer">
          <input
            v-model="createIsAdmin"
            type="checkbox"
            class="rounded border border-line"
            data-testid="create-is-admin-checkbox"
          />
          <span class="text-sm text-ink-muted">{{ $t('admin.isAdmin') }}</span>
        </label>
        <div class="flex gap-2">
          <BkButton
            variant="ghost"
            @click="createUserOpen = false"
          >
            {{ $t('common.cancel') }}
          </BkButton>
          <BkButton
            :loading="isCreatingUser"
            data-testid="create-user-btn"
            @click="handleCreateUser"
          >
            {{ $t('common.save') }}
          </BkButton>
        </div>
      </div>
    </BkSheet>

    <!-- Password reset sheet -->
    <BkSheet
      :open="resetPasswordOpen"
      :title="$t('admin.resetPassword')"
      @close="resetPasswordOpen = false"
    >
      <div class="space-y-4 p-4">
        <BkField
          v-model="resetNewPassword"
          type="password"
          :label="$t('admin.newPassword')"
          :error="resetError"
          data-testid="reset-password-field"
        />
        <div class="flex gap-2">
          <BkButton
            variant="ghost"
            @click="resetPasswordOpen = false"
          >
            {{ $t('common.cancel') }}
          </BkButton>
          <BkButton
            :loading="isResettingPassword"
            data-testid="confirm-reset-password-btn"
            @click="confirmResetPassword"
          >
            {{ $t('common.save') }}
          </BkButton>
        </div>
      </div>
    </BkSheet>

    <!-- Delete user confirmation sheet -->
    <BkSheet
      :open="deleteUserConfirmOpen"
      :title="$t('admin.confirmDeleteUser')"
      @close="deleteUserConfirmOpen = false"
      data-testid="delete-user-confirm-sheet"
    >
      <div class="space-y-4 p-4">
        <p>{{ $t('admin.confirmDeleteUserMessage') }}</p>
        <div class="flex gap-2">
          <BkButton
            variant="ghost"
            @click="deleteUserConfirmOpen = false"
            data-testid="delete-user-cancel-btn"
          >
            {{ $t('common.cancel') }}
          </BkButton>
          <BkButton
            variant="danger"
            @click="confirmDeleteUser"
            data-testid="delete-user-confirm-btn"
          >
            {{ $t('common.delete') }}
          </BkButton>
        </div>
      </div>
    </BkSheet>

    <!-- Delete invite confirmation sheet -->
    <BkSheet
      :open="deleteInviteConfirmOpen"
      :title="$t('admin.confirmDeleteInvite')"
      @close="deleteInviteConfirmOpen = false"
      data-testid="delete-invite-confirm-sheet"
    >
      <div class="space-y-4 p-4">
        <p>{{ $t('admin.confirmDeleteInviteMessage') }}</p>
        <div class="flex gap-2">
          <BkButton
            variant="ghost"
            @click="deleteInviteConfirmOpen = false"
            data-testid="delete-invite-cancel-btn"
          >
            {{ $t('common.cancel') }}
          </BkButton>
          <BkButton
            variant="danger"
            @click="confirmDeleteInvite"
            data-testid="delete-invite-confirm-btn"
          >
            {{ $t('common.delete') }}
          </BkButton>
        </div>
      </div>
    </BkSheet>

    <!-- Restore backup confirmation sheet -->
    <BkSheet
      :open="restoreConfirmOpen"
      :title="$t('admin.backup.confirmTitle')"
      @close="cancelRestore"
      data-testid="restore-backup-confirm-sheet"
    >
      <div class="space-y-4 p-4">
        <p>{{ $t('admin.backup.confirmHint') }}</p>
        <div class="flex gap-2">
          <BkButton
            variant="ghost"
            @click="cancelRestore"
            data-testid="restore-backup-cancel-btn"
          >
            {{ $t('common.cancel') }}
          </BkButton>
          <BkButton
            variant="danger"
            :loading="isRestoring"
            @click="confirmRestore"
            data-testid="restore-backup-confirm-btn"
          >
            {{ $t('admin.backup.restore') }}
          </BkButton>
        </div>
      </div>
    </BkSheet>
  </div>
</template>

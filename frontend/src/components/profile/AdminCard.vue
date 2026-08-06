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
import { toastApiError } from '@/utils/apiErrors'
import { parseUtc } from '@/utils/datetime'
import { ApiError } from '@/api/client'
import { useAuthStore } from '@/stores/auth'
import { useToastStore } from '@/stores/toast'
import BkCard from '@/lib/BkCard.vue'
import BkField from '@/lib/BkField.vue'
import BkButton from '@/lib/BkButton.vue'
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

onMounted(async () => {
  await loadUsers()
  await loadInvites()
})

async function loadUsers() {
  try {
    users.value = await adminListUsers()
  } catch (error) {
    toastApiError(error)
  }
}

async function loadInvites() {
  try {
    invites.value = await adminListInvites()
  } catch (error) {
    toastApiError(error)
  }
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
        <!-- Users table -->
        <div v-if="users.length > 0" class="overflow-x-auto">
          <table class="w-full text-sm">
            <thead>
              <tr class="border-b border-line">
                <th class="text-left py-2 px-2">{{ $t('admin.username') }}</th>
                <th class="text-left py-2 px-2">{{ $t('admin.isAdmin') }}</th>
                <th class="text-left py-2 px-2">{{ $t('common.delete') }}</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="user in users" :key="user.id" :data-testid="`user-row-${user.id}`" class="border-b border-line hover:bg-stone/30">
                <td class="py-2 px-2">{{ user.username }}</td>
                <td class="py-2 px-2">
                  <span v-if="user.is_admin" class="text-aurora font-semibold" data-testid="admin-badge">✦</span>
                </td>
                <td class="py-2 px-2">
                  <div class="flex gap-2">
                    <BkButton
                      v-if="!isOwnUser(user.id)"
                      variant="ghost"
                      size="sm"
                      data-testid="reset-password-btn"
                      @click="handleResetPassword(user.id)"
                    >
                      {{ $t('admin.resetPassword') }}
                    </BkButton>
                    <BkButton
                      v-if="!isOwnUser(user.id)"
                      variant="danger"
                      size="sm"
                      data-testid="delete-user-btn"
                      @click="handleDeleteUser(user.id)"
                    >
                      {{ $t('common.delete') }}
                    </BkButton>
                  </div>
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <div v-else class="text-sm text-ink-muted">
          {{ $t('admin.noUsers') }}
        </div>

        <!-- Create user form -->
        <div class="space-y-3 pt-4 border-t border-line">
          <h3 class="text-sm font-medium">{{ $t('admin.createUser') }}</h3>
          <div class="space-y-3">
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
            <BkButton
              :loading="isCreatingUser"
              data-testid="create-user-btn"
              @click="handleCreateUser"
            >
              {{ $t('common.save') }}
            </BkButton>
          </div>
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

        <!-- Invites list -->
        <div v-if="invites.length > 0" class="space-y-2 pt-4 border-t border-line">
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

        <div v-else class="text-sm text-ink-muted">
          {{ $t('admin.noInvites') }}
        </div>
      </div>
    </BkCard>

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
  </div>
</template>

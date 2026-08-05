<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'

import { getSharing, grantSharing, revokeSharing } from '@/api/domain'
import type { UserOut } from '@/api/auth'
import { toastApiError } from '@/utils/apiErrors'
import { ApiError } from '@/api/client'
import BkCard from '@/lib/BkCard.vue'
import BkField from '@/lib/BkField.vue'
import BkButton from '@/lib/BkButton.vue'
import BkSheet from '@/lib/BkSheet.vue'
import { useAthleteStore } from '@/stores/athlete'
import { useToastStore } from '@/stores/toast'

const { t } = useI18n()
const router = useRouter()
const athlete = useAthleteStore()
const toast = useToastStore()

const givenUsers = ref<UserOut[]>([])
const receivedUsers = ref<UserOut[]>([])
const grantUsername = ref('')
const grantError = ref('')
const isLoading = ref(false)
const revokeConfirmOpen = ref(false)
const revokeUserId = ref<number | null>(null)

onMounted(async () => {
  try {
    const sharing = await getSharing()
    givenUsers.value = sharing.given
    receivedUsers.value = sharing.received
  } catch (error) {
    toastApiError(error)
  }
})

async function handleGrant() {
  grantError.value = ''
  isLoading.value = true

  try {
    await grantSharing(grantUsername.value)
    grantUsername.value = ''
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
        <div v-if="givenUsers.length === 0" class="text-sm text-neutral-500">
          {{ $t('profile.noSharingGiven') }}
        </div>
        <div v-else class="space-y-2">
          <div v-for="user in givenUsers" :key="user.id" class="flex items-center justify-between p-2 rounded border border-neutral-200 dark:border-neutral-700">
            <span>{{ user.username }}</span>
            <BkButton
              :label="$t('common.delete')"
              variant="ghost"
              size="sm"
              data-testid="revoke-btn"
              @click="handleRevoke(user.id)"
            />
          </div>
        </div>
      </div>

      <!-- Received sharing -->
      <div>
        <h3 class="text-sm font-medium mb-3">{{ $t('profile.sharingReceived') }}</h3>
        <div v-if="receivedUsers.length === 0" class="text-sm text-neutral-500">
          {{ $t('profile.noSharingReceived') }}
        </div>
        <div v-else class="space-y-2">
          <div v-for="user in receivedUsers" :key="user.id" class="flex items-center justify-between p-2 rounded border border-neutral-200 dark:border-neutral-700">
            <span>{{ user.username }}</span>
            <BkButton
              :label="$t('profile.view')"
              variant="ghost"
              size="sm"
              data-testid="view-user-btn"
              @click="handleViewUser(user)"
            />
          </div>
        </div>
      </div>

      <!-- Grant sharing -->
      <div class="space-y-3 pt-4 border-t border-neutral-200 dark:border-neutral-700">
        <h3 class="text-sm font-medium">{{ $t('profile.grantSharing') }}</h3>
        <div class="flex gap-2">
          <BkField
            v-model="grantUsername"
            :label="$t('profile.username')"
            :error="grantError"
            data-testid="grant-username-field"
            class="flex-1"
          />
          <div class="flex items-end">
            <BkButton
              :label="$t('common.save')"
              :is-loading="isLoading"
              data-testid="grant-btn"
              @click="handleGrant"
            />
          </div>
        </div>
      </div>
    </div>

    <!-- Revoke confirmation sheet -->
    <BkSheet
      v-model:open="revokeConfirmOpen"
      :title="$t('profile.confirmRevoke')"
    >
      <div class="space-y-4 p-4">
        <p>{{ $t('profile.confirmRevokeMessage') }}</p>
        <div class="flex gap-2">
          <BkButton
            :label="$t('common.cancel')"
            variant="ghost"
            @click="revokeConfirmOpen = false"
          />
          <BkButton
            :label="$t('common.delete')"
            @click="confirmRevoke"
          />
        </div>
      </div>
    </BkSheet>
  </BkCard>
</template>

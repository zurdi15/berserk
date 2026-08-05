<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'

import { logout } from '@/api/auth'
import { toastApiError } from '@/utils/apiErrors'
import BkTabs from '@/lib/BkTabs.vue'
import BkButton from '@/lib/BkButton.vue'
import SettingsCard from '@/components/profile/SettingsCard.vue'
import PasswordCard from '@/components/profile/PasswordCard.vue'
import SharingCard from '@/components/profile/SharingCard.vue'
import { useAuthStore } from '@/stores/auth'

const { t } = useI18n()
const router = useRouter()
const auth = useAuthStore()

const tabs = [
  { id: 'profile', label: t('profile.tab') },
  { id: 'routines', label: t('profile.routinesTab') },
]

// Add admin tab if user is admin
if (auth.user?.is_admin) {
  tabs.push({ id: 'admin', label: t('profile.adminTab') })
}

async function handleLogout() {
  try {
    await logout()
    auth.user = null
    router.push({ name: 'login' })
  } catch (error) {
    toastApiError(error)
  }
}
</script>

<template>
  <div class="space-y-4">
    <BkTabs :tabs="tabs" :active="'profile'">
      <template #profile>
        <div class="space-y-4">
          <SettingsCard />
          <PasswordCard />
          <SharingCard />

          <BkButton
            :label="$t('profile.logout')"
            data-testid="logout-btn"
            @click="handleLogout"
          />
        </div>
      </template>

      <template #routines>
        <div class="text-neutral-500">{{ $t('app.placeholder') }}</div>
      </template>

      <template v-if="auth.user?.is_admin" #admin>
        <div class="text-neutral-500">{{ $t('app.placeholder') }}</div>
      </template>
    </BkTabs>
  </div>
</template>

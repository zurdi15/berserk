<script setup lang="ts">
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'

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

const activeTab = ref('profile')

const tabs = [
  { value: 'profile', label: t('profile.tab') },
  { value: 'routines', label: t('profile.routinesTab') },
]

// Add admin tab if user is admin
if (auth.user?.is_admin) {
  tabs.push({ value: 'admin', label: t('profile.adminTab') })
}

async function handleLogout() {
  try {
    await auth.logout()
    router.push({ name: 'login' })
  } catch (error) {
    toastApiError(error)
  }
}
</script>

<template>
  <div class="space-y-4">
    <BkTabs v-model="activeTab" :tabs="tabs">
      <template v-if="activeTab === 'profile'">
        <div class="space-y-4">
          <SettingsCard />
          <PasswordCard />
          <SharingCard />

          <BkButton
            variant="ghost"
            data-testid="logout-btn"
            @click="handleLogout"
          >
            {{ $t('profile.logout') }}
          </BkButton>
        </div>
      </template>

      <template v-if="activeTab === 'routines'">
        <div class="text-ink-muted">{{ $t('app.placeholder') }}</div>
      </template>

      <template v-if="activeTab === 'admin' && auth.user?.is_admin">
        <div class="text-ink-muted">{{ $t('app.placeholder') }}</div>
      </template>
    </BkTabs>
  </div>
</template>

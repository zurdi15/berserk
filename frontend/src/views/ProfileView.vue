<script setup lang="ts">
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'

import { toastApiError } from '@/utils/apiErrors'
import BkTabs from '@/lib/BkTabs.vue'
import BkButton from '@/lib/BkButton.vue'
import SettingsCard from '@/components/profile/SettingsCard.vue'
import PasswordCard from '@/components/profile/PasswordCard.vue'
import SharingCard from '@/components/profile/SharingCard.vue'
import AdminCard from '@/components/profile/AdminCard.vue'
import RoutineList from '@/components/routines/RoutineList.vue'
import ExerciseManager from '@/components/library/ExerciseManager.vue'
import MuscleGroupManager from '@/components/library/MuscleGroupManager.vue'
import { useAuthStore } from '@/stores/auth'

const { t } = useI18n()
const router = useRouter()
const auth = useAuthStore()

const activeTab = ref('profile')

// Compute tabs based on user role
const tabs = computed(() => {
  const baseTabs = [
    { value: 'profile', label: t('profile.tab') },
    { value: 'routines', label: t('profile.routinesTab') },
    { value: 'library', label: t('profile.libraryTab') },
  ]

  if (auth.user?.is_admin) {
    baseTabs.push({ value: 'admin', label: t('profile.adminTab') })
  }

  return baseTabs
})

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
    <BkTabs v-model="activeTab" :tabs="tabs" />

    <div v-if="activeTab === 'profile'" class="space-y-4">
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

    <RoutineList v-if="activeTab === 'routines'" />

    <div v-if="activeTab === 'library'" class="space-y-4">
      <h2 class="text-lg font-semibold text-ink">{{ $t('library.title') }}</h2>
      <ExerciseManager />
      <MuscleGroupManager />
    </div>

    <AdminCard v-if="activeTab === 'admin' && auth.user?.is_admin" />
  </div>
</template>

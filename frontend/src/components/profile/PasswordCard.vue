<script setup lang="ts">
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'

import { changePassword } from '@/api/auth'
import { toastApiError } from '@/utils/apiErrors'
import { ApiError } from '@/api/client'
import BkCard from '@/lib/BkCard.vue'
import BkField from '@/lib/BkField.vue'
import BkButton from '@/lib/BkButton.vue'
import { useToastStore } from '@/stores/toast'

const { t } = useI18n()
const toast = useToastStore()

const currentPassword = ref('')
const newPassword = ref('')
const passwordError = ref('')
const isLoading = ref(false)

async function handleChangePassword() {
  passwordError.value = ''
  isLoading.value = true

  try {
    await changePassword(currentPassword.value, newPassword.value)
    currentPassword.value = ''
    newPassword.value = ''
    toast.push('info', t('common.saved'))
  } catch (error) {
    if (error instanceof ApiError && error.slug === 'wrong_password') {
      passwordError.value = t('errors.wrong_password')
    } else {
      toastApiError(error)
    }
  } finally {
    isLoading.value = false
  }
}
</script>

<template>
  <BkCard :title="$t('profile.password')">
    <div class="space-y-4">
      <BkField
        v-model="currentPassword"
        type="password"
        :label="$t('profile.currentPassword')"
        :error="passwordError"
        data-testid="current-password-field"
      />

      <BkField
        v-model="newPassword"
        type="password"
        :label="$t('profile.newPassword')"
        data-testid="new-password-field"
      />

      <BkButton
        :label="$t('common.save')"
        :is-loading="isLoading"
        data-testid="change-password-btn"
        @click="handleChangePassword"
      />
    </div>
  </BkCard>
</template>

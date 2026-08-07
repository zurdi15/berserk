<script setup lang="ts">
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'

import { changePassword } from '@/api/auth'
import { toastApiError } from '@/utils/apiErrors'
import { ApiError } from '@/api/client'
import { isPasswordValid, passwordErrorKey } from '@/utils/passwordValidation'
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

// item (v0.4.0): validación de cliente ANTES de someter — antes, escribir
// una contraseña inválida (corta o >72 bytes) solo se descubría al enviar,
// y el 422 de pydantic (una lista, no un slug) colapsaba a "Algo ha
// fallado" (ver apiErrors.ts para el arreglo de defensa en profundidad).
// Aquí se evita el viaje de red por completo: el campo muestra el motivo en
// vivo y el botón no somete hasta que sea válida.
const newPasswordError = computed(() => {
  const key = passwordErrorKey(newPassword.value)
  return key ? t(key) : ''
})

async function handleChangePassword() {
  if (!isPasswordValid(newPassword.value)) return

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
        :error="newPasswordError"
        data-testid="new-password-field"
      />

      <BkButton
        :loading="isLoading"
        :disabled="!isPasswordValid(newPassword)"
        data-testid="change-password-btn"
        @click="handleChangePassword"
      >
        {{ $t('common.save') }}
      </BkButton>
    </div>
  </BkCard>
</template>

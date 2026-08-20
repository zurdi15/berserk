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
const repeatPassword = ref('')
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

// v0.27.0 (zurdi: "cambiar la contraseña de forma robusta, pidiendo la
// actual y repitiendo dos veces la nueva"): la confirmación es puramente de
// cliente (el backend nunca la ve) — su único fin es que una errata al
// teclear no te deje fuera de tu propia cuenta. Callada mientras el campo
// esté vacío, como el resto de errores en vivo de este formulario.
const repeatPasswordError = computed(() => {
  if (repeatPassword.value.length === 0) return ''
  return repeatPassword.value === newPassword.value ? '' : t('profile.passwordMismatch')
})

const canSubmit = computed(
  () => isPasswordValid(newPassword.value) && repeatPassword.value === newPassword.value,
)

async function handleChangePassword() {
  if (!canSubmit.value) return

  passwordError.value = ''
  isLoading.value = true

  try {
    await changePassword(currentPassword.value, newPassword.value)
    currentPassword.value = ''
    newPassword.value = ''
    repeatPassword.value = ''
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
        autocomplete="current-password"
        data-testid="current-password-field"
      />

      <BkField
        v-model="newPassword"
        type="password"
        :label="$t('profile.newPassword')"
        :error="newPasswordError"
        autocomplete="new-password"
        data-testid="new-password-field"
      />

      <BkField
        v-model="repeatPassword"
        type="password"
        :label="$t('profile.repeatPassword')"
        :error="repeatPasswordError"
        autocomplete="new-password"
        data-testid="repeat-password-field"
      />

      <BkButton
        :loading="isLoading"
        :disabled="!canSubmit"
        data-testid="change-password-btn"
        @click="handleChangePassword"
      >
        {{ $t('common.save') }}
      </BkButton>
    </div>
  </BkCard>
</template>

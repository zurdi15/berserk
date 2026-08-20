<script setup lang="ts">
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'

import { updateSettings } from '@/api/auth'
import { ApiError } from '@/api/client'
import { toastApiError } from '@/utils/apiErrors'
import { isUsernameValid, usernameErrorKey } from '@/utils/usernameValidation'
import BkButton from '@/lib/BkButton.vue'
import BkCard from '@/lib/BkCard.vue'
import BkField from '@/lib/BkField.vue'
import ColorSwatchPicker from '@/lib/ColorSwatchPicker.vue'
import AvatarPicker from './AvatarPicker.vue'
import { useAuthStore } from '@/stores/auth'
import { useToastStore } from '@/stores/toast'

// v0.27.0 (zurdi: "el tema del perfil y los ajustes está descolocado"): la
// identidad se separa de la configuración de la app. Aquí vive TODO lo que
// eres —foto, nombre, color—; en SettingsCard, todo lo que es la web app
// (tema, idioma, unidades, zona horaria, versión). El color se muda desde
// SettingsCard y por fin adopta ColorSwatchPicker, el componente que
// AdminCard ya usaba (ver el TODO de su cabecera).
const { t } = useI18n()
const auth = useAuthStore()
const toast = useToastStore()

const username = ref(auth.user!.username)
// null = sin color propio, cae al aurora del tema (ver USER_COLOR_SWATCHES)
const color = ref<string | null>(auth.user!.color ?? null)
// error del servidor (username_taken): se limpia al teclear, si no se queda
// pegado señalando un nombre que ya cambió
const usernameServerError = ref('')
const usernameSaving = ref(false)

const usernameError = computed(() => {
  if (usernameServerError.value) return usernameServerError.value
  const key = usernameErrorKey(username.value)
  return key ? t(key) : ''
})

// guardar solo tiene sentido con un nombre válido Y distinto del actual
const canSaveUsername = computed(
  () => isUsernameValid(username.value) && username.value.trim() !== auth.user?.username,
)

async function saveUsername() {
  if (!canSaveUsername.value) return
  usernameServerError.value = ''
  usernameSaving.value = true
  try {
    auth.user = await updateSettings({ username: username.value.trim() })
    username.value = auth.user.username
    toast.push('info', t('common.saved'))
  } catch (error) {
    // el 409 se pinta EN el campo (es ese valor el que no vale), no en un
    // toast que se va y deja el formulario sin explicación
    if (error instanceof ApiError && error.slug === 'username_taken') {
      usernameServerError.value = t('errors.username_taken')
    } else {
      toastApiError(error)
    }
  } finally {
    usernameSaving.value = false
  }
}

async function pickColor(value: string | null) {
  color.value = value
  try {
    auth.user = await updateSettings({ color: value })
    toast.push('info', t('common.saved'))
  } catch (error) {
    toastApiError(error)
  }
}
</script>

<template>
  <!-- sin título: la sección ya se titula "Cuenta" (misma razón que
       SettingsCard); la tarjeta de contraseña sí lo lleva, para separarlas -->
  <BkCard>
    <div class="space-y-5">
      <!-- la foto también se cambia tocando el avatar del hub; aquí además
           se puede quitar (removable) -->
      <AvatarPicker removable />

      <div class="space-y-2">
        <!-- etiqueta VISIBLE (y no solo el placeholder de BkField, que es lo
             habitual): el campo viene precargado con tu nombre, así que el
             placeholder nunca se ve y sin esto la caja no dice qué es. Mismo
             marcado que la etiqueta de ColorSwatchPicker, aquí al lado. -->
        <span class="block text-sm text-ink-muted">{{ $t('profile.username') }}</span>
        <BkField
          v-model="username"
          :label="$t('profile.username')"
          :error="usernameError"
          autocomplete="username"
          data-testid="username-field"
          @update:model-value="usernameServerError = ''"
        />
        <BkButton
          block
          size="sm"
          variant="ghost"
          :loading="usernameSaving"
          :disabled="!canSaveUsername"
          data-testid="save-username-btn"
          @click="saveUsername"
        >
          {{ $t('profile.saveUsername') }}
        </BkButton>
      </div>

      <ColorSwatchPicker
        :model-value="color"
        :label="$t('profile.color')"
        @update:model-value="pickColor"
      />
    </div>
  </BkCard>
</template>

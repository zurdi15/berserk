<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'

import { avatarUrl, deleteAvatar, uploadAvatar } from '@/api/domain'
import { toastApiError } from '@/utils/apiErrors'
import { useAuthStore } from '@/stores/auth'

// v0.27.0 (zurdi: "eliminar el botón de editar y de borrar imagen que está
// debajo del avatar"): el círculo del avatar y su lógica de subida vivían
// inline en ProfileView. Ahora se comparten entre el hub (solo el círculo:
// tocarlo cambia la foto, sin botones colgando debajo) y la sección Cuenta,
// que es donde vive el "quitar foto" — de ahí el prop `removable` en vez de
// dos copias del mismo marcado.
// v0.19.x (zurdi: "que se pueda poner foto de perfil"): tocar el avatar abre
// el picker; subir refresca /auth/me y con él avatar_version — la URL del
// <img> cambia sola (v0.25.2: adiós al Date.now() por montaje, que
// refetcheaba la foto completa en CADA visita al perfil)
const props = withDefaults(defineProps<{ removable?: boolean }>(), { removable: false })

const { t } = useI18n()
const auth = useAuthStore()

const avatarInput = ref<HTMLInputElement | null>(null)
const avatarBusy = ref(false)
// v0.26.0 (zurdi: "no me gusta nada el iconito del navegador de imagen
// rota"): si la foto falla, se cae a la INICIAL de siempre — el mismo
// placeholder que sin avatar. Reset al cambiar de versión (re-subida).
const avatarError = ref(false)
watch(() => auth.user?.avatar_version, () => {
  avatarError.value = false
})

const initial = computed(() => (auth.user?.username?.[0] ?? '?').toUpperCase())

function pickAvatar() {
  avatarInput.value?.click()
}

async function onAvatarPicked(event: Event) {
  const file = (event.target as HTMLInputElement).files?.[0]
  ;(event.target as HTMLInputElement).value = ''
  if (!file) return
  try {
    avatarBusy.value = true
    await uploadAvatar(file)
    await auth.refreshMe()
  } catch (error) {
    toastApiError(error)
  } finally {
    avatarBusy.value = false
  }
}

async function removeAvatar() {
  try {
    avatarBusy.value = true
    await deleteAvatar()
    await auth.refreshMe()
  } catch (error) {
    toastApiError(error)
  } finally {
    avatarBusy.value = false
  }
}
</script>

<template>
  <div class="flex flex-col items-center gap-2">
    <!-- tocar el avatar cambia/pone la foto (input file oculto) -->
    <button
      type="button"
      class="bk-press relative flex items-center justify-center w-18 h-18 rounded-full bg-slab border-2 font-display font-bold text-3xl text-ink overflow-hidden"
      :style="{ borderColor: auth.user?.color || 'var(--bk-accent-aurora)' }"
      :disabled="avatarBusy || undefined"
      :aria-label="t('profile.changeAvatar')"
      data-testid="profile-avatar-btn"
      @click="pickAvatar"
    >
      <img
        v-if="auth.user?.has_avatar && auth.user && !avatarError"
        :src="avatarUrl(auth.user.id, auth.user.avatar_version)"
        alt=""
        class="absolute inset-0 w-full h-full object-cover"
        data-testid="profile-avatar-img"
        @error="avatarError = true"
      />
      <template v-else>{{ initial }}</template>
    </button>
    <input
      ref="avatarInput"
      type="file"
      accept="image/jpeg,image/png,image/webp"
      class="hidden"
      data-testid="profile-avatar-input"
      @change="onAvatarPicked"
    />
    <!-- solo en Cuenta: el hub queda limpio (el avatar ya es el botón) -->
    <div v-if="props.removable" class="flex items-center gap-4">
      <button
        type="button"
        class="bk-press text-sm text-aurora underline decoration-dotted"
        :disabled="avatarBusy || undefined"
        data-testid="profile-avatar-change"
        @click="pickAvatar"
      >
        {{ t('profile.changeAvatar') }}
      </button>
      <button
        v-if="auth.user?.has_avatar"
        type="button"
        class="bk-press text-sm text-ink-faint underline decoration-dotted"
        :disabled="avatarBusy || undefined"
        data-testid="profile-avatar-remove"
        @click="removeAvatar"
      >
        {{ t('profile.removeAvatar') }}
      </button>
    </div>
  </div>
</template>

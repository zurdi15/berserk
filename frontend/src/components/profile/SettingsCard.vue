<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'

import { updateSettings } from '@/api/auth'
import { toastApiError } from '@/utils/apiErrors'
import { applyLocale } from '@/i18n'
import BkButton from '@/lib/BkButton.vue'
import BkCard from '@/lib/BkCard.vue'
import BkSelect from '@/lib/BkSelect.vue'
import { useAuthStore } from '@/stores/auth'
import { useToastStore } from '@/stores/toast'
import { checkNativeShellUpdate, getWearStatus, isNativeShell, openNativeShellDownload, type WearStatus } from '@/utils/nativeShell'
import { setTheme } from '@/utils/theme'
// v0.14.2 (zurdi: "pon en algún sitio la versión actual"): la versión del
// bundle desplegado — verdad de build (package.json en el momento de
// compilar), la misma que ve el shell Android porque carga este bundle del
// servidor. Con el sufijo · app se distingue shell de navegador.
import { version as appVersion } from '../../../package.json'
import { getThemeMode, type ThemeMode } from '@/utils/uiPrefs'

// v0.27.0 (zurdi: "el tema del perfil y los ajustes está descolocado"): esta
// tarjeta se queda SOLO con lo que es la web app —tema, idioma, unidades,
// zona horaria, versión desplegada/actualización del shell—. El color de
// usuario y la contraseña se mudaron a la sección Cuenta (AccountCard), que
// es donde vive la identidad.
const { t } = useI18n()
const auth = useAuthStore()
const toast = useToastStore()

const locale = ref(auth.user!.locale)
const units = ref(auth.user!.units)
const timezone = ref(auth.user!.timezone)
const timezones = Intl.supportedValuesOf('timeZone')
// v0.4.0: preferencia de tema — puramente de cliente (localStorage vía
// uiPrefs), NO pasa por updateSettings/el backend, a diferencia de todo lo
// demás en esta tarjeta (ver el why-comment en utils/uiPrefs.ts)
const theme = ref<ThemeMode>(getThemeMode())

// v0.16.0 (zurdi: "que la apk te avise o lo que sea para actualizarse"): si
// el shell instalado va por detrás del bundle, aquí vive la descarga (el
// toast del boot en ShellView solo apunta a esta tarjeta)
const shellUpdateAvailable = ref(false)
// v0.28.0 reloj (zurdi): si el móvil ve un Galaxy Watch y si ese reloj tiene
// la app de berserk — la primera pregunta de cualquier "no me sale el
// cronómetro en el reloj". Solo en la shell; en web no existe el puente.
const wearStatus = ref<WearStatus | null>(null)
const wearStatusLabel = computed(() => {
  const status = wearStatus.value
  if (!status || !status.playServices) return null
  if (status.appInstalled) return t('profile.wear.linked', { name: status.watchName ?? 'Wear OS' })
  if (status.connected) return t('profile.wear.appMissing')
  return t('profile.wear.none')
})
onMounted(() => {
  void checkNativeShellUpdate(appVersion).then(({ available }) => {
    shellUpdateAvailable.value = available
  })
  if (isNativeShell()) {
    void getWearStatus().then((status) => {
      wearStatus.value = status
    })
  }
})

function downloadShellUpdate() {
  void openNativeShellDownload(appVersion)
}

async function save(partial: Parameters<typeof updateSettings>[0]) {
  try {
    // aplicar locale al instante para feedback inmediato; la persistencia viene después
    if (partial.locale) applyLocale(partial.locale)
    auth.user = await updateSettings(partial)
    toast.push('info', t('common.saved'))
  } catch (error) {
    toastApiError(error)
  }
}

function pickTheme(mode: ThemeMode) {
  theme.value = mode
  setTheme(mode)
}
</script>

<template>
  <!-- v0.27.0: sin título propio — la sección ya se titula "Ajustes" en la
       fila de vuelta, y repetirlo dentro solo añadía ruido -->
  <BkCard>
    <div class="space-y-4">
      <BkSelect
        v-model="theme"
        :label="$t('profile.theme')"
        :options="[
          { value: 'system', label: $t('profile.themeSystem') },
          { value: 'dark', label: $t('profile.themeDark') },
          { value: 'light', label: $t('profile.themeLight') },
        ]"
        data-testid="theme-select"
        @update:model-value="(val) => pickTheme(val as ThemeMode)"
      />

      <BkSelect
        v-model="locale"
        :label="$t('profile.locale')"
        :options="[
          { value: 'es', label: 'Español' },
          { value: 'en', label: 'English' },
        ]"
        data-testid="locale-select"
        @update:model-value="(val) => save({ locale: val as 'es' | 'en' })"
      />

      <BkSelect
        v-model="units"
        :label="$t('profile.units')"
        :options="[
          { value: 'kg', label: 'kg' },
          { value: 'lb', label: 'lb' },
        ]"
        data-testid="units-select"
        @update:model-value="(val) => save({ units: val as 'kg' | 'lb' })"
      />

      <BkSelect
        v-model="timezone"
        :label="$t('profile.timezone')"
        :options="timezones.map(tz => ({ value: tz, label: tz }))"
        data-testid="timezone-select"
        @update:model-value="(val) => save({ timezone: val })"
      />

      <!-- v0.14.2: versión desplegada, visible para poder verificar que la
           PWA/shell ya corre el último bundle -->
      <p class="bk-metric text-2xs text-ink-faint text-center pt-2" data-testid="app-version">
        berserk v{{ appVersion }}<template v-if="isNativeShell()"> · app</template>
      </p>
      <!-- v0.28.0 reloj: estado del enlace con el Galaxy Watch (solo shell) -->
      <p v-if="wearStatusLabel" class="text-2xs text-ink-faint text-center" data-testid="wear-status">
        {{ wearStatusLabel }}
      </p>
      <!-- v0.16.0: APK instalada más vieja que el bundle → descarga directa
           de la release (el asset se llama berserk-vX.Y.Z.apk) -->
      <BkButton
        v-if="shellUpdateAvailable"
        variant="ghost"
        size="sm"
        block
        data-testid="shell-update-btn"
        @click="downloadShellUpdate"
      >
        {{ t('profile.updateShell', { version: appVersion }) }}
      </BkButton>
    </div>
  </BkCard>
</template>

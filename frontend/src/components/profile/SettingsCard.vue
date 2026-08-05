<script setup lang="ts">
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'

import { updateSettings } from '@/api/auth'
import { toastApiError } from '@/utils/apiErrors'
import { applyLocale } from '@/i18n'
import BkCard from '@/lib/BkCard.vue'
import BkSelect from '@/lib/BkSelect.vue'
import { useAuthStore } from '@/stores/auth'
import { useToastStore } from '@/stores/toast'

const { t } = useI18n()
const auth = useAuthStore()
const toast = useToastStore()

const locale = ref(auth.user!.locale)
const units = ref(auth.user!.units)
const timezone = ref(auth.user!.timezone)
const timezones = Intl.supportedValuesOf('timeZone')

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
</script>

<template>
  <BkCard :title="$t('profile.settings')">
    <div class="space-y-4">
      <BkSelect
        v-model="locale"
        :label="$t('profile.locale')"
        :options="[
          { value: 'es', label: 'Español' },
          { value: 'en', label: 'English' },
        ]"
        data-testid="locale-select"
        @update:model-value="(val) => save({ locale: val })"
      />

      <BkSelect
        v-model="units"
        :label="$t('profile.units')"
        :options="[
          { value: 'kg', label: 'kg' },
          { value: 'lb', label: 'lb' },
        ]"
        data-testid="units-select"
        @update:model-value="(val) => save({ units: val })"
      />

      <BkSelect
        v-model="timezone"
        :label="$t('profile.timezone')"
        :options="timezones.map(tz => ({ value: tz, label: tz }))"
        data-testid="timezone-select"
        @update:model-value="(val) => save({ timezone: val })"
      />
    </div>
  </BkCard>
</template>

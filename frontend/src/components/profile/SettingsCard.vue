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
    auth.user = await updateSettings(partial)
    if (partial.locale) applyLocale(partial.locale)
    toast.push('info', t('common.saved'))
  } catch (error) {
    toastApiError(error)
  }
}
</script>

<template>
  <BkCard :title="$t('profile.settings')">
    <div class="space-y-4">
      <div>
        <label class="block text-sm font-medium mb-2">{{ $t('profile.locale') }}</label>
        <BkSelect
          v-model="locale"
          :options="[
            { value: 'es', label: 'Español' },
            { value: 'en', label: 'English' },
          ]"
          data-testid="locale-select"
          @update:model-value="(val) => save({ locale: val })"
        />
      </div>

      <div>
        <label class="block text-sm font-medium mb-2">{{ $t('profile.units') }}</label>
        <BkSelect
          v-model="units"
          :options="[
            { value: 'kg', label: 'kg' },
            { value: 'lb', label: 'lb' },
          ]"
          data-testid="units-select"
          @update:model-value="(val) => save({ units: val })"
        />
      </div>

      <div>
        <label class="block text-sm font-medium mb-2">{{ $t('profile.timezone') }}</label>
        <BkSelect
          v-model="timezone"
          :options="timezones.map(tz => ({ value: tz, label: tz }))"
          data-testid="timezone-select"
          @update:model-value="(val) => save({ timezone: val })"
        />
      </div>
    </div>
  </BkCard>
</template>

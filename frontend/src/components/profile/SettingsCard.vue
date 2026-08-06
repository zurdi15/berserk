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
import { USER_COLOR_SWATCHES } from '@/tokens/userColors'

const { t } = useI18n()
const auth = useAuthStore()
const toast = useToastStore()

const locale = ref(auth.user!.locale)
const units = ref(auth.user!.units)
const timezone = ref(auth.user!.timezone)
const timezones = Intl.supportedValuesOf('timeZone')
// null = sin color propio, cae al aurora del tema (ver USER_COLOR_SWATCHES)
const color = ref<string | null>(auth.user!.color ?? null)

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

function pickColor(value: string | null) {
  color.value = value
  save({ color: value })
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

      <div class="space-y-2">
        <span class="block text-sm text-ink-muted">{{ $t('profile.color') }}</span>
        <div class="flex items-center gap-3 flex-wrap">
          <button
            type="button"
            class="w-9 h-9 rounded-full border-2 bg-aurora transition-transform hover:scale-105"
            :class="color === null ? 'border-aurora' : 'border-line'"
            :aria-pressed="color === null"
            :aria-label="$t('profile.colorDefault')"
            data-testid="color-swatch-default"
            @click="pickColor(null)"
          />
          <button
            v-for="swatch in USER_COLOR_SWATCHES"
            :key="swatch"
            type="button"
            class="w-9 h-9 rounded-full border-2 transition-transform hover:scale-105"
            :class="color === swatch ? 'border-aurora' : 'border-line'"
            :style="{ backgroundColor: swatch }"
            :aria-pressed="color === swatch"
            :aria-label="swatch"
            data-testid="color-swatch"
            @click="pickColor(swatch)"
          />
        </div>
      </div>
    </div>
  </BkCard>
</template>

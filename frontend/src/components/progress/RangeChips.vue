<script setup lang="ts">
import { useI18n } from 'vue-i18n'

import type { RangeKey } from './series'

// v0.24.0 (zurdi: "rango temporal en las gráficas"): chips 3M/6M/1A/Todo —
// compartidos por el panel de Entrenos y la vista detalle por ejercicio.
// v-model plano: el filtrado real vive en series.ts::filterRange, este
// componente solo elige la clave.
defineProps<{ modelValue: RangeKey }>()
const emit = defineEmits<{ 'update:modelValue': [value: RangeKey] }>()

const { t } = useI18n()

const RANGES: RangeKey[] = ['3m', '6m', '1y', 'all']
</script>

<template>
  <div class="flex items-center gap-1.5" role="group" :aria-label="t('progress.range.label')">
    <button
      v-for="key in RANGES"
      :key="key"
      type="button"
      class="bk-press px-2.5 py-1 rounded-full border text-xs transition-colors"
      :class="modelValue === key ? 'border-aurora text-aurora bg-aurora/10' : 'border-line text-ink-muted'"
      :aria-pressed="modelValue === key ? 'true' : 'false'"
      :data-testid="`chart-range-${key}`"
      @click="emit('update:modelValue', key)"
    >
      {{ t(`progress.range.${key}`) }}
    </button>
  </div>
</template>

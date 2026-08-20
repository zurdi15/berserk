<script setup lang="ts">
// item (v0.4.0): extraído del picker de color inline de SettingsCard.vue
// (perfil propio) para reutilizarlo en AdminCard.vue (editar a OTRO
// usuario) sin duplicar el marcado.
// v0.27.0: la copia inline murió por fin — el color de usuario se mudó de
// SettingsCard a AccountCard (sección Cuenta) y allí usa este componente,
// así que ya no hay dos marcados que mantener en paralelo.
import { useI18n } from 'vue-i18n'
import { USER_COLOR_SWATCHES } from '@/tokens/userColors'

// null = sin color propio, cae al aurora del tema — mismo contrato que
// UserOut.color/SettingsIn.color en el backend
defineProps<{ modelValue: string | null; label?: string }>()
const emit = defineEmits<{ 'update:modelValue': [value: string | null] }>()

const { t } = useI18n()
</script>

<template>
  <div class="space-y-2">
    <span v-if="label" class="block text-sm text-ink-muted">{{ label }}</span>
    <div class="flex items-center gap-3 flex-wrap">
      <button
        type="button"
        class="w-9 h-9 rounded-full border-2 bg-aurora transition-transform hover:scale-105"
        :class="modelValue === null ? 'border-aurora' : 'border-line'"
        :aria-pressed="modelValue === null"
        :aria-label="t('profile.colorDefault')"
        data-testid="color-swatch-default"
        @click="emit('update:modelValue', null)"
      />
      <button
        v-for="swatch in USER_COLOR_SWATCHES"
        :key="swatch"
        type="button"
        class="w-9 h-9 rounded-full border-2 transition-transform hover:scale-105"
        :class="modelValue === swatch ? 'border-aurora' : 'border-line'"
        :style="{ backgroundColor: swatch }"
        :aria-pressed="modelValue === swatch"
        :aria-label="swatch"
        data-testid="color-swatch"
        @click="emit('update:modelValue', swatch)"
      />
    </div>
  </div>
</template>

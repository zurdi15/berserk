<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'

import type { MuscleGroupOut } from '@/api/domain'
import BkSelect from '@/lib/BkSelect.vue'

// v0.11.0 (zurdi: "ese selector debería ser un componente"): el filtro de
// grupo muscular que vivía duplicado en la biblioteca, el sheet de añadir
// ejercicio y el picker de progresión — un único componente, mismos rótulos
// y misma opción "todos" en todas las superficies. El valor es el id del
// grupo como string ('' = todos), igual que siempre.
const props = defineProps<{ modelValue: string; muscleGroups: MuscleGroupOut[] }>()
const emit = defineEmits<{ 'update:modelValue': [value: string] }>()

const { t, locale } = useI18n()

const options = computed(() => [
  { value: '', label: t('library.allGroups') },
  ...props.muscleGroups.map((g) => ({
    value: String(g.id),
    label: locale.value === 'en' ? g.name_en : g.name_es,
  })),
])
</script>

<template>
  <BkSelect
    :model-value="modelValue"
    :label="t('library.muscleGroups')"
    :options="options"
    data-testid="group-filter-select"
    @update:model-value="emit('update:modelValue', $event)"
  />
</template>

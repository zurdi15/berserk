<script setup lang="ts">
withDefaults(
  defineProps<{
    label: string
    modelValue: string
    type?: string
    error?: string
    hint?: string
    mono?: boolean
    autocomplete?: string
  }>(),
  { type: 'text' },
)
defineEmits<{ 'update:modelValue': [value: string] }>()
</script>

<template>
  <label class="block">
    <span class="block mb-1 text-sm text-ink-muted">{{ label }}</span>
    <input
      :value="modelValue"
      :type="type"
      :autocomplete="autocomplete"
      :aria-invalid="error ? 'true' : undefined"
      class="w-full rounded-sm border bg-stone px-3 py-2.5 text-ink placeholder:text-ink-faint focus:border-aurora"
      :class="[error ? 'border-danger' : 'border-line', mono && 'bk-metric']"
      @input="$emit('update:modelValue', ($event.target as HTMLInputElement).value)"
    />
    <span v-if="error" class="block mt-1 text-sm text-danger">{{ error }}</span>
    <span v-else-if="hint" class="block mt-1 text-sm text-ink-faint">{{ hint }}</span>
  </label>
</template>

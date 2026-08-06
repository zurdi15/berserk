<script setup lang="ts">
defineProps<{
  label: string
  modelValue: string
  options: { value: string; label: string; disabled?: boolean }[]
}>()
defineEmits<{ 'update:modelValue': [value: string] }>()
</script>

<template>
  <label class="block">
    <span class="block mb-1 text-sm text-ink-muted">{{ label }}</span>
    <select
      :value="modelValue"
      class="w-full rounded-sm border border-line bg-stone px-3 py-2.5 text-ink focus:border-aurora"
      @input="$emit('update:modelValue', ($event.target as HTMLSelectElement).value)"
    >
      <option v-for="opt in options" :key="opt.value" :value="opt.value" :disabled="opt.disabled">
        {{ opt.label }}
      </option>
    </select>
  </label>
</template>

<script setup lang="ts">
const props = defineProps<{ modelValue: string; tabs: { value: string; label: string }[] }>()
const emit = defineEmits<{ 'update:modelValue': [value: string] }>()

function move(delta: number) {
  const index = props.tabs.findIndex((t) => t.value === props.modelValue)
  const next = props.tabs[(index + delta + props.tabs.length) % props.tabs.length]
  emit('update:modelValue', next.value)
}
</script>

<template>
  <div
    role="tablist"
    class="flex gap-1 border-b border-line overflow-x-auto no-scrollbar"
    tabindex="0"
    @keydown.arrow-right.prevent="move(1)"
    @keydown.arrow-left.prevent="move(-1)"
  >
    <button
      v-for="tab in tabs"
      :key="tab.value"
      role="tab"
      type="button"
      :aria-selected="tab.value === modelValue ? 'true' : 'false'"
      class="bk-press px-4 py-2 font-display uppercase tracking-wide text-sm border-b-2 -mb-px shrink-0 whitespace-nowrap"
      :class="tab.value === modelValue
        ? 'text-aurora border-aurora'
        : 'text-ink-faint border-transparent hover:text-ink'"
      @click="$emit('update:modelValue', tab.value)"
    >
      {{ tab.label }}
    </button>
  </div>
</template>

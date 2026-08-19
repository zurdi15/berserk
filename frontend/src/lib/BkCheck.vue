<script setup lang="ts">
// facelift (player): el check grande y satisfactorio de "serie hecha" — el
// gesto central del rediseño. Es un <button role=checkbox> propio, NUNCA un
// checkbox nativo (noNativeFormControls.spec veta los controles nativos en
// toda la app). Al marcar, el contenedor hace el pop de muelle
// (bk-check-pop) y el tick se DIBUJA con el carve corto (bk-check-stroke,
// ver animations.css) — la runa y el tick comparten el mismo gesto de
// tallado. El tick se monta solo cuando está marcado: montar = animar.
withDefaults(
  defineProps<{ modelValue: boolean; size?: 'md' | 'lg'; disabled?: boolean }>(),
  { size: 'md', disabled: false },
)
const emit = defineEmits<{ 'update:modelValue': [value: boolean] }>()
</script>

<template>
  <button
    type="button"
    role="checkbox"
    :aria-checked="modelValue ? 'true' : 'false'"
    :disabled="disabled || undefined"
    class="bk-press inline-flex items-center justify-center rounded-md border-2 transition-colors shrink-0 disabled:opacity-50"
    :class="[
      size === 'md' ? 'w-7 h-7' : 'w-9 h-9',
      modelValue
        ? 'bg-aurora-deep border-aurora text-void shadow-(--bk-shadow-aurora) bk-check-pop'
        : 'bg-transparent border-line-strong text-transparent hover:border-aurora',
    ]"
    @click="!disabled && emit('update:modelValue', !modelValue)"
  >
    <svg
      v-if="modelValue"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="3"
      stroke-linecap="round"
      stroke-linejoin="round"
      :class="size === 'md' ? 'w-4 h-4' : 'w-5 h-5'"
      aria-hidden="true"
    >
      <path class="bk-check-stroke" d="M4 12.5l5 5L20 7" />
    </svg>
  </button>
</template>

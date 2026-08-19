<script setup lang="ts">
// facelift v4 (zurdi: "los check y radio tienen un aspecto demasiado
// genérico"): radio PROPIO, hermano de BkCheck — botón role=radio con anillo
// y punto aurora que hace pop al elegirse. Nunca un input nativo
// (noNativeFormControls); quien agrupa varias opciones gestiona la
// exclusividad (v-for + checked por comparación), esto es solo la pieza.
withDefaults(
  defineProps<{ checked: boolean; disabled?: boolean }>(),
  { disabled: false },
)
const emit = defineEmits<{ select: [] }>()
</script>

<template>
  <button
    type="button"
    role="radio"
    :aria-checked="checked ? 'true' : 'false'"
    :disabled="disabled || undefined"
    class="bk-press inline-flex items-center justify-center w-5 h-5 rounded-full border-2 transition-colors shrink-0 disabled:opacity-50"
    :class="checked ? 'border-aurora' : 'border-line-strong hover:border-aurora'"
    @click="!disabled && emit('select')"
  >
    <span v-if="checked" class="w-2.5 h-2.5 rounded-full bg-aurora bk-check-pop" aria-hidden="true" />
  </button>
</template>

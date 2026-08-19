<script setup lang="ts">
withDefaults(
  defineProps<{
    label: string
    modelValue: string
    // M4: acotado a lo que de verdad se usa (ver noNativeFormControls.spec.ts)
    // — date/time ya no viven aquí (BkDateField/BkTimeField los sustituyen)
    type?: 'text' | 'password' | 'number'
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
  <!-- item 2 (round 9): la etiqueta ya no vive arriba como texto visible —
       zurdi la quiere DENTRO del campo, como placeholder. El nombre
       accesible no puede depender solo del placeholder (desaparece al
       escribir, y algunos lectores de pantalla no lo anuncian como label),
       así que label también alimenta aria-label directamente. Root pasa de
       <label> a <div>: sin texto visible que envolver, un <label> vacío
       solo compite con aria-label en el cálculo del nombre accesible. -->
  <div>
    <input
      :value="modelValue"
      :type="type"
      :placeholder="label"
      :aria-label="label"
      :autocomplete="autocomplete"
      :aria-invalid="error ? 'true' : undefined"
      class="bk-form-control w-full rounded-sm border bg-stone px-3 py-3 text-ink placeholder:text-ink-faint focus:border-aurora"
      :class="[error ? 'border-danger' : 'border-line', mono && 'bk-metric']"
      @input="$emit('update:modelValue', ($event.target as HTMLInputElement).value)"
    />
    <span v-if="error" class="block mt-1 text-sm text-danger">{{ error }}</span>
    <span v-else-if="hint" class="block mt-1 text-sm text-ink-faint">{{ hint }}</span>
  </div>
</template>

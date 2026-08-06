<script setup lang="ts">
// item 14: pieza compartida MÍNIMA (no se toca RoutineEditorSheet.vue, que
// tiene su propio picker para rutinas) usada TAL CUAL en el drawer de crear
// Y en el sheet de editar de MuscleGroupManager — misma marca, misma UX en
// los dos sitios, en vez de mantener dos copias del mismo grid de botones.
import BkRune from '@/lib/BkRune.vue'
import { FUTHARK_RUNE_NAMES, type RuneName } from '@/lib/runes'

// grupo "canónico" (los 7 de siempre) + futhark completo — SIN berserk (esa
// es el bindrune del clan/rutinas, no de un grupo muscular) ni streak/pr
// (runas de propósito específico, ver runes.ts): asignación libre dentro de
// este subconjunto, no libre de verdad, para no ofrecer runas que ya
// significan otra cosa en el resto de la app
const GROUP_RUNES: RuneName[] = ['chest', 'back', 'biceps', 'triceps', 'shoulders', 'legs', 'core']
const PICKER_RUNES: RuneName[] = [...GROUP_RUNES, ...FUTHARK_RUNE_NAMES]

const props = defineProps<{ modelValue: RuneName | null }>()
const emit = defineEmits<{ 'update:modelValue': [RuneName | null] }>()

function toggle(name: RuneName) {
  // clic sobre la runa ya activa la deselecciona (vuelve a NULL, cae al
  // slug-derivada) — mismo idiom que el picker de RoutineEditorSheet
  emit('update:modelValue', props.modelValue === name ? null : name)
}
</script>

<template>
  <div class="flex gap-3 flex-wrap max-h-48 overflow-y-auto">
    <button
      v-for="runeName in PICKER_RUNES"
      :key="runeName"
      type="button"
      class="flex items-center justify-center p-3 rounded-sm border transition-all"
      :class="modelValue === runeName
        ? 'border-aurora bg-aurora/10 text-aurora'
        : 'border-line text-ink-muted hover:border-line-strong hover:text-ink'
      "
      :data-testid="`group-rune-${runeName}`"
      :aria-pressed="modelValue === runeName ? 'true' : 'false'"
      @click="toggle(runeName)"
    >
      <BkRune :name="runeName" :size="24" />
    </button>
  </div>
</template>

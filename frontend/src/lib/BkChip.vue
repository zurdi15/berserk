<script setup lang="ts">
// facelift: extrae el chip que ~10 consumidores reinventaban en línea
// (SetForm, WorkoutExerciseCard, WorkoutView, GroupRunePicker...): borde +
// texto pequeño + el trío activo `border-aurora text-aurora bg-aurora/10`.
// `active` enciende el tono (neutral activa en aurora: ese ES el trío
// histórico); un tono sin `active` pinta la versión tenue (borde al 50%),
// para chips informativos estáticos (PR ember, "Siguiente" de superserie).
// interactive=true rinde <button> con bk-press; el resto (testid, aria-*,
// @click) llega por fallthrough al elemento raíz, como en BkActionBtn.
withDefaults(
  defineProps<{
    tone?: 'neutral' | 'aurora' | 'ember' | 'danger'
    active?: boolean
    size?: 'sm' | 'md'
    interactive?: boolean
  }>(),
  { tone: 'neutral', active: false, size: 'md', interactive: false },
)

const activeTone = {
  neutral: 'border-aurora text-aurora bg-aurora/10',
  aurora: 'border-aurora text-aurora bg-aurora/10',
  ember: 'border-ember text-ember bg-ember/10',
  danger: 'border-danger text-danger bg-danger/10',
}
const idleTone = {
  neutral: 'border-line text-ink-muted',
  aurora: 'border-aurora/50 text-aurora',
  ember: 'border-ember/50 text-ember',
  danger: 'border-danger/50 text-danger',
}
</script>

<template>
  <component
    :is="interactive ? 'button' : 'span'"
    :type="interactive ? 'button' : undefined"
    class="inline-flex items-center gap-1.5 rounded-full border transition-colors whitespace-nowrap"
    :class="[
      interactive && 'bk-press',
      interactive && !active && tone === 'neutral' && 'hover:border-line-strong hover:text-ink',
      size === 'md' && 'px-2.5 py-1 text-xs',
      size === 'sm' && 'px-2 py-0.5 text-2xs',
      active ? activeTone[tone] : idleTone[tone],
    ]"
  >
    <slot />
  </component>
</template>

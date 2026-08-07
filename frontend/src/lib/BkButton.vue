<script setup lang="ts">
// v0.4.0 audit: variant 'primary' (ver :class más abajo) usaba
// `text-ink hover:bg-aurora hover:text-void` — ink es el color de TEXTO DE
// LECTURA normal (invierte de casi-blanco en oscuro a casi-negro en claro),
// no un color pensado para ir ENCIMA de un fondo de acento saturado como
// aurora-deep, que en los dos temas es un tono medio/oscuro por diseño (no
// invierte luminancia como ink/void). El resultado: 2.5:1 en oscuro y
// 2.34:1 en claro en el estado por DEFECTO — bajo el 4.5:1 de AA en los DOS
// temas, y :hover nunca dispara en touch (el 99% del uso real de este
// botón, "empezar entreno" en el móvil). El variant 'ember' ya usaba el
// patrón correcto (text-void fijo, sin cambiar en hover) — 'primary' se
// alineó a lo mismo: `text-void hover:bg-aurora`, sin hover:text-* porque el
// texto ya no necesita cambiar de color al aclarar el fondo en hover.
withDefaults(
  defineProps<{
    variant?: 'primary' | 'ghost' | 'danger' | 'ember'
    size?: 'sm' | 'md' | 'lg'
    loading?: boolean
    block?: boolean
    type?: 'button' | 'submit'
  }>(),
  { variant: 'primary', size: 'md', loading: false, block: false, type: 'button' },
)
</script>

<template>
  <button
    :type="type"
    :disabled="loading || undefined"
    :aria-busy="loading ? 'true' : undefined"
    class="bk-press inline-flex items-center justify-center gap-2 font-display font-semibold uppercase tracking-wide rounded-sm border transition-colors disabled:opacity-50"
    :class="[
      block && 'w-full',
      size === 'sm' && 'px-3 py-1.5 text-sm',
      size === 'md' && 'px-5 py-2.5',
      size === 'lg' && 'px-6 py-3.5 text-lg',
      variant === 'primary' && 'bg-aurora-deep border-aurora text-void hover:bg-aurora',
      variant === 'ghost' && 'bg-transparent border-line text-ink-muted hover:border-line-strong hover:text-ink',
      variant === 'danger' && 'bg-transparent border-danger text-danger hover:bg-danger hover:text-void',
      variant === 'ember' && 'bg-ember-deep border-ember text-void hover:bg-ember',
    ]"
  >
    <span v-if="loading" class="bk-shimmer inline-block w-4 h-4 rounded-full border-2 border-line-strong" aria-hidden="true" />
    <slot />
  </button>
</template>

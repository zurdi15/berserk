<script setup lang="ts">
// v0.4.0 audit: variant 'primary' usaba `text-ink hover:bg-aurora
// hover:text-void` — ink invierte de luminancia entre temas y encima de
// aurora-deep daba 2.5:1/2.34:1 (bajo AA) en el estado por defecto; se
// alineó al patrón de 'ember': text-void fijo, hover solo aclara el fondo.
// facelift (rediseño): el botón pasa de losa uppercase a pill en caja mixta
// (el lenguaje de la referencia). primary/ember pierden el borde (relleno
// pleno: el borde aurora sobre aurora-deep apenas se veía y ensuciaba el
// pill); ghost/danger lo conservan como su seña. Alturas fijas h-9/h-12/h-14
// en vez de paddings verticales: 'md' queda en 48px — esto REVOCA a
// sabiendas el escalón responsive de v0.4.1 (px-4/text-sm bajo sm): el
// rediseño sanciona CTAs grandes también en móvil, es el lenguaje nuevo, y
// 48px cumple de sobra el suelo de 40px de tap-target (WCAG 2.5.5/2.5.8).
// Variante 'soft' nueva: acción secundaria con relleno tenue (aurora/10),
// para cuando ghost es demasiado callado y primary demasiado dominante.
withDefaults(
  defineProps<{
    variant?: 'primary' | 'ghost' | 'danger' | 'ember' | 'soft'
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
    class="bk-press inline-flex items-center justify-center gap-2 font-display font-semibold rounded-full transition-colors disabled:opacity-50"
    :class="[
      block && 'w-full',
      size === 'sm' && 'h-9 px-4 text-sm',
      size === 'md' && 'h-12 px-6 text-base',
      size === 'lg' && 'h-14 px-8 text-lg',
      variant === 'primary' && 'bg-aurora-deep text-void hover:bg-aurora',
      variant === 'ghost' && 'bg-transparent border border-line-strong text-ink hover:border-aurora hover:text-aurora',
      variant === 'danger' && 'bg-transparent border border-danger text-danger hover:bg-danger hover:text-void',
      variant === 'ember' && 'bg-ember-deep text-void hover:bg-ember',
      variant === 'soft' && 'bg-aurora/10 text-aurora hover:bg-aurora/20',
    ]"
  >
    <span v-if="loading" class="bk-shimmer inline-block w-4 h-4 rounded-full border-2 border-line-strong" aria-hidden="true" />
    <slot />
  </button>
</template>

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
// v0.4.1: el tamaño 'md' (default — el que usan casi todos los CTA de texto:
// "nuevo X", guardar...) rendeaba en móvil a py-2.5(10px×2=20) + line-height
// de text-base implícito (1rem→1.5rem=24px, ver --text-base--line-height en
// tailwindcss/theme.css) + border(1px×2=2) = 46px de alto — más grande de lo
// necesario en pantalla chica. Un escalón real hacia abajo en la escala de
// Tailwind, SOLO bajo el breakpoint sm: px-5→px-4 y text-base→text-sm
// (0.875rem/1.25rem). py-2.5 NO baja a py-2 aposta: con text-sm (line-height
// 20px) el suelo de 40px de tap-target (WCAG 2.5.5/2.5.8) es
// py-2.5(20)+line-height(20)=40px exacto — py-2(16)+20=36 lo rompe. Con
// border: 42px de alto real en móvil, por encima del mínimo. `sm:` recupera
// exactamente los valores previos (46px), sin cambios en desktop. 'sm'/'lg'
// explícitos no se tocan (ya son responsabilidad de quien los pide).
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
      size === 'md' && 'px-4 py-2.5 text-sm sm:px-5 sm:text-base',
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

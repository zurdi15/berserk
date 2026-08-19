<script setup lang="ts">
import type { ExerciseOut } from '@/api/domain'
import BkMedia from './BkMedia.vue'
import type { RuneName } from './runes'

// facelift: hero con media de fondo + scrim degradado + contenido encima.
// v2 (feedback de zurdi): el contenido vive EN FLUJO (justify-end sobre un
// min-h), no en un absolute anclado abajo — con contenido más alto que el
// hero, el absolute desbordaba por ARRIBA y el overflow-hidden se comía el
// eyebrow ("la tag de hoy toca se corta"). Además la runa animada del
// fallback creaba stacking context al tallarse y pintaba POR ENCIMA del
// texto: media y contenido llevan ahora z explícitos, y el contenido añade
// .bk-hero-content (sombra de texto, ver base.css) para leerse sobre
// cualquier foto. El degradado usa el token scrim — SIEMPRE oscuro en los
// dos temas (ver tokens/index.ts::scrim), justo lo que pide texto claro
// sobre una imagen.
// `flush`: sin radio propio, para heros a sangre (-mx-4 -mt-4 en la vista) —
// una prop y no una clase del consumidor porque dos utilidades rounded-* en
// el mismo nodo compiten por orden de hoja, no de template.
withDefaults(
  defineProps<{
    exercise?: Pick<ExerciseOut, 'id' | 'has_image'> | null
    src?: string
    rune?: RuneName | null
    flush?: boolean
  }>(),
  { flush: false },
)
</script>

<template>
  <div
    class="relative overflow-hidden flex flex-col justify-end min-h-64"
    :class="!flush && 'rounded-xl'"
  >
    <div class="absolute inset-0 z-0" aria-hidden="true">
      <BkMedia :exercise="exercise" :src="src" :rune="rune" size="fill" glow />
    </div>
    <div class="absolute inset-0 z-0 bg-gradient-to-t from-scrim via-scrim/40 to-transparent" aria-hidden="true" />
    <div v-if="$slots.corner" class="absolute inset-x-4 top-4 z-10 flex items-start justify-between gap-2">
      <slot name="corner" />
    </div>
    <div class="relative z-10 p-5 pt-16 bk-hero-content">
      <slot />
    </div>
  </div>
</template>

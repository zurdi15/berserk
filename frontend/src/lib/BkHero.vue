<script setup lang="ts">
import type { ExerciseOut } from '@/api/domain'
import BkMedia from './BkMedia.vue'
import type { RuneName } from './runes'

// facelift: hero con media de fondo + scrim degradado + contenido superpuesto
// abajo (el patrón de la referencia). El degradado usa el token scrim —
// SIEMPRE oscuro en los dos temas (ver tokens/index.ts::scrim), que es
// exactamente lo que necesita texto claro encima de una foto. Sin foto, el
// fallback rúnico de BkMedia con glow hace de protagonista.
// `flush`: sin radio propio, para heros a sangre (-mx-4 -mt-4 en la vista) —
// una prop y no una clase del consumidor porque dos utilidades rounded-* en
// el mismo nodo compiten por orden de hoja, no de template.
withDefaults(
  defineProps<{
    exercise?: Pick<ExerciseOut, 'id' | 'has_image'> | null
    src?: string
    rune?: RuneName | null
    ratio?: 'video' | 'square'
    flush?: boolean
  }>(),
  { ratio: 'video', flush: false },
)
</script>

<template>
  <div
    class="relative overflow-hidden"
    :class="[ratio === 'video' ? 'aspect-video' : 'aspect-square', !flush && 'rounded-xl']"
  >
    <div class="absolute inset-0">
      <BkMedia :exercise="exercise" :src="src" :rune="rune" size="fill" glow />
    </div>
    <div class="absolute inset-0 bg-gradient-to-t from-scrim to-transparent" aria-hidden="true" />
    <div v-if="$slots.corner" class="absolute inset-x-4 top-4 flex items-start justify-between gap-2">
      <slot name="corner" />
    </div>
    <div class="absolute inset-x-0 bottom-0 p-5">
      <slot />
    </div>
  </div>
</template>

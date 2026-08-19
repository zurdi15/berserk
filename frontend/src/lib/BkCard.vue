<script setup lang="ts">
// facelift: el título pasa de la receta uppercase text-sm al .bk-title en
// caja mixta, con un eyebrow opcional encima (la voz nórdica en mayúsculas
// sobrevive ahí como kicker). padding 'none' + overflow-hidden es para cards
// con media a sangre (hero, thumbs grandes): la imagen llega al borde y el
// radio de la losa la recorta.
withDefaults(
  defineProps<{ title?: string; eyebrow?: string; padding?: 'md' | 'lg' | 'none' }>(),
  { padding: 'md' },
)
</script>

<template>
  <section
    class="bk-slab"
    :class="[
      padding === 'md' && 'p-5',
      padding === 'lg' && 'p-6',
      padding === 'none' && 'overflow-hidden',
    ]"
  >
    <header v-if="title || eyebrow || $slots.header" class="mb-4 flex items-center justify-between gap-2">
      <div v-if="title || eyebrow" class="min-w-0">
        <p v-if="eyebrow" class="bk-eyebrow">{{ eyebrow }}</p>
        <h2 v-if="title" class="bk-title text-ink truncate">{{ title }}</h2>
      </div>
      <slot name="header" />
    </header>
    <slot />
  </section>
</template>

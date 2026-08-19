<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'

import type { DistributionItem, MuscleGroupOut } from '@/api/domain'
// v0.24.4 (zurdi: "que el cuerpo humano sea realista, lo más posible"): el
// arte anatómico del proyecto wger (wger.de, CC-BY-SA — ver atribución en el
// README), vendorizado en assets/bodymap con viewBox añadido para que
// escale. La base es el sistema muscular en grises; cada grupo entrenado
// enciende su(s) músculo(s) como capa superpuesta pintada en aurora
// (currentColor, ver imports) con opacidad proporcional al volumen
// relativo de la ventana.
import backUrl from '@/assets/bodymap/back.svg'
import frontUrl from '@/assets/bodymap/front.svg'
// capas INLINE (?raw) con fill:currentColor — pintan text-aurora EXACTO y
// siguen al tema; un hue-rotate sobre el rojo original derivaba a verde
// (la matriz de hue-rotate de CSS no es una rotación HSL real)
import m1 from '@/assets/bodymap/muscle-1.svg?raw'
import m2 from '@/assets/bodymap/muscle-2.svg?raw'
import m4 from '@/assets/bodymap/muscle-4.svg?raw'
import m5 from '@/assets/bodymap/muscle-5.svg?raw'
import m6 from '@/assets/bodymap/muscle-6.svg?raw'
import m7 from '@/assets/bodymap/muscle-7.svg?raw'
import m8 from '@/assets/bodymap/muscle-8.svg?raw'
import m9 from '@/assets/bodymap/muscle-9.svg?raw'
import m10 from '@/assets/bodymap/muscle-10.svg?raw'
import m11 from '@/assets/bodymap/muscle-11.svg?raw'
import m12 from '@/assets/bodymap/muscle-12.svg?raw'
import m14 from '@/assets/bodymap/muscle-14.svg?raw'

const props = withDefaults(
  defineProps<{ items: DistributionItem[]; groups: MuscleGroupOut[] }>(),
  { items: () => [], groups: () => [] },
)

const { t, locale } = useI18n()

// slug del catálogo → músculos wger de cada figura. Un grupo de usuario sin
// mapeo simplemente no enciende nada — las barras de debajo siguen siendo el
// listado completo.
const FRONT_OVERLAYS: { slug: string; src: string }[] = [
  { slug: 'chest', src: m4 },
  { slug: 'shoulders', src: m2 },
  { slug: 'biceps', src: m1 },
  { slug: 'core', src: m6 },
  { slug: 'core', src: m14 },
  { slug: 'legs', src: m10 },
]
const BACK_OVERLAYS: { slug: string; src: string }[] = [
  { slug: 'back', src: m9 },
  { slug: 'back', src: m12 },
  { slug: 'triceps', src: m5 },
  { slug: 'legs', src: m11 },
  { slug: 'legs', src: m8 },
  { slug: 'legs', src: m7 },
]

const setsBySlug = computed(() => {
  const groupSlugById = new Map(props.groups.map((g) => [g.id, g.slug]))
  const map = new Map<string, number>()
  for (const item of props.items) {
    const slug = groupSlugById.get(item.muscle_group_id)
    if (slug) map.set(slug, (map.get(slug) ?? 0) + item.sets)
  }
  return map
})

const maxSets = computed(() => Math.max(1, ...setsBySlug.value.values()))

// sin series el músculo queda en el gris de la base; con series enciende
// proporcional al máximo, con un suelo visible
function intensity(slug: string): number {
  const sets = setsBySlug.value.get(slug) ?? 0
  if (sets === 0) return 0
  return 0.3 + 0.7 * (sets / maxSets.value)
}

function label(slug: string): string {
  const group = props.groups.find((g) => g.slug === slug)
  if (!group) return slug
  const name = locale.value === 'en' ? group.name_en : group.name_es
  const sets = setsBySlug.value.get(slug) ?? 0
  return `${name} · ${t('today.bodyMapSets', { n: sets }, sets)}`
}
</script>

<template>
  <div class="flex justify-center gap-4" data-testid="body-map" role="img" :aria-label="t('today.bodyMap')">
    <figure
      v-for="figure in [
        { key: 'front', base: frontUrl, overlays: FRONT_OVERLAYS, caption: t('today.bodyMapFront') },
        { key: 'back', base: backUrl, overlays: BACK_OVERLAYS, caption: t('today.bodyMapBack') },
      ]"
      :key="figure.key"
      class="m-0 w-full max-w-36"
    >
      <!-- capas a ancho completo ancladas ARRIBA: todos los svg comparten
           width=200 y coordenadas, así que el mismo factor de escala las
           mantiene alineadas aunque sus alturas de lienzo difieran unos px -->
      <div class="relative w-full aspect-[200/369] overflow-hidden">
        <img :src="figure.base" alt="" class="absolute inset-x-0 top-0 w-full" aria-hidden="true" />
        <!-- svg estático vendorizado (nunca input de usuario): v-html es
             seguro aquí y necesario para que currentColor herede text-aurora -->
        <span
          v-for="(overlay, i) in figure.overlays"
          :key="`${overlay.slug}-${i}`"
          aria-hidden="true"
          class="bk-bodymap-overlay absolute inset-x-0 top-0 text-aurora"
          :style="{ opacity: intensity(overlay.slug) }"
          :title="label(overlay.slug)"
          :data-testid="`body-map-${overlay.slug}`"
          v-html="overlay.src"
        />
      </div>
      <figcaption class="mt-1 text-center text-2xs text-ink-faint">{{ figure.caption }}</figcaption>
    </figure>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'

import { exerciseImageUrl, type ExerciseOut } from '@/api/domain'
import { imageFramingStyle } from '@/utils/imageFraming'
import BkRune from './BkRune.vue'
import type { RuneName } from './runes'

// facelift ("fotos protagonistas"): la pieza de media única de la app. Un
// ejercicio tiene como MUCHO una foto (has_image + exerciseImageUrl, sin
// variantes de tamaño ni vídeo) — esta primitiva la pinta con object-cover
// y, cuando no hay foto (o el <img> falla: has_image rancio en caché), cae
// al pozo rúnico: runa del grupo muscular sobre slab. `src` explícito gana
// sobre `exercise` (fotos corporales u otras fuentes). `rune` acepta null a
// propósito: primaryRune() devuelve null si el grupo no mapea, y aquí eso
// significa "usa el bindrune de la casa", no "sin runa".
// fill: el padre es dueño del aspect-ratio y del recorte (hero, celdas).
const props = withDefaults(
  defineProps<{
    // v0.21.4: el pick incluye el encuadre — los llamadores pasan el
    // ExerciseOut entero y el estilo WYSIWYG sale gratis (ver imageFraming)
    exercise?: Pick<ExerciseOut, 'id' | 'has_image' | 'image_pos_x' | 'image_pos_y' | 'image_zoom'> | null
    src?: string
    cacheBust?: string | number
    rune?: RuneName | null
    size?: 'xs' | 'sm' | 'md' | 'lg' | 'tallSm' | 'tall' | 'fill'
    alt?: string
    glow?: boolean
  }>(),
  { size: 'md', alt: '', glow: false },
)

const errored = ref(false)

const url = computed(() => {
  if (props.src) return props.src
  if (props.exercise?.has_image) {
    return exerciseImageUrl(props.exercise.id, typeof props.cacheBust === 'string' ? Number(props.cacheBust) : props.cacheBust)
  }
  return null
})

// si cambia la fuente (otro ejercicio en la misma celda reciclada), el error
// anterior no debe condenar a la nueva imagen al fallback
watch(url, () => {
  errored.value = false
})

const showImage = computed(() => url.value !== null && !errored.value)
const runeName = computed<RuneName>(() => props.rune ?? 'berserk')

// v0.21.4: encuadre WYSIWYG — solo aplica a fotos de EJERCICIO (src suelto
// = fotos corporales/rutina, sin encuadre por ahora)
const framing = computed(() => (props.src ? {} : imageFramingStyle(props.exercise)))

// facelift v4 (zurdi: "las fotos de ejercicios son verticales, 9:16"):
// tamaños VERTICALES para las superficies donde la foto es protagonista —
// tallSm en listados (biblioteca, pre-inicio), tall junto a las series del
// player. aspect-[9/16] es un valor arbitrario SIN unidad px/rem/em: fuera
// del veto del guard, y el ratio es un dato del dominio (las fotos reales),
// no un capricho de espaciado.
const sizeClasses = {
  xs: 'w-9 h-9 rounded-sm',
  sm: 'w-12 h-12 rounded-sm',
  md: 'w-16 h-16 rounded-md',
  lg: 'w-24 h-24 rounded-md',
  tallSm: 'w-16 aspect-[9/16] rounded-md',
  tall: 'w-24 aspect-[9/16] rounded-md',
  fill: 'w-full h-full',
}
const runeSizes = { xs: 18, sm: 22, md: 28, lg: 40, tallSm: 30, tall: 40, fill: 64 }
</script>

<template>
  <div class="shrink-0 overflow-hidden" :class="sizeClasses[size]">
    <img
      v-if="showImage"
      :src="url!"
      :alt="alt"
      class="w-full h-full object-cover"
      :style="framing"
      loading="lazy"
      decoding="async"
      @error="errored = true"
    />
    <div v-else class="w-full h-full bg-slab flex items-center justify-center" :aria-hidden="alt ? undefined : 'true'">
      <!-- glow (heros sin foto): la runa se talla en aurora dentro de un
           halo suave — el placeholder rúnico como protagonista, no como
           hueco vacío -->
      <div
        v-if="glow"
        class="flex items-center justify-center rounded-full bg-stone p-6 shadow-(--bk-shadow-aurora-soft)"
      >
        <BkRune :name="runeName" :size="runeSizes[size]" carve tone="aurora" />
      </div>
      <BkRune v-else :name="runeName" :size="runeSizes[size]" class="text-ink-faint" />
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'

import { exerciseImageUrl, type ExerciseOut } from '@/api/domain'
import BkRune from './BkRune.vue'
import type { RuneName } from './runes'

// facelift: hero con media de fondo + contenido encima.
// v2: contenido EN FLUJO (no absolute) — con contenido más alto que el
// mínimo, crece en vez de recortarse por arriba; z explícitos para que la
// runa animada (stacking context al tallarse) nunca pinte sobre el texto.
// v3 (zurdi, tema claro: "el nombre se ve muy negro… mejorala"): con FOTO el
// lienzo del hero es SIEMPRE OSCURO, venga el tema que venga
// (.bk-hero-backdrop, mismo criterio que el scrim) y el texto SIEMPRE claro
// con sombra (.bk-hero-content) — una foto con degradado oscuro pide tinta
// clara en los dos temas.
// v5 (zurdi: "quitamos la card en sí… background completamente
// transparente"): SIN foto no hay card — backdrop y scrims solo existen en
// modo foto, el contenido flota sobre el fondo de la página con la tinta del
// tema (las clases bk-hero-* resuelven ambos modos vía descendiente de
// .bk-hero-backdrop, ver base.css) y la runa central va tenue y con blur
// ("la runa se ve demasiado") para que el texto mande.
// v6 (zurdi: "en el header del entrenamiento no quiero blur, que se quede
// como antes de ese commit"): `backdrop` = isla con la runa tallada a plena
// presencia (sin opacity/blur) para la preview del entreno.
// v7 (zurdi: "en claro se ve negro — debería ser coherente con el modo
// claro"): esa isla es TEMATIZADA (.bk-hero-island: en oscuro idéntica a la
// nocturna, en claro niebla pálida con glow y tinta del tema) y sin scrims
// (no hay foto que oscurecer). La isla NOCTURNA fija (.bk-hero-backdrop)
// queda solo para el modo foto. El transparente v5 sigue en el hero de Hoy.
// La media va en una Transition propia keyada por foto/runa: cambiar de
// rutina cruza la media (y re-talla la runa) SIN remontar la card entera.
// `flush`: sin radio propio, para heros a sangre (-mx-4 -mt-4 en la vista).
const props = withDefaults(
  defineProps<{
    exercise?: Pick<ExerciseOut, 'id' | 'has_image'> | null
    src?: string
    rune?: RuneName | null
    flush?: boolean
    backdrop?: boolean
  }>(),
  { flush: false, backdrop: false },
)

const errored = ref(false)

const url = computed(() => {
  if (props.src) return props.src
  if (props.exercise?.has_image) return exerciseImageUrl(props.exercise.id)
  return null
})

// otra rutina en el mismo hero: un error viejo no condena a la nueva foto
watch(url, () => {
  errored.value = false
})

const showImage = computed(() => url.value !== null && !errored.value)
const runeName = computed<RuneName>(() => props.rune ?? 'berserk')
const mediaKey = computed(() => (showImage.value ? `img-${url.value}` : `rune-${runeName.value}`))
</script>

<template>
  <div
    class="relative overflow-hidden flex flex-col min-h-64"
    :class="[showImage ? 'bk-hero-backdrop' : backdrop && 'bk-hero-island', !flush && 'rounded-xl']"
  >
    <Transition name="bk-fade" mode="out-in">
      <div :key="mediaKey" class="absolute inset-0 z-0" aria-hidden="true">
        <img
          v-if="showImage"
          :src="url!"
          alt=""
          class="w-full h-full object-cover"
          decoding="async"
          @error="errored = true"
        />
        <!-- modo transparente (v5): la runa respira detrás, tenue y
             desenfocada, para que la tipografía mande sobre ella. Con
             `backdrop` (v6, preview del entreno) la runa va a plena
             presencia, como antes del blur -->
        <div
          v-else
          class="absolute inset-0 flex items-center justify-center"
          :class="!backdrop && 'opacity-25 blur-xs'"
        >
          <BkRune :name="runeName" :size="96" carve tone="aurora" />
        </div>
      </div>
    </Transition>
    <!-- scrims solo con FOTO: en la isla tematizada no hay nada que
         oscurecer (y en claro el velo oscuro la embarraría) -->
    <template v-if="showImage">
      <div class="absolute inset-x-0 top-0 h-24 z-0 bg-gradient-to-b from-scrim/80 to-transparent" aria-hidden="true" />
      <div class="absolute inset-x-0 bottom-0 h-40 z-0 bg-gradient-to-t from-scrim via-scrim/40 to-transparent" aria-hidden="true" />
    </template>
    <!-- z-20, no z-10: el contenedor de contenido de abajo también es z-10 y
         viene DESPUÉS en el DOM — con el mismo índice pintaba encima y se
         COMÍA los clicks del corner (el atrás del pre-inicio "no hacía
         nada", zurdi v0.21.4) -->
    <div v-if="$slots.corner" class="absolute inset-x-4 top-4 z-20 flex items-start justify-between gap-2 bk-hero-content">
      <slot name="corner" />
    </div>
    <div class="relative z-10 flex-1 flex flex-col p-5 bk-hero-content">
      <slot />
    </div>
  </div>
</template>

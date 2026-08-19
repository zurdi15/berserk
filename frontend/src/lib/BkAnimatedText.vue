<script setup lang="ts">
import { ref, watch } from 'vue'

// v0.24.3 (zurdi: "ese mismo efecto de cambio en las letras del título de la
// rutina"): texto que entra LETRA A LETRA con cascada — el análogo textual
// del roll de BkAnimatedNumber. Cada cambio de texto re-keya todas las
// letras (generation) para repetir la entrada; el contenedor nunca se
// desmonta, así que nada alrededor (blur de píldoras, layout) parpadea.
// Accesibilidad: el texto real viaja en aria-label del wrapper y las letras
// van aria-hidden — un lector de pantalla lee la palabra, no el deletreo.
const props = defineProps<{ text: string }>()

const generation = ref(0)
watch(
  () => props.text,
  () => {
    generation.value++
  },
)

// cascada corta: con nombres largos el final no debe hacerse esperar
const STEP_MS = 26
</script>

<template>
  <span :aria-label="text">
    <span
      v-for="(ch, i) in [...text]"
      :key="`${generation}-${i}`"
      aria-hidden="true"
      class="bk-letter-in"
      :style="{ '--bk-letter-delay': `${i * STEP_MS}ms` }"
    >{{ ch === ' ' ? ' ' : ch }}</span>
  </span>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'

import { useAnimatedNumber } from '@/composables/useAnimatedNumber'
import BkRune from '@/lib/BkRune.vue'

// facelift: la racha se DEGRADA de card entera a chip junto al saludo — el
// hero de Hoy es ahora el protagonista y una card completa para un número
// era jerarquía invertida. Conserva testid, tono ember al estar viva y el
// roll de useAnimatedNumber; el texto plural de la vieja card sobrevive como
// aria-label (el chip solo pinta runa + número).
interface StreakData {
  weeks: number
}

const props = withDefaults(defineProps<{ streak: StreakData | null }>(), {})
const { t } = useI18n()

const weeks = computed(() => props.streak?.weeks ?? 0)
// el tono usa el valor crudo, no el animado: el color final ya debe estar
// fijado cuando arranca el conteo (ver TodayView, gating de item 2), el roll
// solo anima los dígitos
const tone = computed<'ember' | 'ink'>(() => (weeks.value >= 1 ? 'ember' : 'ink'))
const animatedWeeks = useAnimatedNumber(() => weeks.value)
</script>

<template>
  <div
    data-testid="streak-card"
    class="inline-flex items-center gap-2 rounded-full border px-3 py-1.5 shrink-0"
    :class="weeks >= 1 ? 'border-ember/50 text-ember' : 'border-line text-ink-muted'"
    :aria-label="t('today.streakWeeks', { n: weeks }, weeks)"
  >
    <BkRune name="streak" :size="20" :tone="tone" />
    <span class="bk-metric text-xl" aria-hidden="true">{{ animatedWeeks ?? 0 }}</span>
  </div>
</template>

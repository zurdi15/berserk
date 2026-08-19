<script setup lang="ts">
import BkButton from './BkButton.vue'
import BkRune from './BkRune.vue'
import type { RuneName } from './runes'

// item 10: primitiva de vacío UNIFICADA — rune + mensaje + botón de acción
// OPCIONAL directamente debajo (variante primary). actionLabel ausente =
// mismo comportamiento de siempre (solo rune+mensaje); el slot por defecto
// sigue disponible para contenido extra que ningún consumidor usa hoy.
const props = withDefaults(
  defineProps<{ rune?: RuneName; message: string; actionLabel?: string; actionTestid?: string }>(),
  { rune: 'berserk' },
)
const emit = defineEmits<{ action: [] }>()
</script>

<template>
  <div class="flex flex-col items-center gap-4 py-10 text-center">
    <!-- facelift: la runa vive en un pozo circular slab — mismo lenguaje que
         los leading-wells de BkListRow/BkMedia, en vez de flotar suelta -->
    <div class="flex items-center justify-center w-20 h-20 rounded-full bg-slab">
      <BkRune :name="rune" :size="40" carve class="text-ink-faint" />
    </div>
    <p class="text-base text-ink-muted max-w-xs">{{ message }}</p>
    <BkButton
      v-if="actionLabel"
      variant="primary"
      size="sm"
      :data-testid="props.actionTestid ?? 'empty-action-btn'"
      @click="emit('action')"
    >
      {{ actionLabel }}
    </BkButton>
    <slot />
  </div>
</template>

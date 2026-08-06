<script setup lang="ts">
import BkRune from '@/lib/BkRune.vue'
import { useAthleteStore } from '@/stores/athlete'

const athlete = useAthleteStore()
</script>

<template>
  <Transition name="bk-rise">
    <div
      v-if="athlete.isViewing"
      data-testid="athlete-banner"
      class="flex items-center justify-between gap-2 px-4 py-2 border-b border-aurora bg-stone text-sm"
    >
      <span class="flex items-center gap-2 text-aurora">
        <BkRune name="shoulders" :size="16" />
        <!-- el color de usuario es DATO (lo elige cada cual en ajustes), no un
             token del sistema de diseño — mismo criterio que los datos de
             gráficas: se pinta con style inline, no con una clase, y por eso
             está exento del guard de hex crudo (ver src/tokens/userColors.ts) -->
        <span
          class="w-2.5 h-2.5 rounded-full shrink-0"
          :style="{ backgroundColor: athlete.viewing!.color || 'var(--bk-accent-aurora)' }"
          data-testid="athlete-banner-dot"
          aria-hidden="true"
        />
        {{ $t('athlete.viewing', { name: athlete.viewing!.username }) }}
      </span>
      <button
        type="button"
        data-testid="athlete-banner-stop"
        class="bk-press text-ink-muted hover:text-ink"
        @click="athlete.clear()"
      >
        {{ $t('athlete.stop') }}
      </button>
    </div>
  </Transition>
</template>

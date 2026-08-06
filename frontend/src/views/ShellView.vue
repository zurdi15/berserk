<script setup lang="ts">
import { computed } from 'vue'
import { useRoute } from 'vue-router'

import BkRune from '@/lib/BkRune.vue'
import type { RuneName } from '@/lib/runes'
import AthleteBanner from '@/components/shell/AthleteBanner.vue'
import TimerPill from '@/components/shell/TimerPill.vue'

const items: { name: string; label: string; rune: RuneName }[] = [
  { name: 'today', label: 'app.nav.today', rune: 'streak' },
  { name: 'calendar', label: 'app.nav.calendar', rune: 'core' },
  { name: 'workout', label: 'app.nav.workout', rune: 'berserk' },
  { name: 'progress', label: 'app.nav.progress', rune: 'pr' },
  { name: 'profile', label: 'app.nav.profile', rune: 'shoulders' },
]

const route = useRoute()

// índice de la sección activa, para el indicador deslizante del bottom bar
// (móvil): -1 (sin match) cae a 0 en vez de esconder la barra en una posición
// rara — dentro de este shell siempre hay una ruta hija activa
const activeIndex = computed(() => {
  const idx = items.findIndex((item) => item.name === route.name)
  return idx === -1 ? 0 : idx
})
</script>

<template>
  <div class="min-h-dvh flex flex-col">
    <!-- Desktop navbar: barra superior centrada con destinos (identidad por ahora en móvil) -->
    <header class="hidden sm:block border-b border-line">
      <nav :aria-label="$t('app.nav.label')">
        <ul class="flex justify-center gap-2">
          <li v-for="item in items" :key="item.name">
            <RouterLink
              :to="{ name: item.name }"
              class="relative flex flex-col items-center gap-1 px-3 py-2 text-ink-faint hover:text-ink"
              active-class="text-aurora"
            >
              <span class="text-xs uppercase tracking-wide">{{ $t(item.label) }}</span>
              <span :class="item.name === 'workout' && 'bk-slab relative -mb-5 p-2.5 border-aurora text-aurora'">
                <!-- activo (en /workout): glow fijo a plena opacidad, sin respirar
                     (no tendría sentido parpadear la CTA de la sección en la que ya
                     estás); inactivo: sigue respirando como reclamo -->
                <span
                  v-if="item.name === 'workout'"
                  class="absolute inset-0 rounded-sm shadow-(--bk-shadow-aurora)"
                  :class="{ 'bk-breathe': route.name !== 'workout' }"
                  aria-hidden="true"
                  data-testid="workout-glow"
                />
                <BkRune :name="item.rune" :size="item.name === 'workout' ? 26 : 20" :carve="item.name === 'workout'" class="relative" />
              </span>
              <!-- subrayado por item: entra con scale-in cuando la sección está
                   activa — la CTA de entreno no lleva subrayado, su affordance
                   ya es el glow fijo de arriba -->
              <span
                v-if="item.name !== 'workout'"
                class="absolute inset-x-2 bottom-0 h-0.5 rounded-full bg-aurora"
                :class="route.name === item.name ? 'scale-x-100' : 'scale-x-0'"
                style="transition: transform var(--bk-dur-2) var(--bk-ease-out); transform-origin: center"
                aria-hidden="true"
                data-testid="nav-underline"
              />
            </RouterLink>
          </li>
        </ul>
      </nav>
    </header>
    <AthleteBanner />
    <!-- Mobile bottom nav: barra inferior fija en móvil; oculta en desktop (por ahora sin cabecera de identidad) -->
    <nav
      class="fixed inset-x-0 bottom-0 z-(--bk-z-nav) border-t border-line bg-stone pb-[env(safe-area-inset-bottom)] sm:hidden"
      :aria-label="$t('app.nav.label')"
    >
      <div class="relative max-w-3xl mx-auto">
        <!-- indicador deslizante: una barra por cada 1/5 del ancho, se traslada
             al índice activo — oculto por completo en /workout, no debe quedar
             una barra pasando por debajo de la CTA central -->
        <div
          v-if="route.name !== 'workout'"
          class="absolute top-0 left-0 h-0.5 w-1/5 rounded-full bg-aurora"
          :style="{ transform: `translateX(${activeIndex * 100}%)`, transition: 'transform var(--bk-dur-3) var(--bk-ease-out)' }"
          aria-hidden="true"
          data-testid="nav-indicator"
        />
        <ul class="flex justify-around">
          <li v-for="item in items" :key="item.name" class="flex-1">
            <RouterLink
              :to="{ name: item.name }"
              class="flex flex-col items-center gap-1 py-2 text-ink-faint"
              active-class="text-aurora"
            >
              <span
                :class="item.name === 'workout' && 'bk-slab relative -mt-5 p-2.5 border-aurora text-aurora'"
              >
                <!-- mismo criterio que en desktop: glow fijo activo, respira inactivo -->
                <span
                  v-if="item.name === 'workout'"
                  class="absolute inset-0 rounded-sm shadow-(--bk-shadow-aurora)"
                  :class="{ 'bk-breathe': route.name !== 'workout' }"
                  aria-hidden="true"
                  data-testid="workout-glow"
                />
                <BkRune :name="item.rune" :size="item.name === 'workout' ? 26 : 20" :carve="item.name === 'workout'" class="relative" />
              </span>
              <span class="text-xs uppercase tracking-wide">{{ $t(item.label) }}</span>
            </RouterLink>
          </li>
        </ul>
      </div>
    </nav>
    <main class="flex-1 px-4 py-4 pb-24 max-w-3xl w-full mx-auto">
      <RouterView v-slot="{ Component }">
        <Transition name="bk-rise" mode="out-in">
          <component :is="Component" />
        </Transition>
      </RouterView>
    </main>
    <TimerPill />
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useRoute } from 'vue-router'

import BkRune from '@/lib/BkRune.vue'
import type { RuneName } from '@/lib/runes'
import AthleteBanner from '@/components/shell/AthleteBanner.vue'
import { useActiveWorkoutStore } from '@/stores/activeWorkout'
import { useRestTimerStore } from '@/stores/restTimer'

// item 4 (round 9): correcciones de runas del nav — streak/shoulders SIGUEN
// existiendo en runes.ts (streak: StreakCard; shoulders: rune de grupo
// muscular del catálogo/leyenda), solo cambian los punteros de aquí
const items: { name: string; label: string; rune: RuneName }[] = [
  { name: 'today', label: 'app.nav.today', rune: 'sowilo' },
  { name: 'calendar', label: 'app.nav.calendar', rune: 'core' },
  { name: 'workout', label: 'app.nav.workout', rune: 'berserk' },
  { name: 'progress', label: 'app.nav.progress', rune: 'pr' },
  { name: 'profile', label: 'app.nav.profile', rune: 'dagaz' },
]

const route = useRoute()
const timer = useRestTimerStore()
const activeWorkout = useActiveWorkoutStore()

// item 1 (v0.3.0, feedback de gym de zurdi): mientras hay un descanso activo,
// el hueco de la runa del CTA pasa a mostrar el countdown en su lugar — el
// slab/glow y la navegación a /workout no cambian, solo lo que hay dentro.
// TimerPill (pill flotante) se retira: duplicaba este mismo aviso en TODAS
// las rutas (la nav es chrome persistente, no solo /workout), puro ruido
// ahora que el CTA ya hace de tap-target siempre visible.
const resting = computed(() => timer.active)

// item 3 (v0.3.0, addendum zurdi): jerarquía del glow del CTA —
// ruta /workout activa (opacity 1, ya existía) > entreno en curso en otra
// ruta (opacity tenue) > apagado. Mientras se descansa, el countdown de
// arriba ya es la señal; mantener ADEMÁS el glow de "en curso" ahí compite
// con el propio countdown, así que ese nivel se apaga durante el descanso.
const workoutGlowOpacity = computed(() => {
  if (route.name === 'workout') return 1
  return activeWorkout.workout && !resting.value ? 0.4 : 0
})

// índice de la sección activa, para el indicador deslizante del bottom bar
// (móvil): -1 (sin match) cae a 0 en vez de esconder la barra en una posición
// rara — dentro de este shell siempre hay una ruta hija activa
const activeIndex = computed(() => {
  const idx = items.findIndex((item) => item.name === route.name)
  return idx === -1 ? 0 : idx
})

// h-dvh (no min-h-dvh) en la raíz de abajo: un tope real de altura es lo que
// permite que <main> reparta con flex-1 un alto DEFINIDO — sin él, una vista
// que pida "ocupa el resto del viewport" (progresión, item 3) no tiene
// contra qué medirse y la página entera crece en vez de scrollear por
// dentro. El resto de vistas no cambian de comportamiento: su contenido
// sigue scrolleando igual, solo que ahora el scroll vive en <main> en vez de
// en el documento. (Nota: este comentario vive en <script>, no como primer
// hijo de <template> — un comentario HTML ahí convierte la raíz en un
// fragmento de dos nodos y rompe wrapper.classes()/fallthrough de un solo
// elemento raíz, ver BkChart.vue.)
</script>

<template>
  <div class="h-dvh flex flex-col">
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
              <span class="text-xs tracking-wide">{{ $t(item.label) }}</span>
              <span :class="item.name === 'workout' && 'bk-slab relative -mb-5 p-2.5 border-aurora text-aurora'">
                <!-- sin respirar (revertido): una sola capa, apagada por defecto,
                     que funde a opacity 1 cuando /workout está activo y funde de
                     vuelta a 0 al salir — transition pura, sin animación infinita
                     de la que "desenganchar" a mitad de ciclo -->
                <span
                  v-if="item.name === 'workout'"
                  class="absolute inset-0 rounded-sm shadow-(--bk-shadow-aurora)"
                  :style="{ opacity: workoutGlowOpacity, transition: 'opacity var(--bk-dur-3) var(--bk-ease-out)' }"
                  aria-hidden="true"
                  data-testid="workout-glow"
                />
                <template v-if="item.name === 'workout'">
                  <!-- swap rune<->countdown con el idioma de entrada de la app
                       (bk-fade, entry-only): out-in para que la runa termine de
                       salir antes de que el countdown entre, nunca los dos a
                       la vez -->
                  <Transition name="bk-fade" mode="out-in">
                    <span
                      v-if="resting"
                      key="timer"
                      data-testid="cta-timer"
                      class="bk-metric relative text-sm"
                    >{{ timer.label }}</span>
                    <BkRune v-else key="rune" :name="item.rune" :size="26" :carve="true" class="relative" />
                  </Transition>
                </template>
                <BkRune v-else :name="item.rune" :size="20" :carve="false" class="relative" />
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
             al índice activo — SIEMPRE montado (nunca v-if) para poder cruzar a
             opacity 0 en vez de desaparecer de golpe al entrar en /workout; ya
             se traslada solo hasta la posición de la CTA (activeIndex la
             incluye), así que el fade queda encima de ese movimiento, no en
             lugar de él -->
        <div
          class="absolute top-0 left-0 h-0.5 w-1/5 rounded-full bg-aurora"
          :style="{
            transform: `translateX(${activeIndex * 100}%)`,
            opacity: route.name === 'workout' ? 0 : 1,
            transition: 'transform var(--bk-dur-3) var(--bk-ease-out), opacity var(--bk-dur-3) var(--bk-ease-out)',
          }"
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
                <!-- mismo criterio que en desktop: una capa, opacity 0/1 -->
                <span
                  v-if="item.name === 'workout'"
                  class="absolute inset-0 rounded-sm shadow-(--bk-shadow-aurora)"
                  :style="{ opacity: workoutGlowOpacity, transition: 'opacity var(--bk-dur-3) var(--bk-ease-out)' }"
                  aria-hidden="true"
                  data-testid="workout-glow"
                />
                <template v-if="item.name === 'workout'">
                  <!-- swap rune<->countdown con el idioma de entrada de la app
                       (bk-fade, entry-only): out-in para que la runa termine de
                       salir antes de que el countdown entre, nunca los dos a
                       la vez -->
                  <Transition name="bk-fade" mode="out-in">
                    <span
                      v-if="resting"
                      key="timer"
                      data-testid="cta-timer"
                      class="bk-metric relative text-sm"
                    >{{ timer.label }}</span>
                    <BkRune v-else key="rune" :name="item.rune" :size="26" :carve="true" class="relative" />
                  </Transition>
                </template>
                <BkRune v-else :name="item.rune" :size="20" :carve="false" class="relative" />
              </span>
              <!-- revertido (round 7, zurdi): se probó ocultar las inactivas
                   (sr-only + fade solo en la activa), pero con el token a
                   0.7rem las 5 etiquetas leen bien tal cual — vuelta al clásico -->
              <span class="text-2xs tracking-wide">{{ $t(item.label) }}</span>
            </RouterLink>
          </li>
        </ul>
      </div>
    </nav>
    <main class="flex-1 min-h-0 overflow-y-auto bk-scroll-stable px-4 py-4 pb-24 max-w-3xl w-full mx-auto">
      <!-- sin Transition aquí a propósito (item 4): esto envolvía la vista
           ENTERA en un fade bk-rise MIENTRAS su propio bk-stagger interno
           corría con su propio delay — dos sistemas de animación a la vez,
           el viewport se veía negro los primeros ~80ms tras navegar porque
           las opacidades de ambos se multiplican. Cada vista es dueña de su
           única animación de entrada ahora (bk-stagger/bk-rise propio, o
           ninguna si no hace falta) — ver auditoría por vista en el informe. -->
      <RouterView />
    </main>
  </div>
</template>

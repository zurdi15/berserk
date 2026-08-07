<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
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

// item 1 (v0.4.0, desktop nav polish): indicador deslizante también arriba,
// como el de abajo — pero aquí los items son de ancho VARIABLE (etiquetas de
// texto), no columnas iguales de 1/5, así que en vez de fracciones fijas se
// mide el rectángulo real del item activo (offsetLeft/offsetWidth) y el
// indicador se posiciona con transform+width en píxeles. El <header> es el
// contexto de posicionamiento (position:relative, ver template) para que el
// translateX() sea relativo al header entero (donde el <ul> vive centrado),
// no al <li> — y para que el indicador pueda vivir bottom-0 DEL HEADER (item
// 2), sobre la misma línea que su border-b.
const desktopItemRefs = ref<(HTMLLIElement | null)[]>([])
function setDesktopItemRef(el: Element | null, index: number) {
  desktopItemRefs.value[index] = el as HTMLLIElement | null
}

const indicatorLeft = ref(0)
const indicatorWidth = ref(0)

function updateIndicator() {
  const el = desktopItemRefs.value[activeIndex.value]
  if (!el) return
  indicatorLeft.value = el.offsetLeft
  indicatorWidth.value = el.offsetWidth
}

onMounted(() => {
  updateIndicator()
  window.addEventListener('resize', updateIndicator)
})
onUnmounted(() => {
  window.removeEventListener('resize', updateIndicator)
})
// activeIndex, no route.name: el ancho de los items es estático (5 fijos),
// así que solo hace falta remedir cuando cambia CUÁL item está activo
watch(activeIndex, () => nextTick(updateIndicator))

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
    <!-- Desktop navbar: barra superior centrada con destinos (identidad por ahora en móvil).
         relative: contexto de posicionamiento del indicador deslizante de abajo (item 1/2) —
         translateX() queda relativo al header entero (donde el <ul> vive centrado), y el
         indicador puede vivir bottom-0 DE AQUÍ, sobre la misma línea que border-b. -->
    <header class="hidden sm:block border-b border-line relative">
      <nav :aria-label="$t('app.nav.label')">
        <!-- items-end (item 2): sin esto, align-items:stretch (default) estira cada <li> al
             alto del más alto (la CTA, por su slab) pero el contenido de los DEMÁS items
             (RouterLink, altura de contenido) se queda arriba de ESE <li> más alto, dejando
             hueco vacío debajo antes de tocar el borde — los items "flotan" a media barra en
             vez de asentar en la línea del border-b. items-end alinea cada <li> por su propio
             borde inferior en vez de estirarlo, así que label+runa quedan al mismo nivel en
             todos los items normales; la CTA sigue sobresaliendo por debajo vía su propio
             -mb-5 (pintado fuera de su caja de layout, ver más abajo), sin tocar eso. -->
        <ul class="flex items-end justify-center gap-2">
          <li v-for="(item, index) in items" :key="item.name" :ref="(el) => setDesktopItemRef(el as Element | null, index)">
            <RouterLink
              :to="{ name: item.name }"
              class="flex flex-col items-center gap-1 px-3 py-2 text-ink-faint hover:text-ink"
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
            </RouterLink>
          </li>
        </ul>
      </nav>
      <!-- item 1: indicador deslizante único (no uno por item) — igual patrón que el de
           móvil (SIEMPRE montado, cruza a opacity 0 en vez de desmontarse en /workout, ver
           comentario de nav-indicator más abajo), pero medido en px porque los items no son
           columnas iguales. width/transform con los mismos tokens dur-3/ease-out. -->
      <div
        class="absolute bottom-0 left-0 h-0.5 rounded-full bg-aurora"
        :style="{
          transform: `translateX(${indicatorLeft}px)`,
          width: `${indicatorWidth}px`,
          opacity: route.name === 'workout' ? 0 : 1,
          transition:
            'transform var(--bk-dur-3) var(--bk-ease-out), width var(--bk-dur-3) var(--bk-ease-out), opacity var(--bk-dur-3) var(--bk-ease-out)',
        }"
        aria-hidden="true"
        data-testid="nav-indicator-desktop"
      />
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
    <!-- item 3 (v0.4.0, scrollbar): <main> es el scroll container A ANCHO COMPLETO (sin
         max-w-3xl/mx-auto) — así su scrollbar pinta en el borde real de la ventana, no
         pegada al canto de la columna de contenido. La columna centrada vive en el <div>
         de abajo. bk-scroll-stable se queda en <main> (es donde el scroll ocurre de
         verdad).
         v0.4.1: <main> ya NO lleva pb-24/padding — ver el comentario del spacer, más abajo,
         para el porqué completo (el hueco del navbar fijo se mudó a un elemento de flujo
         real, DENTRO del wrapper, no a un padding de <main>). -->
    <main class="flex-1 min-h-0 overflow-y-auto bk-scroll-stable w-full">
      <!-- v0.4.1 — HISTORIA COMPLETA DEL MODELO DE ALTURA (bug real de zurdi en móvil: "se
           ha roto el scroll — parte del content de abajo se esconde detrás de la bottom
           navbar"). Este wrapper sigue siendo una caja de altura DEFINIDA (nunca min-height,
           ver por qué al final), pero YA NO es exactamente h-full de <main> — es
           h-[calc(100%-6rem)]: 100% de <main> MENOS los 6rem (96px, el mismo valor que el
           pb-24 histórico) que reserva el spacer de abajo. Dos problemas distintos, dos
           partes de este mismo fix:

           1) EL BUG ORIGINAL (contenido tapado): con h-full puro + pb-24 como padding
              —fuera en <main>, fuera en este wrapper, da igual dónde— el padding-bottom de
              una caja se reserva SIEMPRE justo tras la altura RESUELTA de esa caja, nunca
              tras lo que sus hijos desborden. Una vista más alta que el viewport (Hoy con
              mucho registro) se pinta más allá del borde de la caja (overflow visible,
              default) — y como el padding vivía DENTRO de esa misma caja de altura fija, su
              hueco quedaba a mitad del contenido desbordado, no al final: main.scrollHeight
              SÍ crecía con el desborde (el overflow de un descendiente cuenta para el scroll
              del ancestro real aunque el padre intermedio tenga overflow visible), pero el
              scroll llegaba hasta el ÚLTIMO píxel de contenido sin ningún hueco reservado ahí
              — tapado por el navbar fijo. Verificado en Chromium real (headless, 390×844):
              con pb-24 en <main> (v0.4.0), el último elemento de Hoy quedaba a -38px del
              navbar (38px POR DEBAJO de su borde superior, tapado).
              Fix de ESTA parte: pb-24 pasa de padding a un <div> SPACER real (ver más abajo)
              — un hijo de flujo, hermano de RouterView, no una propiedad de caja. Un hijo
              flex NO se recorta a la altura resuelta de su padre: el algoritmo de flex apila
              cada item por su tamaño real (auto/contenido para RouterView, fijo para el
              spacer) uno tras otro, así que el spacer siempre queda inmediatamente DESPUÉS
              del contenido real de RouterView, se desborde la caja padre o no.

           2) SEGUNDO BUG, encontrado verificando el primer intento en Chromium real: mover
              el spacer DENTRO de un wrapper que se quedaba en h-full (100% COMPLETO de
              <main>, sin descontar los 6rem del spacer) le daba a las vistas con su propio
              h-full interno (ProgressView) una referencia de altura MAYOR que antes — la
              vista entera crecía ~80px de más y el contenido "anclado abajo" (el chart de
              Entrenos) se plantaba a ras del viewport, bajo el navbar, en vez de quedar
              claro por encima como siempre. Contraintuitivo: el spacer vive DESPUÉS de
              RouterView como hermano de flujo, así que en teoría "no debería" afectar el
              100% que ve RouterView — pero SÍ afecta, porque ProgressView no usa flex-grow
              para ocupar hueco (eso solo sirve para repartir espacio libre), usa
              height:100% (percentage) directamente contra la altura RESUELTA de este
              wrapper — un valor que no sabe nada de sus hermanos de flujo (el spacer), solo
              del padre. Si el wrapper reporta 100% de <main> completo, ProgressView ocupa
              ESO completo, ajeno a que el spacer se va a comer 96px después.
              Fix de ESTA parte: h-[calc(100%-6rem)] en vez de h-full — el wrapper declara
              explícitamente que su propio 100% (la referencia que ProgressView hereda) es
              el alto de <main> MENOS la reserva del spacer, no el alto completo. Esto NO
              afecta a vistas sin altura propia (Hoy: su tamaño lo pone su contenido, no el
              wrapper, así que desbordar un wrapper de 748px o de 844px da exactamente el
              mismo resultado — el spacer sigue el final real del contenido igual).
              Verificado en Chromium real (390×844, dev build): con h-[calc(100%-6rem)], el
              chart de Entrenos vuelve a la MISMA posición exacta que en v0.4.0 (wrapper
              748px, idéntico al viejo main con pb-24), en vez de quedar 80px más abajo.

           Por qué sigue siendo una caja DEFINIDA (nunca min-h-full, aunque "crecer con el
           contenido" suene tentador para el bug 1): min-h-full aquí se probó y ROMPE la
           cadena flex/% de ProgressView — un hijo flex-1/h-full varios niveles más adentro
           (ExercisePicker, ver su comentario) deja de recibir una referencia DEFINIDA en
           cuanto el ancestro de arriba pasa de height fijo a min-height (min-height no
           cuenta como "definido" para % de descendientes, y tampoco deja que flex-grow
           reparta espacio de forma fiable cuando el propio contenedor está en modo
           auto-size). Chromium real lo confirmó: el listado de ejercicios dejaba de tener su
           propio scroll interno y arrastraba a <main> entero a desbordar miles de px. -->
      <div class="max-w-3xl mx-auto w-full h-[calc(100%-6rem)] flex flex-col px-4 pt-4">
        <!-- sin Transition aquí a propósito (item 4): esto envolvía la vista
             ENTERA en un fade bk-rise MIENTRAS su propio bk-stagger interno
             corría con su propio delay — dos sistemas de animación a la vez,
             el viewport se veía negro los primeros ~80ms tras navegar porque
             las opacidades de ambos se multiplican. Cada vista es dueña de su
             única animación de entrada ahora (bk-stagger/bk-rise propio, o
             ninguna si no hace falta) — ver auditoría por vista en el informe. -->
        <RouterView />
        <!-- v0.4.1: spacer real (no padding) que reserva el hueco del navbar móvil fijo —
             ver la historia completa (punto 1) en el comentario de arriba. h-24 = 6rem,
             MISMO valor que el calc(100%-6rem) de arriba: si este cambia, el de arriba tiene
             que cambiar con él (es la misma reserva, expresada dos veces por necesidad —
             una como tamaño propio del spacer, otra como descuento en el techo del
             wrapper). Verificado en Chromium real (390×844, dev build): el último elemento
             de Hoy pasa de -38px (tapado) a +58px (58px de margen limpio) sobre el navbar;
             Progresión/Entrenos con contenido corto sigue con el chart anclado abajo y la
             lista ocupando el resto en la MISMA posición que en v0.4.0 (ver punto 2 arriba);
             scrollbar sigue en el borde real de la ventana sin gutter shift entre vistas
             cortas y largas. -->
        <div class="shrink-0 h-24" aria-hidden="true" data-testid="mobile-nav-clearance" />
      </div>
    </main>
  </div>
</template>

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

// item 6 (v0.4.3, zurdi): mientras se descansa Y ya se está en /workout, el
// CTA no tiene a dónde navegar (ya estás ahí) — un tap lo EXPANDE (revela un
// botón de cancelar descanso junto al countdown) en vez de ser un no-op. Un
// segundo tap en el propio CTA, tocar fuera, o unos segundos sin tocar nada,
// lo colapsa de vuelta (sin cancelar el descanso: solo "cierra el cajón").
// Fuera de /workout, o sin descanso activo, el CTA sigue navegando normal —
// el intercept solo aplica al ÚNICO caso donde navegar sería un no-op.
const ctaExpanded = ref(false)
let ctaCollapseTimer: ReturnType<typeof setTimeout> | null = null

function scheduleCtaAutoCollapse() {
  if (ctaCollapseTimer) clearTimeout(ctaCollapseTimer)
  ctaCollapseTimer = setTimeout(() => { ctaExpanded.value = false }, 4000)
}

function collapseCta() {
  ctaExpanded.value = false
  if (ctaCollapseTimer) {
    clearTimeout(ctaCollapseTimer)
    ctaCollapseTimer = null
  }
}

function onCtaClick(event: MouseEvent, itemName: string) {
  if (itemName !== 'workout' || route.name !== 'workout' || !resting.value) return
  // preventDefault: RouterLink respeta defaultPrevented y no navega — este
  // es el ÚNICO caso (ya en /workout, descansando) donde interceptamos
  event.preventDefault()
  if (ctaExpanded.value) collapseCta()
  else {
    ctaExpanded.value = true
    scheduleCtaAutoCollapse()
  }
}

function cancelRestFromCta(event: MouseEvent) {
  // stopPropagation: sin esto, este click burbujea hasta el listener de
  // document (ver onDocumentPointerDown) DESPUÉS de que collapseCta() ya
  // corrió aquí — inofensivo en la práctica (collapseCta es idempotente),
  // pero más claro no depender de ese orden
  event.stopPropagation()
  timer.clear()
  collapseCta()
}

// se colapsa solo si deja de tener sentido seguir expandido: el descanso
// termina/se cancela desde OTRO sitio (p.ej. el timer llega a 0 solo), o se
// navega fuera de /workout (donde el CTA vuelve a ser un link normal)
watch(resting, (active) => { if (!active) collapseCta() })
watch(() => route.name, () => collapseCta())

// tap FUERA del CTA (cualquiera de las dos instancias, desktop/móvil según
// el breakpoint): colapsa sin cancelar — mismo criterio "dismiss sin
// destruir" que un popover. pointerdown en document (no click): dispara
// ANTES de que un tap en otro control de la página ejecute su propia acción,
// para que "tocar fuera" se sienta instantáneo.
const desktopCtaEl = ref<HTMLElement | null>(null)
const mobileCtaEl = ref<HTMLElement | null>(null)
function onDocumentPointerDown(event: PointerEvent) {
  if (!ctaExpanded.value) return
  const target = event.target as Node
  if (desktopCtaEl.value?.contains(target)) return
  if (mobileCtaEl.value?.contains(target)) return
  collapseCta()
}

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
  // item 6: mismo <li> que el indicador deslizante ya mide — reutilizado
  // como raíz de "outside click" del CTA (contiene el link Y, si está
  // expandido, el botón de cancelar: ver onDocumentPointerDown)
  if (items[index]?.name === 'workout') desktopCtaEl.value = el as HTMLElement | null
}

// item 6: equivalente móvil de arriba — el nav de abajo no llevaba ref por
// item (no lo necesitaba hasta ahora, no hay indicador medido en px ahí)
function setMobileItemRef(el: Element | null, itemName: string) {
  if (itemName === 'workout') mobileCtaEl.value = el as HTMLElement | null
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
  document.addEventListener('pointerdown', onDocumentPointerDown)
})
onUnmounted(() => {
  window.removeEventListener('resize', updateIndicator)
  document.removeEventListener('pointerdown', onDocumentPointerDown)
  if (ctaCollapseTimer) clearTimeout(ctaCollapseTimer)
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
          <!-- item 6: items-end (además del que ya llevaba el <ul>) cuando el
               CTA está expandido — RouterLink y el botón de cancelar quedan
               como dos hijos flex de este <li>, y items-end los asienta por
               su borde inferior (el mismo que ya usa -mb-5 la losa) en vez de
               estirarlos verticalmente (default stretch). -->
          <li
            v-for="(item, index) in items"
            :key="item.name"
            :ref="(el) => setDesktopItemRef(el as Element | null, index)"
            :class="item.name === 'workout' && ctaExpanded && 'flex items-end gap-1'"
          >
            <RouterLink
              :to="{ name: item.name }"
              class="flex flex-col items-center gap-1 px-3 py-2 text-ink-faint hover:text-ink"
              active-class="text-aurora"
              @click="onCtaClick($event, item.name)"
            >
              <span class="text-xs tracking-wide">{{ $t(item.label) }}</span>
              <!-- item 8: h-12 (fijo, EN LAS 3 estados: runa/countdown/expandido)
                   + flex items-center justify-center en vez del viejo p-2.5 —
                   antes el alto salía de content-box + padding, así que un
                   countdown más alto que la runa (o que envolviera línea)
                   estiraba la losa entera y con ella el navbar completo. Ahora
                   el alto es una caja fija y el contenido (runa o texto) se
                   centra DENTRO, nunca la redimensiona. px-2.5 (solo
                   horizontal, no vertical): el ancho SÍ puede crecer con el
                   contenido (countdown más ancho que la runa) — ver
                   whitespace-nowrap en el span del countdown, más abajo. -->
              <span :class="item.name === 'workout' && 'bk-slab relative -mb-5 h-12 px-2.5 flex items-center justify-center border-aurora text-aurora'">
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
                       la vez. whitespace-nowrap (item 8): el countdown NUNCA
                       envuelve línea — con el alto ya fijo (h-12), envolver
                       recortaría la segunda línea en vez de estirar la losa
                       (que es justo el bug que h-12 evita), así que el ancho
                       crece en su lugar. -->
                  <Transition name="bk-fade" mode="out-in">
                    <span
                      v-if="resting"
                      key="timer"
                      data-testid="cta-timer"
                      class="bk-metric relative text-sm whitespace-nowrap"
                    >{{ timer.label }}</span>
                    <BkRune v-else key="rune" :name="item.rune" :size="26" :carve="true" class="relative" />
                  </Transition>
                </template>
                <BkRune v-else :name="item.rune" :size="20" :carve="false" class="relative" />
              </span>
            </RouterLink>
            <!-- item 6: botón de cancelar — SIBLING de RouterLink, nunca
                 anidado dentro (un <button> dentro de un <a> es HTML
                 inválido, contenido interactivo dentro de interactivo).
                 Mismo acabado bk-slab/-mb-5/h-12 que la losa principal: dos
                 losas cortas y pegadas (gap-1) leen como una sola superficie
                 que "se abrió", no como un control ajeno pegado al lado. -->
            <Transition name="bk-pop-soft">
              <button
                v-if="item.name === 'workout' && ctaExpanded"
                type="button"
                data-testid="cta-cancel-rest"
                class="bk-press bk-slab -mb-5 h-12 px-2 flex items-center justify-center border-aurora text-aurora"
                :aria-label="$t('timer.cancelRest')"
                @click="cancelRestFromCta"
              >
                ✕
              </button>
            </Transition>
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
          <!-- item 6: flex-1 se conserva SIEMPRE (las 5 columnas del bottom
               nav siguen midiendo 1/5 cada una — el indicador deslizante
               depende de esa aritmética, ver translateX arriba); items-start
               (cuando el CTA está expandido) asienta RouterLink + el botón
               de cancelar por su borde SUPERIOR, el mismo que ya usa -mt-5
               la losa (aquí sobresale hacia ARRIBA, al revés que en desktop). -->
          <li
            v-for="item in items"
            :key="item.name"
            :ref="(el) => setMobileItemRef(el as Element | null, item.name)"
            class="flex-1"
            :class="item.name === 'workout' && ctaExpanded && 'flex items-start justify-center gap-1'"
          >
            <RouterLink
              :to="{ name: item.name }"
              class="flex flex-col items-center gap-1 py-2 text-ink-faint"
              active-class="text-aurora"
              @click="onCtaClick($event, item.name)"
            >
              <span
                :class="item.name === 'workout' && 'bk-slab relative -mt-5 h-12 px-2.5 flex items-center justify-center border-aurora text-aurora'"
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
                  <!-- swap rune<->countdown, mismo criterio que en desktop
                       (bk-fade entry-only + whitespace-nowrap, ver el
                       why-comment largo de la versión desktop de arriba) -->
                  <Transition name="bk-fade" mode="out-in">
                    <span
                      v-if="resting"
                      key="timer"
                      data-testid="cta-timer"
                      class="bk-metric relative text-sm whitespace-nowrap"
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
            <!-- item 6: botón de cancelar, SIBLING de RouterLink (mismo
                 motivo que en desktop: button dentro de a es HTML inválido) -->
            <Transition name="bk-pop-soft">
              <button
                v-if="item.name === 'workout' && ctaExpanded"
                type="button"
                data-testid="cta-cancel-rest-mobile"
                class="bk-press bk-slab -mt-5 h-12 px-2 flex items-center justify-center border-aurora text-aurora"
                :aria-label="$t('timer.cancelRest')"
                @click="cancelRestFromCta"
              >
                ✕
              </button>
            </Transition>
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
         real, DENTRO del wrapper, no a un padding de <main>).
         item 14 (v0.4.3, zurdi): el modelo de scroll interno se generaliza a TODAS las
         vistas (antes solo Perfil/Progresión) — cada vista ahora se acota a sí misma
         (h-full/flex-1 min-h-0/overflow-y-auto en su propia raíz, ver TodayView/
         CalendarView/WorkoutView/WorkoutEditView/ProfileView/ProgressView) y nunca
         debería desbordar el wrapper de abajo. overflow-y-auto se queda AQUÍ de todos
         modos, sin quitarlo ni "simplificarlo": (1) sigue siendo la caja cuyo tamaño
         resuelto necesita el wrapper de abajo (h-[calc(100%-6rem)]) como referencia de
         altura — esa cadena no cambia, la usan TODAS las vistas ahora, no solo las que
         antes tenían su propio h-full; (2) queda como red de seguridad silenciosa: si
         alguna vista futura olvida acotarse a sí misma, su contenido desborda hacia AQUÍ
         en vez de recortarse sin más — overflow visible sería peor (contenido tapado por
         el navbar fijo, el bug original que motivó todo este modelo). En el uso normal,
         con cada vista ya acotada, <main> mismo no llega a necesitar scrollear. -->
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

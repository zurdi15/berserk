<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import { useRoute } from 'vue-router'

import { useI18n } from 'vue-i18n'

import BkRune from '@/lib/BkRune.vue'
import type { RuneName } from '@/lib/runes'
import AthleteBanner from '@/components/shell/AthleteBanner.vue'
import { attachNetListeners, onBackOnline, online } from '@/offline/net'
import * as outbox from '@/offline/outbox'
import { useActiveWorkoutStore } from '@/stores/activeWorkout'
import { useRestTimerStore } from '@/stores/restTimer'
import { useToastStore } from '@/stores/toast'

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
const { t } = useI18n()
const timer = useRestTimerStore()
const activeWorkout = useActiveWorkoutStore()

// v0.5.0 (zurdi revoca el scroll interno por vista del item 14): <main>
// vuelve a ser el ÚNICO contenedor de scroll de la app y las vistas fluyen.
// El reset de scroll al cambiar de sección ya no llega gratis (antes cada
// vista remontaba su propio scroller a 0 vía RouterView) — se hace aquí,
// explícito, sobre el PATH: el hash queda fuera a propósito, las pestañas
// ancladas en URL (useTabHash) cambian hash sin cambiar de sección y cada
// vista con pestañas resetea lo suyo (ver resetMainScroll en las vistas).
// Asignación directa a scrollTop (no scrollTo()): mismo efecto y los
// entornos de test (happy-dom) la soportan sin mock.
const mainEl = ref<HTMLElement | null>(null)
watch(() => route.path, () => {
  if (mainEl.value) mainEl.value.scrollTop = 0
})

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

// v0.6.0 offline: el shell es quien cablea la sincronización — listeners de
// red (una vez), replay al recuperar conexión, drenado al arrancar (si la
// PWA murió en el gym con cola pendiente), y el resultado del drenado como
// toast + refresh del entreno (los ids temporales del snapshot pasan a ser
// reales en el servidor; resume() con la cola ya vacía trae el estado final)
let disposeBackOnline: (() => void) | null = null
let disposeDrained: (() => void) | null = null

onMounted(() => {
  updateIndicator()
  window.addEventListener('resize', updateIndicator)
  document.addEventListener('pointerdown', onDocumentPointerDown)

  attachNetListeners()
  outbox.refreshPendingCount()
  disposeBackOnline = onBackOnline(() => {
    outbox.syncNow()
  })
  disposeDrained = outbox.onDrained(async ({ synced, conflicts }) => {
    if (conflicts > 0) {
      useToastStore().push('error', t('offline.syncConflicts', { n: conflicts }))
    } else if (synced > 0) {
      useToastStore().push('info', t('offline.synced'))
    }
    // el snapshot local puede tener ids temporales: con la cola vacía, el
    // servidor ya es la verdad completa
    await activeWorkout.resume()
  })
  if (navigator.onLine) outbox.syncNow()
})
onUnmounted(() => {
  window.removeEventListener('resize', updateIndicator)
  document.removeEventListener('pointerdown', onDocumentPointerDown)
  if (ctaCollapseTimer) clearTimeout(ctaCollapseTimer)
  disposeBackOnline?.()
  disposeDrained?.()
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
    <!-- v0.6.0 offline: banda de estado — visible sin red o con cola
         pendiente; desaparece sola al drenar. Informativa, no interactiva:
         la sincronización es automática (ver onMounted) y un botón de
         "reintentar" solo duplicaría lo que los triggers ya hacen. -->
    <div
      v-if="!online || outbox.pendingCount.value > 0"
      class="border-b border-line bg-stone px-4 py-1.5 text-center text-xs text-ink-muted"
      data-testid="offline-chip"
    >
      <template v-if="!online">
        {{ t('offline.badge') }}<template v-if="outbox.pendingCount.value > 0"> · {{ t('offline.pending', { n: outbox.pendingCount.value }) }}</template>
      </template>
      <template v-else>{{ t('offline.syncing') }}</template>
    </div>
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
    <!-- v0.5.0 — EL MODELO DE SCROLL, tercera y (esperemos) última iteración.
         Historia comprimida: v0.4.0-0.4.2 = <main> scrollea y las vistas fluyen,
         con un spacer/calc reservando el hueco del navbar (dos expresiones de la
         misma reserva, cada tipo de vista usaba una); v0.4.3 (item 14) = zurdi
         pide tabs siempre visibles y se generaliza el scroll INTERNO por vista
         (cadena h-[calc]/h-full/flex-1) — 3 regresiones en 4 releases (0.4.1,
         0.4.3, 0.4.4: padding tras altura fija, referencias de % y doble
         reserva vía flex-shrink); v0.5.0 = zurdi lo revoca ("scroll normal de
         página, las tabs visibles se consiguen con position fija o algo así").
         Modelo actual: <main> es el ÚNICO scroller de la app, A ANCHO COMPLETO
         (la columna centrada vive en el wrapper de abajo) — su scrollbar pinta
         en el borde real de la ventana en desktop (requisito v0.4.0) y en móvil
         es overlay nativo (base.css confina el estilo aurora a punteros finos).
         Las vistas FLUYEN (altura por contenido, sin acotarse) y su chrome
         (tiras de tabs, nav de mes, header de entreno) se pega arriba con
         sticky top-0 contra este scrollport — sticky exige que ningún ancestro
         intermedio tenga overflow propio ni transform retenido (las entradas
         bk-stagger usan fill backwards: el transform se limpia al terminar).
         El scroll interno sobrevive SOLO en cajas hoja con su propia altura
         (lista del picker de Entrenos, overlays/sheets) — nunca como cadena
         de referencias de altura entre niveles. -->
    <main ref="mainEl" class="flex-1 min-h-0 overflow-y-auto bk-scroll-stable w-full">
      <!-- v0.5.0: wrapper de FLUJO puro — columna centrada, altura por
           contenido, sin calc ni flex-col ni spacer (toda la saga de alturas
           0.4.1→0.4.4 está resumida en el comentario de <main>). pb-24 como
           padding vuelve a ser CORRECTO aquí: el bug histórico del padding
           ("se reserva tras la altura resuelta, no tras el desborde") solo
           mordía porque la caja tenía altura FIJA — con altura auto la caja
           TERMINA donde termina el contenido y el padding queda siempre
           después de él, reservando el hueco del navbar móvil fijo. -->
      <div class="max-w-3xl mx-auto w-full px-4 pt-4 pb-24">
        <!-- sin Transition aquí a propósito (item 4): esto envolvía la vista
             ENTERA en un fade bk-rise MIENTRAS su propio bk-stagger interno
             corría con su propio delay — dos sistemas de animación a la vez,
             el viewport se veía negro los primeros ~80ms tras navegar porque
             las opacidades de ambos se multiplican. Cada vista es dueña de su
             única animación de entrada ahora (bk-stagger/bk-rise propio, o
             ninguna si no hace falta) — ver auditoría por vista en el informe. -->
        <RouterView />
      </div>
    </main>
  </div>
</template>

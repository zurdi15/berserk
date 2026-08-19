<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'

import { useI18n } from 'vue-i18n'

import BkRune from '@/lib/BkRune.vue'
import type { RuneName } from '@/lib/runes'
import StatusBanners from '@/components/shell/StatusBanners.vue'
import { attachNetListeners, onBackOnline } from '@/offline/net'
import * as outbox from '@/offline/outbox'
import { useActiveWorkoutStore } from '@/stores/activeWorkout'
import { useRestTimerStore } from '@/stores/restTimer'
import { useToastStore } from '@/stores/toast'
import { checkNativeShellUpdate, ensureNativeNotificationPermission, isNativeShell } from '@/utils/nativeShell'
// v0.16.0: la versión del bundle (verdad de build, ver SettingsCard.vue) —
// contra ella se compara la versionName del shell para avisar de APK nueva
import { version as appVersion } from '../../package.json'

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
const router = useRouter()
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
// v0.10.0 (zurdi): al llegar el countdown a 0 solo, el CTA muestra una fase
// de "¡hecho!" (✓ con pulso y glow a tope) durante la gracia del store antes
// de fundir a la runa — en vez de un 0:00 que se esfumaba de golpe. La X de
// cancelar se pliega YA en esta fase (no queda nada que cancelar), así el
// estrechado animado ocurre mientras el ✓ celebra, no a la vez que la runa.
const timerFinished = computed(() => timer.finished)

// v0.7.0 (zurdi revoca el expandir-para-cancelar del item 6/v0.4.3: "cuando
// haces click, la X aparece en otro elemento distinto — mejor una X roja a
// la derecha del propio timer, sin tener que hacer click para que
// aparezca"): mientras se descansa, la losa del CTA contiene DOS botones —
// el countdown (navega a /workout) y la X roja de cancelar, siempre visible.
// Para poder anidar la X dentro de la losa, el item de entreno deja de ser
// un RouterLink (un <button> dentro de un <a> es HTML inválido — la
// restricción que forzó la píldora adyacente del diseño anterior) y pasa a
// ser una losa <div> con botones que navegan por router.push. El aparato
// entero de expandir/colapsar (ctaExpanded, auto-colapso, listener de
// document) muere con esto.
function goWorkout() {
  if (route.name !== 'workout') router.push({ name: 'workout' })
}

function cancelRest() {
  timer.clear()
}

// v0.9.0 (zurdi: "molaría que hacer swipe a derecha o izquierda cambie de
// sección"): gesto horizontal sobre <main> navega al item anterior/siguiente
// del nav (sin dar la vuelta en los extremos). Guardas para no secuestrar
// gestos legítimos: (1) el arrastre debe ser claramente horizontal (≥60px y
// el doble que su componente vertical); (2) se ignora si empieza sobre un
// scroller horizontal (tiras de tabs con overflow, heatmap) — se detecta
// subiendo por el DOM hasta <main>; (3) se ignora sobre el chart (uPlot
// tiene drag propio) e inputs. Listeners passive: nunca bloquean el scroll.
let swipeStartX = 0
let swipeStartY = 0
let swipeEligible = false

function hasHorizontalScroller(start: Element | null): boolean {
  let el: Element | null = start
  while (el && el !== mainEl.value) {
    if (el.scrollWidth > el.clientWidth + 4) {
      const overflowX = getComputedStyle(el).overflowX
      if (overflowX === 'auto' || overflowX === 'scroll') return true
    }
    el = el.parentElement
  }
  return false
}

function onMainTouchStart(event: TouchEvent) {
  const touch = event.touches[0]
  if (!touch) return
  swipeStartX = touch.clientX
  swipeStartY = touch.clientY
  const target = event.target as Element | null
  swipeEligible =
    !target?.closest('.u-wrap, canvas, input, textarea, [data-no-swipe]') &&
    !hasHorizontalScroller(target)
}

function onMainTouchEnd(event: TouchEvent) {
  if (!swipeEligible) return
  const touch = event.changedTouches[0]
  if (!touch) return
  const dx = touch.clientX - swipeStartX
  const dy = touch.clientY - swipeStartY
  if (Math.abs(dx) < 60 || Math.abs(dx) < Math.abs(dy) * 2) return
  const target = items[activeIndex.value + (dx < 0 ? 1 : -1)]
  if (target) router.push({ name: target.name })
}

// item 3 (v0.3.0, addendum zurdi): jerarquía del glow del CTA —
// ruta /workout activa (opacity 1, ya existía) > entreno en curso en otra
// ruta (opacity tenue) > apagado. Mientras se descansa, el countdown de
// arriba ya es la señal; mantener ADEMÁS el glow de "en curso" ahí compite
// con el propio countdown, así que ese nivel se apaga durante el descanso.
const workoutGlowOpacity = computed(() => {
  // v0.10.0: el glow sube a tope durante la fase de "descanso terminado" —
  // parte del feedback de fin que pidió zurdi, en cualquier ruta
  if (timerFinished.value) return 1
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

  // v0.13.2 shell Android: pedir el permiso de notificaciones UNA vez al
  // arrancar (momento claro de UX) en vez de en mitad del primer descanso;
  // si está denegado, avisar cómo activarlo — sin él no hay cronómetros ni
  // aviso de fin de descanso
  if (isNativeShell()) {
    void ensureNativeNotificationPermission().then((granted) => {
      if (!granted) useToastStore().push('error', t('app.notificationsDenied'))
    })
    // v0.16.0 (zurdi: "que la propia apk te avise para actualizarse"): el
    // bundle (siempre al día, viene del servidor) detecta un shell viejo y
    // avisa; la descarga vive en Perfil → Sistema (SettingsCard)
    void checkNativeShellUpdate(appVersion).then(({ available }) => {
      if (available) useToastStore().push('info', t('app.shellUpdateAvailable'))
    })
  }

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
          <li
            v-for="(item, index) in items"
            :key="item.name"
            :ref="(el) => setDesktopItemRef(el as Element | null, index)"
          >
            <!-- v0.7.0: el item de entreno YA NO es un RouterLink — es una
                 losa <div> con botones dentro (countdown navega, X cancela),
                 ver el why-comment largo del script. h-12 fijo (item 8): el
                 alto nunca cambia entre runa/countdown/countdown+X; el ANCHO
                 sí, y la X anima el suyo al entrar/salir (bk-cta-x). -->
            <div
              v-if="item.name === 'workout'"
              class="flex flex-col items-center gap-1 px-3 py-2"
              :class="route.name === 'workout' ? 'text-aurora' : 'text-ink-faint hover:text-ink'"
            >
              <span class="text-sm">{{ $t(item.label) }}</span>
              <div class="bk-slab rounded-md relative -mb-5 h-12 flex items-stretch border-aurora text-aurora" data-testid="cta-slab">
                <!-- sin respirar (revertido): una sola capa, apagada por defecto,
                     que funde a opacity 1 cuando /workout está activo -->
                <span
                  class="absolute inset-0 rounded-md shadow-(--bk-shadow-aurora)"
                  :style="{ opacity: workoutGlowOpacity, transition: 'opacity var(--bk-dur-3) var(--bk-ease-out)' }"
                  aria-hidden="true"
                  data-testid="workout-glow"
                />
                <button
                  type="button"
                  class="bk-press relative px-2.5 flex items-center justify-center"
                  :aria-label="$t(item.label)"
                  @click="goWorkout"
                >
                  <!-- swap rune<->countdown: out-in para que la runa entre sola
                       tras salir el countdown — y como BkRune monta con carve,
                       la runa se RE-TALLA al volver.
                       whitespace-nowrap (item 8): el countdown nunca envuelve
                       línea; el ancho crece en su lugar. -->
                  <!-- v0.11.4 (zurdi revocó el ✓ de la v0.10.0): al llegar a 0
                       el countdown SALE en bk-cta-melt (difumina + su ancho
                       colapsa al hueco de la runa, la losa se estrecha durante
                       la salida) y la runa entra tallándose sobre la losa ya
                       del tamaño final; el glow a tope de la gracia se queda -->
                  <Transition name="bk-cta-melt" mode="out-in">
                    <span
                      v-if="resting && !timerFinished"
                      key="timer"
                      data-testid="cta-timer"
                      class="bk-metric text-sm whitespace-nowrap"
                    >{{ timer.label }}</span>
                    <BkRune v-else key="rune" :name="item.rune" :size="26" :carve="true" />
                  </Transition>
                </button>
                <!-- v0.7.0: X roja SIEMPRE visible mientras se descansa; se
                     pliega YA en la fase finished (nada que cancelar) -->
                <Transition name="bk-cta-x">
                  <button
                    v-if="resting && !timerFinished"
                    type="button"
                    data-testid="cta-cancel-rest"
                    class="bk-press relative flex items-center text-danger"
                    :aria-label="$t('timer.cancelRest')"
                    @click="cancelRest"
                  >
                    <span class="pr-2.5 pl-0.5">✕</span>
                  </button>
                </Transition>
              </div>
            </div>
            <RouterLink
              v-else
              :to="{ name: item.name }"
              class="flex flex-col items-center gap-1 px-3 py-2 text-ink-faint hover:text-ink"
              active-class="text-aurora"
            >
              <span class="text-sm">{{ $t(item.label) }}</span>
              <span><BkRune :name="item.rune" :size="20" :carve="false" class="relative" /></span>
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
    <!-- facelift: las tres bandas de estado (atleta/act-as/offline) viven
         agrupadas en StatusBanners — una franja, no tres barras sueltas -->
    <StatusBanners />
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
          <!-- flex-1 SIEMPRE: las 5 columnas del bottom nav miden 1/5 cada
               una — el indicador deslizante depende de esa aritmética -->
          <li v-for="item in items" :key="item.name" class="flex-1">
            <!-- v0.7.0: item de entreno como losa de botones, igual que en
                 desktop (ver why-comment del script y de la versión desktop) -->
            <div
              v-if="item.name === 'workout'"
              class="flex flex-col items-center gap-1 py-2.5"
              :class="route.name === 'workout' ? 'text-aurora' : 'text-ink-faint'"
            >
              <div class="bk-slab rounded-md relative -mt-5 h-12 flex items-stretch border-aurora text-aurora" data-testid="cta-slab-mobile">
                <!-- mismo criterio que en desktop: una capa, opacity 0/1 -->
                <span
                  class="absolute inset-0 rounded-md shadow-(--bk-shadow-aurora)"
                  :style="{ opacity: workoutGlowOpacity, transition: 'opacity var(--bk-dur-3) var(--bk-ease-out)' }"
                  aria-hidden="true"
                  data-testid="workout-glow"
                />
                <button
                  type="button"
                  class="bk-press relative px-2.5 flex items-center justify-center"
                  :aria-label="$t(item.label)"
                  @click="goWorkout"
                >
                  <!-- v0.11.4: countdown → runa directo vía bk-cta-melt, ver desktop -->
                  <Transition name="bk-cta-melt" mode="out-in">
                    <span
                      v-if="resting && !timerFinished"
                      key="timer"
                      data-testid="cta-timer"
                      class="bk-metric text-sm whitespace-nowrap"
                    >{{ timer.label }}</span>
                    <BkRune v-else key="rune" :name="item.rune" :size="26" :carve="true" />
                  </Transition>
                </button>
                <Transition name="bk-cta-x">
                  <button
                    v-if="resting && !timerFinished"
                    type="button"
                    data-testid="cta-cancel-rest-mobile"
                    class="bk-press relative flex items-center text-danger"
                    :aria-label="$t('timer.cancelRest')"
                    @click="cancelRest"
                  >
                    <span class="pr-2.5 pl-0.5">✕</span>
                  </button>
                </Transition>
              </div>
              <span class="text-2xs tracking-wide">{{ $t(item.label) }}</span>
            </div>
            <RouterLink
              v-else
              :to="{ name: item.name }"
              class="flex flex-col items-center gap-1 py-2.5 text-ink-faint"
              active-class="text-aurora"
            >
              <span><BkRune :name="item.rune" :size="22" :carve="false" class="relative" /></span>
              <!-- revertido (round 7, zurdi): se probó ocultar las inactivas
                   (sr-only + fade solo en la activa), pero con el token a
                   0.7rem las 5 etiquetas leen bien tal cual — vuelta al clásico -->
              <span class="text-2xs tracking-wide">{{ $t(item.label) }}</span>
            </RouterLink>
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
    <main
      ref="mainEl"
      class="flex-1 min-h-0 overflow-y-auto bk-scroll-stable w-full"
      @touchstart.passive="onMainTouchStart"
      @touchend.passive="onMainTouchEnd"
    >
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
        <!-- v0.17.0 (zurdi: "no desmontar el entrenamiento para que cargue
             instantáneo al volver"): SOLO WorkoutView se mantiene viva entre
             navegaciones — volver al entreno pinta el DOM retenido al
             instante en vez de repetir catálogo+resume+stagger. El resto de
             vistas siguen remontando (su reset de scroll/estado por remount
             es comportamiento deseado). WorkoutView refresca en fondo vía
             onActivated (ver esa vista). -->
        <RouterView v-slot="{ Component }">
          <KeepAlive include="WorkoutView">
            <component :is="Component" />
          </KeepAlive>
        </RouterView>
      </div>
    </main>
  </div>
</template>

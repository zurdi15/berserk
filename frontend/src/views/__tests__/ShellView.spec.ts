import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { describe, expect, it, beforeEach, vi } from 'vitest'
import { createMemoryHistory, createRouter, type Router } from 'vue-router'

// v0.21.4: el splash de arranque real esperaría 700ms de mínimo en CADA
// mount — mockeado inerte para toda la batería (sus specs propios viven en
// utils/__tests__/bootSplash.spec.ts); el ref se flipa a mano en los tests
// del splash de abajo
vi.mock('@/utils/bootSplash', async () => {
  const { ref } = await import('vue')
  return {
    bootSplashActive: ref(false),
    runBootSplash: vi.fn(),
  }
})

import { createI18nInstance } from '../../i18n'
import BkRune from '@/lib/BkRune.vue'
import { useActiveWorkoutStore } from '@/stores/activeWorkout'
import { useRestTimerStore } from '@/stores/restTimer'
import { bootSplashActive, runBootSplash } from '@/utils/bootSplash'
import ShellView from '../ShellView.vue'

// router mínimo, propio de este test: las 5 secciones del shell como rutas
// planas (sin anidar bajo ShellView, que es justo lo que se está montando
// aquí a mano) — necesario para que RouterLink resuelva aria-current y las
// clases activas de verdad, cosa que un stub de RouterLink no puede dar
function buildRouter(initialName: string): Router {
  const stub = { template: '<div data-testid="routed-view" />' }
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/today', name: 'today', component: stub },
      { path: '/calendar', name: 'calendar', component: stub },
      { path: '/workout', name: 'workout', component: stub },
      // v0.21.4: mismo meta.section que la ruta real — el nav debe tratar el
      // pre-inicio como la sección de Entreno
      { path: '/workout/start/:routineId', name: 'workout-start', component: stub, meta: { section: 'workout' } },
      { path: '/progress', name: 'progress', component: stub },
      { path: '/profile', name: 'profile', component: stub },
    ],
  })
  if (initialName === 'workout-start') router.push({ name: initialName, params: { routineId: 1 } })
  else router.push({ name: initialName })
  return router
}

// compartido por los describes de abajo (activo/CTA/glow): monta el shell ya
// resuelto en la ruta pedida, con el mismo set de stubs
function mountWithRoute(name: string) {
  const router = buildRouter(name)
  return router.isReady().then(() =>
    mount(ShellView, {
      global: {
        plugins: [router, createI18nInstance()],
        stubs: { RouterView: true, AthleteBanner: true },
      },
    }),
  )
}

describe('ShellView nav', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('has desktop nav bar (hidden sm:block) centered with vertical-stack items', async () => {
    // ShellView usa useRoute() (item 3, índice activo del indicador): sin un
    // router real inyectado y resuelto, la injection falla incluso con
    // RouterLink stubbeado
    const router = buildRouter('today')
    await router.isReady()
    const wrapper = mount(ShellView, {
      global: {
        plugins: [router, createI18nInstance()],
        stubs: { RouterView: true, RouterLink: true },
      },
    })
    const headers = wrapper.findAll('header')
    expect(headers).toHaveLength(1)
    // desktop header: centered nav bar only (identity removed por ahora)
    const desktopHeader = headers[0]
    expect(desktopHeader.classes()).toContain('hidden')
    expect(desktopHeader.classes()).toContain('sm:block')
    const desktopNav = desktopHeader.find('nav')
    expect(desktopNav.attributes('aria-label')).toBe('Navegación principal')
    // desktop nav ul is centered
    const ul = desktopNav.find('ul')
    expect(ul.classes()).toContain('flex')
    expect(ul.classes()).toContain('justify-center')
    const listItems = ul.findAll('li')
    expect(listItems.length).toBeGreaterThan(0)
  })

  it('has mobile fixed bottom nav (no identity header)', async () => {
    const router = buildRouter('today')
    await router.isReady()
    const wrapper = mount(ShellView, {
      global: {
        plugins: [router, createI18nInstance()],
        stubs: { RouterView: true, RouterLink: true },
      },
    })
    const navs = wrapper.findAll('nav')
    expect(navs).toHaveLength(2)
    // mobile bottom nav: fixed, sm:hidden, icon on top label below (por ahora sin cabecera)
    const mobileNav = navs[1]
    expect(mobileNav.attributes('aria-label')).toBe('Navegación principal')
    expect(mobileNav.classes()).toContain('sm:hidden')
    expect(mobileNav.classes()).toContain('fixed')
    const ul = mobileNav.find('ul')
    const listItems = ul.findAll('li')
    expect(listItems.length).toBeGreaterThan(0)
  })

  it('renders AthleteBanner (TimerPill retired in v0.3.0: the CTA itself is now the persistent countdown surface, see item 1 below)', async () => {
    const router = buildRouter('today')
    await router.isReady()
    const wrapper = mount(ShellView, {
      global: {
        plugins: [router, createI18nInstance()],
        stubs: { RouterView: true, RouterLink: true, AthleteBanner: true },
      },
    })
    expect(wrapper.findComponent({ name: 'AthleteBanner' }).exists()).toBe(true)
    expect(wrapper.findComponent({ name: 'TimerPill' }).exists()).toBe(false)
  })

  // item 6 (post-0.3.0): el gutter estable se movió del html (global, ver
  // base.css) a este <main>, que es donde el scroll ocurre de verdad ahora
  it('item 6: the scrolling <main> carries bk-scroll-stable, so switching between a short and a tall view does not shift content width', async () => {
    const router = buildRouter('today')
    await router.isReady()
    const wrapper = mount(ShellView, {
      global: {
        plugins: [router, createI18nInstance()],
        stubs: { RouterView: true, RouterLink: true, AthleteBanner: true },
      },
    })
    const main = wrapper.get('main')
    expect(main.classes()).toContain('bk-scroll-stable')
    expect(main.classes()).toContain('overflow-y-auto')
  })

  // item 3 (v0.4.0, scrollbar): <main> pasa a ancho completo (su scrollbar
  // pinta en el borde real de la ventana) y la columna centrada se mueve a un
  // v0.21.4 (zurdi: "prefetch de las 5 secciones + splashart mientras
  // carga"): el shell arranca el splash al montar; mientras está activo el
  // RouterView no se monta (la vista de aterrizaje espera a la caché
  // caliente) y el overlay cubre la app
  describe('v0.21.4 boot splash', () => {
    it('kicks off the boot splash + prefetch on mount', async () => {
      vi.mocked(runBootSplash).mockClear()
      await mountWithRoute('today')
      expect(runBootSplash).toHaveBeenCalledTimes(1)
    })

    it('while the splash is active, the overlay shows and the RouterView is NOT mounted', async () => {
      bootSplashActive.value = true
      try {
        const wrapper = await mountWithRoute('today')
        expect(wrapper.find('[data-testid="boot-splash"]').exists()).toBe(true)
        expect(wrapper.find('router-view-stub').exists()).toBe(false)
      } finally {
        bootSplashActive.value = false
      }
    })

    it('once the splash clears, the overlay goes and the RouterView mounts', async () => {
      const wrapper = await mountWithRoute('today')
      expect(wrapper.find('[data-testid="boot-splash"]').exists()).toBe(false)
      expect(wrapper.find('router-view-stub').exists()).toBe(true)
    })
  })

  // v0.21.4 (zurdi: "en el pre-inicio debería seleccionarse la sección de
  // entrenamiento, no Hoy"): meta.section manda sobre route.name en el nav
  describe('v0.21.4 active section on child routes', () => {
    it('workout-start highlights the Entreno CTA and slides the indicator to its column', async () => {
      const wrapper = await mountWithRoute('workout-start')
      // el indicador móvil apunta a la columna 2 (workout), no a la 0 (today)
      const indicator = wrapper.get('[data-testid="nav-indicator"]')
      expect(indicator.attributes('style')).toContain('translateX(200%)')
      // y la losa del CTA va en aurora, como si estuvieras en /workout
      const ctaWrap = wrapper.get('[data-testid="cta-slab-mobile"]').element.parentElement!
      expect(ctaWrap.className).toContain('text-aurora')
    })
  })

  // v0.17.0 act-as: banda persistente mientras un admin actúa como otro
  // usuario (leída del storage al montar; salir recarga vía utils/actAs.ts)
  it('v0.17.0: shows the act-as banner when the mode is stored, hides it otherwise', async () => {
    localStorage.setItem('bk:act-as', JSON.stringify({ id: 7, username: 'loki' }))
    const withMode = await mountWithRoute('today')
    expect(withMode.find('[data-testid="act-as-banner"]').exists()).toBe(true)
    expect(withMode.find('[data-testid="act-as-banner"]').text()).toContain('loki')
    withMode.unmount()

    localStorage.removeItem('bk:act-as')
    const withoutMode = await mountWithRoute('today')
    expect(withoutMode.find('[data-testid="act-as-banner"]').exists()).toBe(false)
  })

  // <div> interno que envuelve RouterView y hereda el px/py que antes llevaba
  // <main> directamente
  it("item 3: <main> is full-width (no max-w-3xl/mx-auto of its own) and an inner wrapper div carries the centered column + a definite flex context for RouterView", async () => {
    const router = buildRouter('today')
    await router.isReady()
    const wrapper = mount(ShellView, {
      global: {
        plugins: [router, createI18nInstance()],
        stubs: { RouterView: true, RouterLink: true, AthleteBanner: true },
      },
    })
    const main = wrapper.get('main')
    expect(main.classes()).not.toContain('max-w-3xl')
    expect(main.classes()).not.toContain('mx-auto')
    expect(main.classes()).toContain('w-full')

    // v0.5.0 (modelo de scroll único): el wrapper es FLUJO puro — columna
    // centrada con pb-24 como reserva del navbar (correcto con altura auto:
    // el padding queda siempre tras el contenido real, ver ShellView.vue).
    // Toda la saga calc/spacer/flex-col (v0.4.1→v0.4.4) queda fijada aquí en
    // negativo para que ninguna de sus piezas vuelva "por simetría".
    const innerWrapper = main.get('div')
    expect(innerWrapper.classes()).toContain('max-w-3xl')
    expect(innerWrapper.classes()).toContain('mx-auto')
    expect(innerWrapper.classes()).toContain('w-full')
    expect(innerWrapper.classes()).toContain('pb-24')
    expect(innerWrapper.classes()).not.toContain('h-[calc(100%-6rem)]')
    expect(innerWrapper.classes()).not.toContain('h-full')
    expect(innerWrapper.classes()).not.toContain('min-h-full')
    expect(innerWrapper.classes()).not.toContain('flex')
    expect(innerWrapper.find('[data-testid="mobile-nav-clearance"]').exists()).toBe(false)
  })

  // v0.5.0: <main> persiste entre rutas (ya no hay scrollers por vista que
  // nazcan en 0 al remontar) — ShellView resetea su scrollTop observando
  // route.path. El hash queda fuera: las pestañas ancladas en URL
  // (useTabHash) no deben resetear la página al cambiar de tab.
  // v0.9.0 (zurdi): swipe horizontal sobre <main> navega entre secciones —
  // los eventos táctiles se fabrican a mano (happy-dom no trae TouchEvent)
  it('v0.9.0: a horizontal swipe on <main> navigates to the adjacent section; a vertical drag does not', async () => {
    const router = buildRouter('today')
    await router.isReady()
    const wrapper = mount(ShellView, {
      global: {
        plugins: [router, createI18nInstance()],
        stubs: { RouterView: true, RouterLink: true, AthleteBanner: true },
      },
    })
    const main = wrapper.get('main').element

    const touch = (type: string, x: number, y: number) => {
      const event = new Event(type) as Event & { touches: unknown[]; changedTouches: unknown[] }
      event.touches = [{ clientX: x, clientY: y }]
      event.changedTouches = [{ clientX: x, clientY: y }]
      main.dispatchEvent(event)
    }

    // swipe a la izquierda: hoy → calendario (siguiente en el orden del nav)
    touch('touchstart', 300, 400)
    touch('touchend', 150, 410)
    await flushPromises()
    expect(router.currentRoute.value.name).toBe('calendar')

    // arrastre vertical (scroll normal): no navega
    touch('touchstart', 200, 200)
    touch('touchend', 180, 500)
    await flushPromises()
    expect(router.currentRoute.value.name).toBe('calendar')

    // swipe a la derecha: calendario → hoy
    touch('touchstart', 150, 400)
    touch('touchend', 320, 395)
    await flushPromises()
    expect(router.currentRoute.value.name).toBe('today')

    // en el extremo izquierdo, swipe a la derecha no da la vuelta
    touch('touchstart', 150, 400)
    touch('touchend', 320, 395)
    await flushPromises()
    expect(router.currentRoute.value.name).toBe('today')
  })

  it('v0.5.0: navigating to another section resets <main> scrollTop; a hash-only change does not', async () => {
    const router = buildRouter('today')
    await router.isReady()
    const wrapper = mount(ShellView, {
      global: {
        plugins: [router, createI18nInstance()],
        stubs: { RouterView: true, RouterLink: true, AthleteBanner: true },
      },
    })
    const main = wrapper.get('main').element

    main.scrollTop = 240
    router.push({ name: 'calendar' })
    await flushPromises()
    expect(main.scrollTop).toBe(0)

    main.scrollTop = 180
    router.push({ hash: '#records' })
    await flushPromises()
    expect(main.scrollTop).toBe(180)
  })
})

describe('ShellView active section indicator (item 3, round 9)', () => {
  beforeEach(() => setActivePinia(createPinia()))

  it('marks the active RouterLink with aria-current="page" on both bars (real RouterLink, no stub)', async () => {
    const wrapper = await mountWithRoute('calendar')
    await flushPromises()

    const activeLinks = wrapper.findAll('a[aria-current="page"]')
    // una barra desktop + una móvil: dos links activos, ambos apuntando a "calendar"
    expect(activeLinks).toHaveLength(2)
    expect(activeLinks[0].text()).toContain('Calendario')
    expect(activeLinks[1].text()).toContain('Calendario')
  })

  it('mobile sliding indicator: translateX matches the active route index (progress = 3rd index of 5)', async () => {
    const wrapper = await mountWithRoute('progress')
    await flushPromises()

    const indicator = wrapper.find('[data-testid="nav-indicator"]')
    expect(indicator.attributes('style')).toContain('translateX(300%)')
  })

  it('mobile sliding indicator: sits at index 0 for "today"', async () => {
    const wrapper = await mountWithRoute('today')
    await flushPromises()

    const indicator = wrapper.find('[data-testid="nav-indicator"]')
    expect(indicator.attributes('style')).toContain('translateX(0%)')
  })

  // item 1 (v0.4.0): los subrayados por item se retiran — reemplazados por el
  // indicador deslizante único de abajo (nav-indicator-desktop), igual patrón
  // que el de móvil
  it('desktop nav: no per-item underline remains anywhere, active or not', async () => {
    const wrapper = await mountWithRoute('progress')
    await flushPromises()

    expect(wrapper.findAll('[data-testid="nav-underline"]')).toHaveLength(0)
  })

  it('route=workout: the mobile sliding bar stays mounted but fades to opacity 0 (no instant pop)', async () => {
    const wrapper = await mountWithRoute('workout')
    await flushPromises()

    // ya no se desmonta (round 7: crossfade en vez de v-if) — sigue en el DOM,
    // oculto a los lectores de pantalla y con opacity 0 para el fundido
    const indicator = wrapper.get('[data-testid="nav-indicator"]')
    expect(indicator.attributes('aria-hidden')).toBe('true')
    expect(indicator.attributes('style')).toContain('opacity: 0')
  })

  // item 2 (v0.4.0): la fila de items desktop se alinea por abajo (no
  // stretch) para que label+runa asienten en la línea del border-b del
  // header en vez de "flotar" a media barra — ver comentario en ShellView.vue
  it('item 2: the desktop nav row aligns items to the bottom (items-end) and the header is the positioning context for the indicator', async () => {
    const wrapper = await mountWithRoute('progress')
    await flushPromises()

    const desktopHeader = wrapper.findAll('header')[0]
    expect(desktopHeader.classes()).toContain('relative')
    const ul = desktopHeader.get('ul')
    expect(ul.classes()).toContain('items-end')
    expect(ul.classes()).toContain('justify-center')
  })

  // item 1 (v0.4.0): indicador deslizante también en desktop — sigue el mismo
  // contrato visual que el de móvil (montado siempre, crossfade en /workout)
  // pero medido en px (offsetLeft/offsetWidth del item activo) porque los
  // items son de ancho variable, no columnas iguales
  it('item 1: desktop sliding indicator sits bottom-0 of the header and mirrors the mobile bar\'s opacity crossfade (hidden on /workout, visible elsewhere)', async () => {
    const onWorkout = await mountWithRoute('workout')
    await flushPromises()
    const workoutIndicator = onWorkout.get('[data-testid="nav-indicator-desktop"]')
    expect(workoutIndicator.classes()).toContain('bottom-0')
    expect(workoutIndicator.attributes('aria-hidden')).toBe('true')
    expect(workoutIndicator.attributes('style')).toContain('opacity: 0')

    const onToday = await mountWithRoute('today')
    await flushPromises()
    expect(onToday.get('[data-testid="nav-indicator-desktop"]').attributes('style')).toContain('opacity: 1')
  })

  it('item 1: desktop sliding indicator transform/width track the active item\'s measured offsetLeft/offsetWidth and update on route change (jsdom has no real layout — offsetLeft/offsetWidth stubbed per <li>)', async () => {
    const wrapper = await mountWithRoute('today')
    await flushPromises()

    const desktopItems = wrapper.findAll('header')[0].findAll('li')
    expect(desktopItems).toHaveLength(5)
    // geometría determinista y distinta por item: índice i -> left i*120, width 80+i*4
    desktopItems.forEach((li, i) => {
      Object.defineProperty(li.element, 'offsetLeft', { configurable: true, value: i * 120 })
      Object.defineProperty(li.element, 'offsetWidth', { configurable: true, value: 80 + i * 4 })
    })

    // progress = índice 3 de 5 (today, calendar, workout, progress, profile)
    await wrapper.vm.$router.push({ name: 'progress' })
    await flushPromises()

    const indicator = wrapper.get('[data-testid="nav-indicator-desktop"]')
    expect(indicator.attributes('style')).toContain('translateX(360px)') // 3 * 120
    expect(indicator.attributes('style')).toContain('width: 92px') // 80 + 3*4
  })

  it('item 1: desktop sliding indicator recomputes on window resize and cleans up the listener on unmount', async () => {
    const addSpy = vi.spyOn(window, 'addEventListener')
    const removeSpy = vi.spyOn(window, 'removeEventListener')
    const wrapper = await mountWithRoute('today')
    await flushPromises()

    expect(addSpy).toHaveBeenCalledWith('resize', expect.any(Function))
    const resizeCall = addSpy.mock.calls.find(([event]) => event === 'resize')
    expect(resizeCall).toBeTruthy()
    const handler = resizeCall![1]

    wrapper.unmount()
    expect(removeSpy).toHaveBeenCalledWith('resize', handler)
  })

  it('route=workout: the CTA glow fades in to full opacity on both bars (no breathing anymore — reverted to a single transition-driven layer)', async () => {
    const wrapper = await mountWithRoute('workout')
    await flushPromises()

    const glows = wrapper.findAll('[data-testid="workout-glow"]')
    expect(glows).toHaveLength(2) // desktop + móvil
    // M8: la clase bk-breathe ya no existe en ningún sitio (ni en
    // animations.css ni en ningún consumidor) desde que se quitó la
    // respiración — un "not.toContain" aquí sería tautológico, no una
    // prueba real; lo que sí prueba algo es la opacidad asentada
    expect(glows[0].attributes('style')).toContain('opacity: 1')
    expect(glows[1].attributes('style')).toContain('opacity: 1')
  })

  it('route=today: the mobile sliding bar is fully visible (opacity 1) and the CTA glow is faded out (opacity 0, off by default)', async () => {
    const wrapper = await mountWithRoute('today')
    await flushPromises()

    const indicator = wrapper.get('[data-testid="nav-indicator"]')
    expect(indicator.attributes('style')).toContain('opacity: 1')

    const glows = wrapper.findAll('[data-testid="workout-glow"]')
    expect(glows).toHaveLength(2)
    expect(glows[0].attributes('style')).toContain('opacity: 0')
    expect(glows[1].attributes('style')).toContain('opacity: 0')
  })

  it('mobile bottom bar: all 5 labels stay visible regardless of which section is active (active-only-label experiment was reverted)', async () => {
    const wrapper = await mountWithRoute('progress')
    await flushPromises()

    const mobileNav = wrapper.findAll('nav')[1]
    const labels = mobileNav.findAll('li span.text-2xs')
    expect(labels).toHaveLength(5)
    labels.forEach((label) => {
      expect(label.classes()).not.toContain('sr-only')
      expect(label.text().length).toBeGreaterThan(0)
    })
  })

  it('item 4: RouterView renders the matched view directly, with no bk-rise Transition wrapper around it', async () => {
    // RouterView SIN stub a propósito: el stub oculta justo lo que hay que
    // comprobar (si el contenido routeado lleva o no clases de Transition)
    const router = buildRouter('today')
    await router.isReady()
    const wrapper = mount(ShellView, {
      global: {
        plugins: [router, createI18nInstance()],
        stubs: { AthleteBanner: true },
      },
    })
    await flushPromises()

    // el bug era exactamente esto: la vista routeada entraba con
    // bk-rise-enter-active (el Transition del router) MIENTRAS su propio
    // bk-stagger interno corría con su propio delay — sin el Transition, la
    // vista routeada no debe llevar ninguna clase de entrada del router
    const routedView = wrapper.find('[data-testid="routed-view"]')
    expect(routedView.exists()).toBe(true)
    expect(routedView.classes()).not.toContain('bk-rise-enter-active')
    expect(routedView.classes()).not.toContain('bk-rise-enter-from')
  })
})

describe('ShellView CTA rest countdown takeover (item 1, v0.3.0)', () => {
  beforeEach(() => setActivePinia(createPinia()))

  it('shows the rune by default, swaps to the m:ss countdown while resting (route+store montados de verdad), and reverts when the timer clears', async () => {
    const wrapper = await mountWithRoute('today')
    await flushPromises()

    // en reposo: 10 runas (5 items x 2 barras desktop+móvil), sin countdown
    expect(wrapper.findAllComponents(BkRune)).toHaveLength(10)
    expect(wrapper.findAll('[data-testid="cta-timer"]')).toHaveLength(0)

    useRestTimerStore().start(90)
    await flushPromises()

    // descansando: el CTA de cada barra deja el hueco de la runa al countdown
    const countdowns = wrapper.findAll('[data-testid="cta-timer"]')
    expect(countdowns).toHaveLength(2) // desktop + móvil
    countdowns.forEach((c) => expect(c.text()).toBe('1:30'))
    // las 2 runas del CTA (una por barra) desaparecen; quedan las 8 del resto de items
    expect(wrapper.findAllComponents(BkRune)).toHaveLength(8)

    useRestTimerStore().clear()
    await flushPromises()

    expect(wrapper.findAll('[data-testid="cta-timer"]')).toHaveLength(0)
    expect(wrapper.findAllComponents(BkRune)).toHaveLength(10)
  })

  // v0.7.0: el CTA ya no es un RouterLink (la losa contiene DOS botones —
  // countdown que navega por router.push y la X de cancelar) — la navegación
  // se comprueba clicando el botón del countdown
  it('v0.7.0: tapping the countdown button navigates to /workout while resting', async () => {
    const wrapper = await mountWithRoute('today')
    useRestTimerStore().start(30)
    await flushPromises()

    const timer = wrapper.get('[data-testid="cta-timer"]')
    await timer.trigger('click')
    await flushPromises()

    expect(wrapper.vm.$route.name).toBe('workout')
  })
})

// item 8 (v0.4.3, zurdi): la losa del CTA nunca cambia de ALTO — antes el
// countdown (más alto o que envolvía línea que la runa) estiraba la losa
// entera y con ella el navbar completo. h-12 fijo en runa y countdown+X;
// el ancho SÍ puede crecer (y la X lo anima al entrar/salir, ver bk-cta-x).
describe('ShellView CTA fixed height (item 8, v0.4.3)', () => {
  beforeEach(() => setActivePinia(createPinia()))

  it('the CTA slab carries the fixed h-12 height class in the rune state (idle, no rest active)', async () => {
    const wrapper = await mountWithRoute('today')
    await flushPromises()

    const slabs = wrapper.findAll('[data-testid="workout-glow"]').map((glow) => glow.element.parentElement!)
    expect(slabs).toHaveLength(2)
    for (const slab of slabs) {
      expect(slab.classList.contains('h-12')).toBe(true)
      expect(slab.classList.contains('flex')).toBe(true)
    }
  })

  it('the CTA slab keeps the SAME h-12 class while showing the countdown + X (resting)', async () => {
    const wrapper = await mountWithRoute('today')
    useRestTimerStore().start(90)
    await flushPromises()

    const timers = wrapper.findAll('[data-testid="cta-timer"]')
    expect(timers).toHaveLength(2)
    for (const timer of timers) {
      const slab = timer.element.closest('.bk-slab')!
      expect(slab.classList.contains('h-12')).toBe(true)
      // whitespace-nowrap: el countdown nunca envuelve línea (envolver
      // recortaría la 2ª línea dentro del h-12 fijo en vez de estirar la
      // losa, que es justo el bug que h-12 evita)
      expect(timer.classes()).toContain('whitespace-nowrap')
    }
  })
})

// v0.7.0 (zurdi revoca el expandir-para-cancelar del item 6): la X roja de
// cancelar vive SIEMPRE visible dentro de la losa mientras se descansa —
// sin tap previo, en cualquier ruta — y el countdown es un botón que navega.
describe('ShellView CTA always-visible cancel X (v0.7.0)', () => {
  beforeEach(() => setActivePinia(createPinia()))

  it('the red X is visible in both bars whenever resting, on any route, without any prior tap', async () => {
    const wrapper = await mountWithRoute('today')
    await flushPromises()
    expect(wrapper.findAll('[data-testid^="cta-cancel-rest"]')).toHaveLength(0)

    useRestTimerStore().start(90)
    await flushPromises()

    const cancels = wrapper.findAll('[data-testid^="cta-cancel-rest"]')
    expect(cancels).toHaveLength(2) // desktop + móvil
    for (const btn of cancels) {
      expect(btn.classes()).toContain('text-danger')
      expect(btn.attributes('aria-label')).toBe('Cancelar descanso')
      // la X vive DENTRO de la misma losa que el countdown (ya no es una
      // píldora adyacente): mismo .bk-slab ancestro
      expect(btn.element.closest('.bk-slab')).not.toBeNull()
    }
  })

  it('tapping the X clears the rest timer and the X leaves with it (also when the timer ends on its own)', async () => {
    const wrapper = await mountWithRoute('workout')
    const restTimer = useRestTimerStore()
    restTimer.start(90)
    await flushPromises()

    await wrapper.get('[data-testid="cta-cancel-rest"]').trigger('click')
    await flushPromises()
    expect(restTimer.active).toBe(false)
    expect(wrapper.findAll('[data-testid^="cta-cancel-rest"]')).toHaveLength(0)

    // el timer muriendo solo (llega a 0) también retira la X
    restTimer.start(30)
    await flushPromises()
    expect(wrapper.findAll('[data-testid^="cta-cancel-rest"]')).toHaveLength(2)
    restTimer.clear()
    await flushPromises()
    expect(wrapper.findAll('[data-testid^="cta-cancel-rest"]')).toHaveLength(0)
  })

  it('while NOT resting there is no X and the slab holds the rune', async () => {
    const wrapper = await mountWithRoute('workout')
    await flushPromises()
    expect(wrapper.findAll('[data-testid^="cta-cancel-rest"]')).toHaveLength(0)
    expect(wrapper.findAll('[data-testid="cta-timer"]')).toHaveLength(0)
  })
})

describe('ShellView CTA workout-in-progress glow (item 3, v0.3.0 addendum)', () => {
  beforeEach(() => setActivePinia(createPinia()))

  it('no active workout: the glow stays off', async () => {
    const wrapper = await mountWithRoute('today')
    await flushPromises()

    const glows = wrapper.findAll('[data-testid="workout-glow"]')
    expect(glows[0].attributes('style')).toContain('opacity: 0')
    expect(glows[1].attributes('style')).toContain('opacity: 0')
  })

  it('workout in progress on a different route: the glow sits at the dim in-progress level (0.4), below the full route-active level', async () => {
    const wrapper = await mountWithRoute('today')
    useActiveWorkoutStore().workout = { id: 1 } as never
    await flushPromises()

    const glows = wrapper.findAll('[data-testid="workout-glow"]')
    expect(glows[0].attributes('style')).toContain('opacity: 0.4')
    expect(glows[1].attributes('style')).toContain('opacity: 0.4')
  })

  it('on the workout route itself: full glow (1) regardless of in-progress state — route-active wins the hierarchy', async () => {
    const wrapper = await mountWithRoute('workout')
    useActiveWorkoutStore().workout = { id: 1 } as never
    await flushPromises()

    const glows = wrapper.findAll('[data-testid="workout-glow"]')
    expect(glows[0].attributes('style')).toContain('opacity: 1')
    expect(glows[1].attributes('style')).toContain('opacity: 1')
  })

  it('workout in progress AND resting: the countdown takeover wins — in-progress glow is suppressed while resting', async () => {
    const wrapper = await mountWithRoute('today')
    useActiveWorkoutStore().workout = { id: 1 } as never
    useRestTimerStore().start(30)
    await flushPromises()

    const glows = wrapper.findAll('[data-testid="workout-glow"]')
    expect(glows[0].attributes('style')).toContain('opacity: 0')
    expect(glows[1].attributes('style')).toContain('opacity: 0')
    expect(wrapper.findAll('[data-testid="cta-timer"]')).toHaveLength(2)
  })
})

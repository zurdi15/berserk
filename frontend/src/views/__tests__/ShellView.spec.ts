import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { describe, expect, it, beforeEach, vi } from 'vitest'
import { createMemoryHistory, createRouter, type Router } from 'vue-router'

import { createI18nInstance } from '../../i18n'
import BkRune from '@/lib/BkRune.vue'
import { useActiveWorkoutStore } from '@/stores/activeWorkout'
import { useRestTimerStore } from '@/stores/restTimer'
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
      { path: '/progress', name: 'progress', component: stub },
      { path: '/profile', name: 'profile', component: stub },
    ],
  })
  router.push({ name: initialName })
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
  // <div> interno que envuelve RouterView y hereda el px/py que antes llevaba
  // <main> directamente
  it("item 3: <main> is full-width (no max-w-3xl/mx-auto of its own) and an inner wrapper div carries the centered column + h-full flex context for RouterView", async () => {
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
    // pb-24 (hueco del navbar móvil fijo) se queda en <main>, no en el wrapper
    expect(main.classes()).toContain('pb-24')

    const innerWrapper = main.get('div')
    expect(innerWrapper.classes()).toContain('max-w-3xl')
    expect(innerWrapper.classes()).toContain('mx-auto')
    expect(innerWrapper.classes()).toContain('w-full')
    // h-full (no min-h-full): es lo que le da a ProgressView (y cualquier vista
    // con su propio h-full) una referencia de altura DEFINIDA para resolver su
    // porcentaje — min-height por sí solo no propaga esa referencia a los hijos
    // (verificado en real, ver comentario en ShellView.vue)
    expect(innerWrapper.classes()).toContain('h-full')
    expect(innerWrapper.classes()).toContain('flex')
    expect(innerWrapper.classes()).toContain('flex-col')
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

  it('the CTA still navigates to /workout while resting (route behavior unchanged)', async () => {
    const wrapper = await mountWithRoute('today')
    useRestTimerStore().start(30)
    await flushPromises()

    const link = wrapper.findAll('a').find((a) => a.attributes('href') === '/workout')
    expect(link).toBeTruthy()
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

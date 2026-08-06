import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { describe, expect, it, beforeEach } from 'vitest'
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

  it('desktop underline: scales in on the active item, excluding "workout" which never gets one', async () => {
    const wrapper = await mountWithRoute('progress')
    await flushPromises()

    // 4 subrayados, no 5: "workout" (CTA) nunca lleva subrayado, activo o no
    const underlines = wrapper.findAll('[data-testid="nav-underline"]')
    expect(underlines).toHaveLength(4)
    // orden de items sin "workout": today, calendar, progress, profile
    expect(underlines[0].classes()).toContain('scale-x-0')
    expect(underlines[1].classes()).toContain('scale-x-0')
    expect(underlines[2].classes()).toContain('scale-x-100') // progress, activo
    expect(underlines[3].classes()).toContain('scale-x-0')
  })

  it('route=workout: the mobile sliding bar stays mounted but fades to opacity 0 (no instant pop), and the desktop underline never renders for the CTA item', async () => {
    const wrapper = await mountWithRoute('workout')
    await flushPromises()

    // ya no se desmonta (round 7: crossfade en vez de v-if) — sigue en el DOM,
    // oculto a los lectores de pantalla y con opacity 0 para el fundido
    const indicator = wrapper.get('[data-testid="nav-indicator"]')
    expect(indicator.attributes('aria-hidden')).toBe('true')
    expect(indicator.attributes('style')).toContain('opacity: 0')
    // 4 subrayados (today/calendar/progress/profile): ninguno para "workout"
    expect(wrapper.findAll('[data-testid="nav-underline"]')).toHaveLength(4)
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

import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { describe, expect, it, beforeEach } from 'vitest'
import { createMemoryHistory, createRouter, type Router } from 'vue-router'

import { createI18nInstance } from '../../i18n'
import ShellView from '../ShellView.vue'

// router mínimo, propio de este test: las 5 secciones del shell como rutas
// planas (sin anidar bajo ShellView, que es justo lo que se está montando
// aquí a mano) — necesario para que RouterLink resuelva aria-current y las
// clases activas de verdad, cosa que un stub de RouterLink no puede dar
function buildRouter(initialName: string): Router {
  const stub = { template: '<div />' }
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

  it('renders TimerPill and AthleteBanner components', async () => {
    const router = buildRouter('today')
    await router.isReady()
    const wrapper = mount(ShellView, {
      global: {
        plugins: [router, createI18nInstance()],
        stubs: { RouterView: true, RouterLink: true, TimerPill: true, AthleteBanner: true },
      },
    })
    expect(wrapper.findComponent({ name: 'TimerPill' }).exists()).toBe(true)
    expect(wrapper.findComponent({ name: 'AthleteBanner' }).exists()).toBe(true)
  })
})

describe('ShellView active section indicator (item 3)', () => {
  beforeEach(() => setActivePinia(createPinia()))

  function mountWithRoute(name: string) {
    const router = buildRouter(name)
    return router.isReady().then(() =>
      mount(ShellView, {
        global: {
          plugins: [router, createI18nInstance()],
          stubs: { RouterView: true, TimerPill: true, AthleteBanner: true },
        },
      }),
    )
  }

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

  it('route=workout: the mobile sliding bar is absent and the desktop underline never renders for the CTA item', async () => {
    const wrapper = await mountWithRoute('workout')
    await flushPromises()

    expect(wrapper.find('[data-testid="nav-indicator"]').exists()).toBe(false)
    // 4 subrayados (today/calendar/progress/profile): ninguno para "workout"
    expect(wrapper.findAll('[data-testid="nav-underline"]')).toHaveLength(4)
  })

  it('route=workout: the CTA glow is static (full opacity, no bk-breathe) on both bars', async () => {
    const wrapper = await mountWithRoute('workout')
    await flushPromises()

    const glows = wrapper.findAll('[data-testid="workout-glow"]')
    expect(glows).toHaveLength(2) // desktop + móvil
    expect(glows[0].classes()).not.toContain('bk-breathe')
    expect(glows[1].classes()).not.toContain('bk-breathe')
  })

  it('route=today: the mobile sliding bar is visible and the CTA glow keeps breathing on both bars', async () => {
    const wrapper = await mountWithRoute('today')
    await flushPromises()

    expect(wrapper.find('[data-testid="nav-indicator"]').exists()).toBe(true)

    const glows = wrapper.findAll('[data-testid="workout-glow"]')
    expect(glows).toHaveLength(2)
    expect(glows[0].classes()).toContain('bk-breathe')
    expect(glows[1].classes()).toContain('bk-breathe')
  })
})

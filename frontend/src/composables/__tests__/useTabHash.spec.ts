import { mount } from '@vue/test-utils'
import { defineComponent, h } from 'vue'
import { createMemoryHistory, createRouter, type Router } from 'vue-router'
import { describe, expect, it } from 'vitest'

import { useTabHash } from '@/composables/useTabHash'

// useTabHash es fundamentalmente dependiente del router: se prueba contra
// un router REAL (memory history), no mockeado — complementa (no repite) las
// pruebas de integración de ProfileView/ProgressView, que sí mockean
// router.replace para comprobar la llamada exacta.
function buildRouter(): Router {
  return createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/x', component: { template: '<div/>' } }],
  })
}

function mountHost(router: Router, defaultTab: string, validTabs: () => string[]) {
  let tab!: ReturnType<typeof useTabHash>
  const Comp = defineComponent({
    setup() {
      tab = useTabHash(defaultTab, validTabs)
      return () => h('div', tab.value)
    },
  })
  const wrapper = mount(Comp, { global: { plugins: [router] } })
  return { wrapper, tab }
}

describe('useTabHash', () => {
  it('defaults to defaultTab when the URL has no hash', async () => {
    const router = buildRouter()
    await router.push('/x')
    const { tab } = mountHost(router, 'a', () => ['a', 'b'])
    expect(tab.value).toBe('a')
  })

  it('reads the initial tab from the URL hash on mount', async () => {
    const router = buildRouter()
    await router.push('/x#b')
    const { tab } = mountHost(router, 'a', () => ['a', 'b'])
    expect(tab.value).toBe('b')
  })

  it('falls back to defaultTab for a hash outside validTabs (junk hash)', async () => {
    const router = buildRouter()
    await router.push('/x#not-a-tab')
    const { tab } = mountHost(router, 'a', () => ['a', 'b'])
    expect(tab.value).toBe('a')
  })

  it('validTabs is a function re-evaluated on each hash read (e.g. #admin), not a list captured once at mount', async () => {
    const router = buildRouter()
    await router.push('/x')
    let allowed = ['a']
    const { tab } = mountHost(router, 'a', () => allowed)

    await router.push('/x#b')
    expect(tab.value).toBe('a') // 'b' todavía no es válido: cae al default

    allowed = ['a', 'b']
    // un push al MISMO hash no dispara el watcher (vue-router deduplica la
    // navegación a la ubicación actual) — se pasa por un hash intermedio
    // distinto para forzar una re-lectura real
    await router.push('/x#a')
    await router.push('/x#b')
    expect(tab.value).toBe('b')
  })

  it('setting the ref updates the URL hash', async () => {
    const router = buildRouter()
    await router.push('/x')
    const { tab } = mountHost(router, 'a', () => ['a', 'b'])

    tab.value = 'b'
    await router.isReady()
    await new Promise((resolve) => setTimeout(resolve, 0))

    expect(router.currentRoute.value.hash).toBe('#b')
  })

  it('re-syncs from a hash change driven externally (e.g. browser back/forward)', async () => {
    const router = buildRouter()
    await router.push('/x#a')
    const { tab } = mountHost(router, 'a', () => ['a', 'b'])
    expect(tab.value).toBe('a')

    await router.push('/x#b')
    expect(tab.value).toBe('b')
  })

  it('corrects an invalid initial hash in the URL itself (not just in-memory state)', async () => {
    const router = buildRouter()
    await router.push('/x#junk')
    mountHost(router, 'a', () => ['a', 'b'])
    await new Promise((resolve) => setTimeout(resolve, 0))

    expect(router.currentRoute.value.hash).toBe('#a')
  })
})

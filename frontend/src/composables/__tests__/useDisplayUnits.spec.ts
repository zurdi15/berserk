import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it } from 'vitest'
import { defineComponent, h } from 'vue'

import { useDisplayUnits } from '@/composables/useDisplayUnits'
import { useAthleteStore } from '@/stores/athlete'
import { useAuthStore } from '@/stores/auth'

// useDisplayUnits depende de Pinia (stores) y de reactividad de composición:
// se monta en un componente mínimo real en vez de invocarse fuera de contexto
function mountUnits() {
  let units!: ReturnType<typeof useDisplayUnits>
  const Comp = defineComponent({
    setup() {
      units = useDisplayUnits()
      return () => h('div', units.value)
    },
  })
  const wrapper = mount(Comp)
  return { wrapper, units }
}

describe('useDisplayUnits', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('defaults to kg with no logged-in user and nobody being viewed', () => {
    const { units } = mountUnits()
    expect(units.value).toBe('kg')
  })

  it("falls back to the logged-in user's own units when not viewing an athlete", () => {
    useAuthStore().user = { id: 1, username: 'me', is_admin: false, locale: 'es', units: 'lb', timezone: 'UTC' } as never
    const { units } = mountUnits()
    expect(units.value).toBe('lb')
  })

  it("prefers the viewed athlete's units over the logged-in user's own", () => {
    useAuthStore().user = { id: 1, username: 'me', is_admin: false, locale: 'es', units: 'lb', timezone: 'UTC' } as never
    useAthleteStore().view({ id: 7, username: 'other', is_admin: false, locale: 'es', units: 'kg', timezone: 'UTC' })
    const { units } = mountUnits()
    expect(units.value).toBe('kg')
  })
})

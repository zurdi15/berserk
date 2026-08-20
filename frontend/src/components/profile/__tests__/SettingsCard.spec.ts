import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { createI18nInstance } from '@/i18n'
import { useAuthStore } from '@/stores/auth'
import { useToastStore } from '@/stores/toast'
import SettingsCard from '../SettingsCard.vue'

vi.mock('@/api/auth', () => ({
  updateSettings: vi.fn((partial) => Promise.resolve({
    id: 1,
    username: 'test',
    is_admin: false,
    locale: partial.locale || 'es',
    units: partial.units || 'kg',
    timezone: partial.timezone || 'UTC',
    color: 'color' in partial ? partial.color : null,
  })),
}))

// v0.4.0: el picker de tema es puramente de cliente — mockeado para
// verificar CON QUÉ se llama, sin depender de localStorage/DOM reales
vi.mock('@/utils/theme', () => ({
  setTheme: vi.fn(),
}))

describe('SettingsCard', () => {
  let wrapper: VueWrapper | null = null

  beforeEach(() => {
    setActivePinia(createPinia())
    const auth = useAuthStore()
    auth.user = {
      id: 1,
      username: 'test',
      is_admin: false,
      locale: 'es',
      units: 'kg',
      timezone: 'UTC',
      color: null,
    }
  })

  afterEach(() => {
    wrapper?.unmount()
    wrapper = null
  })

  function build() {
    wrapper = mount(SettingsCard, {
      global: { plugins: [createI18nInstance()] },
      attachTo: document.body,
    })
    return wrapper
  }

  it('changes units to lb and calls updateSettings', async () => {
    const { updateSettings } = await import('@/api/auth')
    vi.mocked(updateSettings).mockClear()
    build()

    // BkSelect v2 (round 7): ya no es un <select> nativo — abrir el listbox
    // y hacer click real sobre la opción "lb"
    const unitsTrigger = wrapper!.get('[data-testid="units-select"] [role="combobox"]')
    await unitsTrigger.trigger('click')

    const lbOption = Array.from(document.querySelectorAll('[role="option"]'))
      .find((o) => o.textContent?.trim() === 'lb') as HTMLElement
    expect(lbOption).not.toBeUndefined()
    lbOption.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await flushPromises()

    expect(updateSettings).toHaveBeenCalledWith({ units: 'lb' })

    const toast = useToastStore()
    expect(toast.toasts.length).toBeGreaterThan(0)
  })

  it('changes locale to English via the listbox and calls updateSettings', async () => {
    const { updateSettings } = await import('@/api/auth')
    vi.mocked(updateSettings).mockClear()
    build()

    const localeTrigger = wrapper!.get('[data-testid="locale-select"] [role="combobox"]')
    await localeTrigger.trigger('click')

    const englishOption = Array.from(document.querySelectorAll('[role="option"]'))
      .find((o) => o.textContent?.trim() === 'English') as HTMLElement
    expect(englishOption).not.toBeUndefined()
    englishOption.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await flushPromises()

    expect(updateSettings).toHaveBeenCalledWith({ locale: 'en' })
  })

  it('the timezone select renders the filter input automatically (its catalog has well over 15 entries)', async () => {
    build()

    const tzTrigger = wrapper!.get('[data-testid="timezone-select"] [role="combobox"]')
    await tzTrigger.trigger('click')

    expect(document.querySelector('input[type="text"]')).not.toBeNull()
    // el catálogo real de Intl.supportedValuesOf('timeZone') es enorme:
    // muy por encima del umbral de 15 que activa el filtro
    expect(document.querySelectorAll('[role="option"]').length).toBeGreaterThan(15)
  })

  it('filtering the timezone list and picking a zone calls updateSettings with that timezone', async () => {
    const { updateSettings } = await import('@/api/auth')
    vi.mocked(updateSettings).mockClear()
    build()

    const tzTrigger = wrapper!.get('[data-testid="timezone-select"] [role="combobox"]')
    await tzTrigger.trigger('click')

    const filterInput = document.querySelector('input[type="text"]') as HTMLInputElement
    filterInput.value = 'Europe/Madrid'
    filterInput.dispatchEvent(new Event('input', { bubbles: true }))
    await flushPromises()

    const madridOption = Array.from(document.querySelectorAll('[role="option"]'))
      .find((o) => o.textContent?.trim() === 'Europe/Madrid') as HTMLElement
    expect(madridOption).not.toBeUndefined()
    madridOption.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await flushPromises()

    expect(updateSettings).toHaveBeenCalledWith({ timezone: 'Europe/Madrid' })
  })

  // v0.27.0: el picker de color YA NO vive aquí — se mudó a AccountCard
  // (sección Cuenta) junto al resto de la identidad; sus tests, con él
  it('no longer owns the user-color picker (moved to AccountCard)', () => {
    build()

    expect(wrapper!.find('[data-testid="color-swatch-default"]').exists()).toBe(false)
    expect(wrapper!.findAll('[data-testid="color-swatch"]')).toHaveLength(0)
  })

  describe('v0.4.0: theme picker (Oscuro / Claro / Sistema)', () => {
    it('defaults to "Sistema" (the select shows the system option) when nothing was persisted yet', () => {
      build()
      const themeSelect = wrapper!.get('[data-testid="theme-select"] [role="combobox"]')
      expect(themeSelect.text()).toContain('Sistema')
    })

    it('picking "Claro" calls setTheme("light") — a purely client-side effect, never the backend updateSettings call the rest of this card uses', async () => {
      const { updateSettings } = await import('@/api/auth')
      vi.mocked(updateSettings).mockClear()
      const { setTheme } = await import('@/utils/theme')
      vi.mocked(setTheme).mockClear()
      build()

      const themeTrigger = wrapper!.get('[data-testid="theme-select"] [role="combobox"]')
      await themeTrigger.trigger('click')

      const lightOption = Array.from(document.querySelectorAll('[role="option"]'))
        .find((o) => o.textContent?.trim() === 'Claro') as HTMLElement
      expect(lightOption).not.toBeUndefined()
      lightOption.dispatchEvent(new MouseEvent('click', { bubbles: true }))
      await flushPromises()

      expect(setTheme).toHaveBeenCalledWith('light')
      expect(updateSettings).not.toHaveBeenCalled()
    })

    it('picking "Oscuro" calls setTheme("dark")', async () => {
      const { setTheme } = await import('@/utils/theme')
      vi.mocked(setTheme).mockClear()
      build()

      const themeTrigger = wrapper!.get('[data-testid="theme-select"] [role="combobox"]')
      await themeTrigger.trigger('click')

      const darkOption = Array.from(document.querySelectorAll('[role="option"]'))
        .find((o) => o.textContent?.trim() === 'Oscuro') as HTMLElement
      darkOption.dispatchEvent(new MouseEvent('click', { bubbles: true }))
      await flushPromises()

      expect(setTheme).toHaveBeenCalledWith('dark')
    })
  })

  // v0.14.2: la versión del bundle visible en Sistema (semver, no valor
  // exacto — el spec no debe romperse en cada bump)
  it('shows the deployed app version (semver)', () => {
    const wrapper = build()
    expect(wrapper.get('[data-testid="app-version"]').text()).toMatch(/^berserk v\d+\.\d+\.\d+/)
  })

})

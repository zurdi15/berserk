import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { createI18nInstance } from '@/i18n'
import { useAuthStore } from '@/stores/auth'
import { useToastStore } from '@/stores/toast'
import { USER_COLOR_SWATCHES } from '@/tokens/userColors'
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

  it('renders the default swatch plus one per curated color', () => {
    build()

    expect(wrapper!.find('[data-testid="color-swatch-default"]').exists()).toBe(true)
    expect(wrapper!.findAll('[data-testid="color-swatch"]')).toHaveLength(USER_COLOR_SWATCHES.length)
  })

  it('picking a preset swatch calls updateSettings with that hex', async () => {
    const { updateSettings } = await import('@/api/auth')
    vi.mocked(updateSettings).mockClear()
    build()

    await wrapper!.findAll('[data-testid="color-swatch"]')[0].trigger('click')
    await flushPromises()

    expect(updateSettings).toHaveBeenCalledWith({ color: USER_COLOR_SWATCHES[0] })
  })

  it('picking the default option clears the color back to null (the theme aurora)', async () => {
    const { updateSettings } = await import('@/api/auth')
    vi.mocked(updateSettings).mockClear()
    build()

    await wrapper!.get('[data-testid="color-swatch-default"]').trigger('click')
    await flushPromises()

    expect(updateSettings).toHaveBeenCalledWith({ color: null })
  })
})

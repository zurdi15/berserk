import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { createI18nInstance } from '@/i18n'
import { useAuthStore } from '@/stores/auth'
import SettingsCard from '../SettingsCard.vue'

vi.mock('@/api/auth', () => ({ updateSettings: vi.fn() }))
vi.mock('@/utils/theme', () => ({ setTheme: vi.fn() }))
// v0.28.0 reloj: dentro de la shell, la tarjeta pregunta por el enlace con el
// Galaxy Watch — spec aparte de SettingsCard.spec.ts para no convertir en
// "shell" todos los tests de la tarjeta
vi.mock('@/utils/nativeShell', () => ({
  isNativeShell: () => true,
  checkNativeShellUpdate: vi.fn().mockResolvedValue({ available: false, shellVersion: '0.28.0' }),
  openNativeShellDownload: vi.fn(),
  getWearStatus: vi.fn(),
}))

describe('SettingsCard — estado del reloj (shell)', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    useAuthStore().user = {
      id: 1,
      username: 'test',
      is_admin: false,
      locale: 'es',
      units: 'kg',
      timezone: 'UTC',
      color: null,
    }
  })

  async function mountWith(status: unknown) {
    const { getWearStatus } = await import('@/utils/nativeShell')
    vi.mocked(getWearStatus).mockResolvedValue(status as never)
    const wrapper = mount(SettingsCard, { global: { plugins: [createI18nInstance()] } })
    await flushPromises()
    return wrapper
  }

  it('reloj con la app de berserk: "vinculado" con su nombre', async () => {
    const wrapper = await mountWith({ playServices: true, connected: true, appInstalled: true, watchName: 'Galaxy Watch8' })
    expect(wrapper.find('[data-testid="wear-status"]').text()).toContain('Galaxy Watch8')
  })

  it('reloj conectado sin la app, o ningún reloj: se informa sin nombre', async () => {
    const withoutApp = await mountWith({ playServices: true, connected: true, appInstalled: false, watchName: 'Galaxy Watch8' })
    const withoutAppText = withoutApp.find('[data-testid="wear-status"]').text()
    expect(withoutAppText).not.toContain('Galaxy Watch8')
    const none = await mountWith({ playServices: true, connected: false, appInstalled: false, watchName: null })
    const noneText = none.find('[data-testid="wear-status"]').text()
    expect(noneText.length).toBeGreaterThan(0)
    expect(noneText).not.toBe(withoutAppText)
  })

  it('sin Play Services o sin respuesta del plugin: no se pinta nada', async () => {
    const noPlay = await mountWith({ playServices: false, connected: false, appInstalled: false, watchName: null })
    expect(noPlay.find('[data-testid="wear-status"]').exists()).toBe(false)
    const unknown = await mountWith(null)
    expect(unknown.find('[data-testid="wear-status"]').exists()).toBe(false)
  })
})

import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { createI18nInstance } from '@/i18n'
import { useAuthStore } from '@/stores/auth'
import { useToastStore } from '@/stores/toast'
import { USER_COLOR_SWATCHES } from '@/tokens/userColors'
import AccountCard from '../AccountCard.vue'

// v0.27.0: la sección Cuenta — identidad (foto, nombre, color). El picker de
// color y sus tests vienen de SettingsCard, que se queda solo con la web app
vi.mock('@/api/auth', () => ({
  updateSettings: vi.fn((partial) => Promise.resolve({
    id: 1,
    username: 'username' in partial ? partial.username : 'test',
    is_admin: false,
    locale: 'es',
    units: 'kg',
    timezone: 'UTC',
    color: 'color' in partial ? partial.color : null,
  })),
}))

vi.mock('@/api/domain', () => ({
  avatarUrl: vi.fn(() => '/api/v1/users/1/avatar'),
  uploadAvatar: vi.fn(),
  deleteAvatar: vi.fn(() => Promise.resolve(undefined)),
}))

describe('AccountCard', () => {
  let wrapper: VueWrapper | null = null

  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
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
    wrapper = mount(AccountCard, {
      global: { plugins: [createI18nInstance()] },
      attachTo: document.body,
    })
    return wrapper
  }

  describe('user color (moved here from SettingsCard)', () => {
    it('renders the default swatch plus one per curated color', () => {
      build()

      expect(wrapper!.find('[data-testid="color-swatch-default"]').exists()).toBe(true)
      expect(wrapper!.findAll('[data-testid="color-swatch"]')).toHaveLength(USER_COLOR_SWATCHES.length)
    })

    it('picking a preset swatch calls updateSettings with that hex', async () => {
      const { updateSettings } = await import('@/api/auth')
      build()

      await wrapper!.findAll('[data-testid="color-swatch"]')[0].trigger('click')
      await flushPromises()

      expect(updateSettings).toHaveBeenCalledWith({ color: USER_COLOR_SWATCHES[0] })
    })

    it('picking the default option clears the color back to null (the theme aurora)', async () => {
      const { updateSettings } = await import('@/api/auth')
      build()

      await wrapper!.get('[data-testid="color-swatch-default"]').trigger('click')
      await flushPromises()

      expect(updateSettings).toHaveBeenCalledWith({ color: null })
    })
  })

  // v0.27.0 (zurdi: "cambiar el nombre de usuario, que ahora mismo no se
  // puede") — antes solo el admin podía renombrar, y a otra cuenta
  describe('username', () => {
    it('prefills with the current username and keeps submit disabled until it changes', async () => {
      build()

      const input = wrapper!.find('[data-testid="username-field"] input').element as HTMLInputElement
      expect(input.value).toBe('test')
      expect(wrapper!.find('[data-testid="save-username-btn"]').attributes('disabled')).toBeDefined()
    })

    it('saving a new username calls updateSettings and refreshes the store user', async () => {
      const { updateSettings } = await import('@/api/auth')
      build()

      await wrapper!.find('[data-testid="username-field"] input').setValue('berserker')
      await wrapper!.get('[data-testid="save-username-btn"]').trigger('click')
      await flushPromises()

      expect(updateSettings).toHaveBeenCalledWith({ username: 'berserker' })
      expect(useAuthStore().user?.username).toBe('berserker')
      expect(useToastStore().toasts.length).toBeGreaterThan(0)
    })

    it('trims surrounding whitespace before sending', async () => {
      const { updateSettings } = await import('@/api/auth')
      build()

      await wrapper!.find('[data-testid="username-field"] input').setValue('  berserker  ')
      await wrapper!.get('[data-testid="save-username-btn"]').trigger('click')
      await flushPromises()

      expect(updateSettings).toHaveBeenCalledWith({ username: 'berserker' })
    })

    it('a too-short username shows an inline error and blocks the API call', async () => {
      const { updateSettings } = await import('@/api/auth')
      build()

      await wrapper!.find('[data-testid="username-field"] input').setValue('ab')
      await wrapper!.vm.$nextTick()

      expect(wrapper!.find('[data-testid="username-field"]').text()).toContain(
        'El usuario debe tener al menos 3 caracteres.',
      )
      await wrapper!.get('[data-testid="save-username-btn"]').trigger('click')
      await flushPromises()

      expect(updateSettings).not.toHaveBeenCalled()
    })

    it('a 409 username_taken lands inline on the field, not only in a toast', async () => {
      const { updateSettings } = await import('@/api/auth')
      const { ApiError } = await import('@/api/client')
      vi.mocked(updateSettings).mockRejectedValueOnce(new ApiError(409, 'username_taken'))
      build()

      await wrapper!.find('[data-testid="username-field"] input').setValue('freyja')
      await wrapper!.get('[data-testid="save-username-btn"]').trigger('click')
      await flushPromises()

      expect(wrapper!.find('[data-testid="username-field"]').text()).toContain('Ese usuario ya existe.')
    })

    it('typing again clears the stale server error', async () => {
      const { updateSettings } = await import('@/api/auth')
      const { ApiError } = await import('@/api/client')
      vi.mocked(updateSettings).mockRejectedValueOnce(new ApiError(409, 'username_taken'))
      build()

      await wrapper!.find('[data-testid="username-field"] input').setValue('freyja')
      await wrapper!.get('[data-testid="save-username-btn"]').trigger('click')
      await flushPromises()

      await wrapper!.find('[data-testid="username-field"] input').setValue('freyja2')
      await wrapper!.vm.$nextTick()

      expect(wrapper!.find('[data-testid="username-field"]').text()).not.toContain('Ese usuario ya existe.')
    })
  })

  // v0.27.0: los botones que colgaban bajo el avatar del hub viven aquí
  describe('avatar', () => {
    it('mounts the avatar picker with its change action', () => {
      build()

      expect(wrapper!.find('[data-testid="profile-avatar-btn"]').exists()).toBe(true)
      expect(wrapper!.find('[data-testid="profile-avatar-change"]').exists()).toBe(true)
    })

    it('hides "remove photo" when there is no photo yet', () => {
      build()

      expect(wrapper!.find('[data-testid="profile-avatar-remove"]').exists()).toBe(false)
    })

    it('removing an existing photo calls deleteAvatar and refreshes /auth/me', async () => {
      const auth = useAuthStore()
      auth.user = { ...auth.user!, has_avatar: true, avatar_version: 'abc' }
      const refreshMe = vi.spyOn(auth, 'refreshMe').mockResolvedValue(undefined)
      const { deleteAvatar } = await import('@/api/domain')
      build()

      await wrapper!.get('[data-testid="profile-avatar-remove"]').trigger('click')
      await flushPromises()

      expect(deleteAvatar).toHaveBeenCalled()
      expect(refreshMe).toHaveBeenCalled()
    })
  })
})

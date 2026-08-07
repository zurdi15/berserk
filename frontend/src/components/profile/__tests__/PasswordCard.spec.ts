import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { createI18nInstance } from '@/i18n'
import { useToastStore } from '@/stores/toast'
import PasswordCard from '../PasswordCard.vue'

vi.mock('@/api/auth', () => ({
  changePassword: vi.fn(),
}))

describe('PasswordCard', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
  })

  function build() {
    return mount(PasswordCard, {
      global: {
        plugins: [createI18nInstance()],
      },
    })
  }

  it('submits password change and shows toast on success', async () => {
    const { changePassword } = await import('@/api/auth')
    vi.mocked(changePassword).mockResolvedValue(undefined)

    const wrapper = build()

    // Fill in password fields
    const currentField = wrapper.find('[data-testid="current-password-field"] input')
    const newField = wrapper.find('[data-testid="new-password-field"] input')

    await currentField.setValue('oldpass')
    await newField.setValue('newpass1')
    await wrapper.vm.$nextTick()

    // Click submit button
    const submitBtn = wrapper.find('[data-testid="change-password-btn"]')
    await submitBtn.trigger('click')

    // Wait for async to complete
    await new Promise(resolve => setTimeout(resolve, 0))
    await wrapper.vm.$nextTick()

    // Verify changePassword was called
    expect(changePassword).toHaveBeenCalledWith('oldpass', 'newpass1')

    // Verify toast was pushed
    const toast = useToastStore()
    expect(toast.toasts.length).toBeGreaterThan(0)
  })

  it('shows wrong_password error inline on current field', async () => {
    const { changePassword } = await import('@/api/auth')
    const ApiError = (await import('@/api/client')).ApiError

    vi.mocked(changePassword).mockRejectedValue(
      new ApiError(403, 'wrong_password')
    )

    const wrapper = build()

    // Fill in fields
    const currentField = wrapper.find('[data-testid="current-password-field"] input')
    const newField = wrapper.find('[data-testid="new-password-field"] input')

    await currentField.setValue('oldpass')
    await newField.setValue('newpass1')
    await wrapper.vm.$nextTick()

    // Submit
    const submitBtn = wrapper.find('[data-testid="change-password-btn"]')
    await submitBtn.trigger('click')
    await new Promise(resolve => setTimeout(resolve, 0))
    await wrapper.vm.$nextTick()

    // Verify error message contains "contraseña" (Spanish for password)
    const currentFieldEl = wrapper.find('[data-testid="current-password-field"]')
    const text = currentFieldEl.text()
    expect(text).toContain('contraseña')
  })

  it('renders button text from i18n', async () => {
    const wrapper = build()
    await wrapper.vm.$nextTick()

    const text = wrapper.text()
    expect(text).toContain('Guardar') // Spanish for 'save'
  })

  // item (v0.4.0): validación de cliente ANTES de someter — zurdi: una
  // contraseña inválida solo mostraba "Algo ha fallado"
  describe('client-side password validation', () => {
    it('typing a too-short new password shows an inline error and blocks the API call', async () => {
      const { changePassword } = await import('@/api/auth')

      const wrapper = build()
      const newField = wrapper.find('[data-testid="new-password-field"] input')
      await newField.setValue('short')
      await wrapper.vm.$nextTick()

      expect(wrapper.find('[data-testid="new-password-field"]').text()).toContain(
        'La contraseña debe tener al menos 8 caracteres.',
      )

      await wrapper.find('[data-testid="change-password-btn"]').trigger('click')
      await wrapper.vm.$nextTick()

      expect(changePassword).not.toHaveBeenCalled()
    })

    it('a valid new password shows no inline error and the submit button is enabled', async () => {
      const wrapper = build()
      const newField = wrapper.find('[data-testid="new-password-field"] input')
      await newField.setValue('brandnew1')
      await wrapper.vm.$nextTick()

      expect(wrapper.find('[data-testid="new-password-field"]').text()).not.toContain('debe tener al menos')
      expect(wrapper.find('[data-testid="change-password-btn"]').attributes('disabled')).toBeUndefined()
    })

    it('an empty new password disables the submit button without showing an inline error yet', async () => {
      const wrapper = build()
      await wrapper.vm.$nextTick()

      expect(wrapper.find('[data-testid="new-password-field"]').text()).not.toContain('La contraseña')
      expect(wrapper.find('[data-testid="change-password-btn"]').attributes('disabled')).toBeDefined()
    })
  })
})

import { flushPromises, mount } from '@vue/test-utils'
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
    const repeatField = wrapper.find('[data-testid="repeat-password-field"] input')

    await currentField.setValue('oldpass')
    await newField.setValue('newpass1')
    await repeatField.setValue('newpass1')
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
    const repeatField = wrapper.find('[data-testid="repeat-password-field"] input')

    await currentField.setValue('oldpass')
    await newField.setValue('newpass1')
    await repeatField.setValue('newpass1')
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

    it('a valid new password, repeated, shows no inline error and enables the submit button', async () => {
      const wrapper = build()
      await wrapper.find('[data-testid="new-password-field"] input').setValue('brandnew1')
      await wrapper.find('[data-testid="repeat-password-field"] input').setValue('brandnew1')
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

  // v0.27.0 (zurdi: "cambiar la contraseña de forma robusta, pidiendo la
  // actual y repitiendo dos veces la nueva"): la confirmación es de cliente,
  // el backend nunca la ve — evita quedarse fuera por una errata
  describe('v0.27.0: repeat-new-password confirmation', () => {
    it('a mismatching repeat shows an inline error and blocks the API call', async () => {
      const { changePassword } = await import('@/api/auth')

      const wrapper = build()
      await wrapper.find('[data-testid="current-password-field"] input').setValue('oldpass')
      await wrapper.find('[data-testid="new-password-field"] input').setValue('brandnew1')
      await wrapper.find('[data-testid="repeat-password-field"] input').setValue('brandnew2')
      await wrapper.vm.$nextTick()

      expect(wrapper.find('[data-testid="repeat-password-field"]').text()).toContain(
        'Las contraseñas no coinciden.',
      )
      expect(wrapper.find('[data-testid="change-password-btn"]').attributes('disabled')).toBeDefined()

      await wrapper.find('[data-testid="change-password-btn"]').trigger('click')
      await wrapper.vm.$nextTick()

      expect(changePassword).not.toHaveBeenCalled()
    })

    it('a valid new password with the repeat still empty blocks submit but stays quiet (no error yet)', async () => {
      const wrapper = build()
      await wrapper.find('[data-testid="new-password-field"] input').setValue('brandnew1')
      await wrapper.vm.$nextTick()

      expect(wrapper.find('[data-testid="repeat-password-field"]').text()).not.toContain('no coinciden')
      expect(wrapper.find('[data-testid="change-password-btn"]').attributes('disabled')).toBeDefined()
    })

    it('a successful change clears all three fields', async () => {
      const { changePassword } = await import('@/api/auth')
      vi.mocked(changePassword).mockResolvedValue(undefined)

      const wrapper = build()
      await wrapper.find('[data-testid="current-password-field"] input').setValue('oldpass')
      await wrapper.find('[data-testid="new-password-field"] input').setValue('brandnew1')
      await wrapper.find('[data-testid="repeat-password-field"] input').setValue('brandnew1')
      await wrapper.find('[data-testid="change-password-btn"]').trigger('click')
      await flushPromises()

      for (const id of ['current-password-field', 'new-password-field', 'repeat-password-field']) {
        const input = wrapper.find(`[data-testid="${id}"] input`).element as HTMLInputElement
        expect(input.value).toBe('')
      }
    })
  })
})

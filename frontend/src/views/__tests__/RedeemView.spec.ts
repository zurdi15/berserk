import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const push = vi.fn()
vi.mock('vue-router', () => ({
  useRouter: () => ({ push }),
  useRoute: () => ({ params: { token: 'tok123' } }),
}))

vi.mock('@/api/auth', () => ({
  redeemInvite: vi.fn(),
}))

import * as authApi from '@/api/auth'
import { ApiError } from '@/api/client'
import { createI18nInstance } from '@/i18n'
import RedeemView from '../RedeemView.vue'

function build() {
  return mount(RedeemView, {
    global: { plugins: [createI18nInstance()] },
  })
}

describe('RedeemView', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    push.mockClear()
    vi.clearAllMocks()
  })

  it('submits username and password, redeems the invite, and navigates to today', async () => {
    vi.mocked(authApi.redeemInvite).mockResolvedValue({
      id: 5,
      username: 'runa',
      is_admin: false,
      locale: 'es',
      units: 'kg',
      timezone: 'UTC',
    })

    const wrapper = build()
    const inputs = wrapper.findAll('input')
    await inputs[0].setValue('runa')
    await inputs[1].setValue('secret123')
    await wrapper.find('form').trigger('submit.prevent')
    await flushPromises()

    expect(authApi.redeemInvite).toHaveBeenCalledWith('tok123', 'runa', 'secret123')
    expect(push).toHaveBeenCalledWith({ name: 'today' })
  })

  it('shows the invite_invalid error message when the token is dead', async () => {
    vi.mocked(authApi.redeemInvite).mockRejectedValue(new ApiError(410, 'invite_invalid'))

    const wrapper = build()
    const inputs = wrapper.findAll('input')
    await inputs[0].setValue('runa')
    await inputs[1].setValue('secret123')
    await wrapper.find('form').trigger('submit.prevent')
    await flushPromises()

    expect(wrapper.text()).toContain('La invitación no es válida o ya se usó.')
  })
})

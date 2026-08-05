import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { createI18nInstance } from '@/i18n'
import { useRestTimerStore } from '@/stores/restTimer'
import TimerPill from '../TimerPill.vue'

const push = vi.fn()
vi.mock('vue-router', () => ({ useRouter: () => ({ push }) }))

describe('TimerPill', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.useFakeTimers()
    vi.setSystemTime(0)
  })

  function build() {
    return mount(TimerPill, { global: { plugins: [createI18nInstance()] } })
  }

  it('hidden while inactive, shows m:ss while resting', async () => {
    const wrapper = build()
    expect(wrapper.find('[data-testid="timer-pill"]').exists()).toBe(false)
    useRestTimerStore().start(90)
    await wrapper.vm.$nextTick()
    expect(wrapper.find('[data-testid="timer-pill"]').text()).toContain('1:30')
  })

  it('click navigates to the workout tab', async () => {
    useRestTimerStore().start(60)
    const wrapper = build()
    await wrapper.vm.$nextTick()
    await wrapper.find('[data-testid="timer-pill"]').trigger('click')
    expect(push).toHaveBeenCalledWith({ name: 'workout' })
  })
})

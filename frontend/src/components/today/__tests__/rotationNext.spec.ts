import { flushPromises, mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'

import { createI18nInstance } from '@/i18n'
import { useActiveWorkoutStore } from '@/stores/activeWorkout'
import RotationNextCard from '../RotationNextCard.vue'

const rotationMock = vi.fn()
vi.mock('@/api/domain', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  getRotation: (...args: unknown[]) => rotationMock(...args),
}))

const push = vi.fn()
vi.mock('vue-router', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  useRouter: () => ({ push }),
}))

function build() {
  return mount(RotationNextCard, { global: { plugins: [createI18nInstance()] } })
}

const routine = (id: number, name: string) => ({
  id, owner_id: 1, name, description: null, rune: null, color: null,
  is_global: true, owner_username: 'admin', exercises: [],
})

describe('RotationNextCard (v0.14.0)', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    rotationMock.mockReset()
    push.mockReset()
  })

  it('shows the next routine of the plan and starts it', async () => {
    rotationMock.mockResolvedValue({
      routines: [routine(1, 'Empuje'), routine(2, 'Tirón')],
      next_position: 1,
    })
    const active = useActiveWorkoutStore()
    const startSpy = vi.spyOn(active, 'start').mockResolvedValue(undefined as never)

    const wrapper = build()
    await flushPromises()

    expect(wrapper.get('[data-testid="rotation-next-name"]').text()).toBe('Tirón')
    await wrapper.get('[data-testid="rotation-start-btn"]').trigger('click')
    await flushPromises()
    expect(startSpy).toHaveBeenCalledWith({ routine_id: 2 })
    expect(push).toHaveBeenCalledWith({ name: 'workout' })
  })

  it('renders nothing without a plan', async () => {
    rotationMock.mockResolvedValue({ routines: [], next_position: null })
    const wrapper = build()
    await flushPromises()
    expect(wrapper.find('[data-testid="rotation-next-card"]').exists()).toBe(false)
  })

  it('with an active workout the button navigates without starting another', async () => {
    rotationMock.mockResolvedValue({ routines: [routine(1, 'Empuje')], next_position: 0 })
    const active = useActiveWorkoutStore()
    active.workout = { id: 9 } as never
    const startSpy = vi.spyOn(active, 'start')

    const wrapper = build()
    await flushPromises()
    await wrapper.get('[data-testid="rotation-start-btn"]').trigger('click')
    expect(startSpy).not.toHaveBeenCalled()
    expect(push).toHaveBeenCalledWith({ name: 'workout' })
  })
})

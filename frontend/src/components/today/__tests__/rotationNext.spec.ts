import { flushPromises, mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'

import { createI18nInstance } from '@/i18n'
import { useActiveWorkoutStore } from '@/stores/activeWorkout'
import TodayHero from '../TodayHero.vue'

const rotationMock = vi.fn()
const putNextMock = vi.fn()
vi.mock('@/api/domain', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  getRotation: (...args: unknown[]) => rotationMock(...args),
  putRotationNext: (...args: unknown[]) => putNextMock(...args),
}))

const push = vi.fn()
vi.mock('vue-router', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  useRouter: () => ({ push }),
}))

function build(props: Record<string, unknown> = {}) {
  return mount(TodayHero, {
    props: { exercises: [], ...props },
    global: { plugins: [createI18nInstance()] },
  })
}

const routine = (id: number, name: string) => ({
  id, owner_id: 1, name, description: null, rune: null, color: null,
  is_global: true, owner_username: 'admin', exercises: [],
})

// facelift: la vieja RotationNextCard vive ahora dentro de TodayHero — los
// contratos (testids rotation-next-*, empezar/continuar) se conservan y se
// suman el carrusel ‹ › (putRotationNext) y la sesión planificada como chip
describe('TodayHero (rotación, antes RotationNextCard v0.14.0)', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    rotationMock.mockReset()
    putNextMock.mockReset()
    push.mockReset()
  })

  it('shows the next routine of the plan and navigates to its pre-start screen (fase 3: ya no arranca a ciegas)', async () => {
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
    expect(startSpy).not.toHaveBeenCalled()
    expect(push).toHaveBeenCalledWith({ name: 'workout-start', params: { routineId: 2 } })
  })

  it('without a plan falls back to the free-workout hero (no rotation card)', async () => {
    rotationMock.mockResolvedValue({ routines: [], next_position: null })
    const wrapper = build()
    await flushPromises()
    expect(wrapper.find('[data-testid="rotation-next-card"]').exists()).toBe(false)
    // v0.25.0: el estado vacío ofrece SOLO entreno libre (programar murió)
    expect(wrapper.text()).toContain('Entreno libre')
    expect(wrapper.text()).not.toContain('Programar')
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

  it('facelift: the ‹ › arrows pin another routine of the plan via putRotationNext', async () => {
    rotationMock.mockResolvedValue({
      routines: [routine(1, 'Empuje'), routine(2, 'Tirón')],
      next_position: 0,
    })
    putNextMock.mockResolvedValue({
      routines: [routine(1, 'Empuje'), routine(2, 'Tirón')],
      next_position: 1,
    })

    const wrapper = build()
    await flushPromises()
    expect(wrapper.get('[data-testid="rotation-next-name"]').text()).toBe('Empuje')

    await wrapper.get('[data-testid="hero-next"]').trigger('click')
    await flushPromises()
    expect(putNextMock).toHaveBeenCalledWith(2)
    expect(wrapper.get('[data-testid="rotation-next-name"]').text()).toBe('Tirón')
  })

  it('facelift: a single-routine plan renders no arrows', async () => {
    rotationMock.mockResolvedValue({ routines: [routine(1, 'Empuje')], next_position: 0 })
    const wrapper = build()
    await flushPromises()
    expect(wrapper.find('[data-testid="hero-next"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="hero-prev"]').exists()).toBe(false)
  })
})

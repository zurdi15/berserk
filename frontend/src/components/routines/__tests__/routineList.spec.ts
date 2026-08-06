import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { createI18nInstance } from '@/i18n'
import { useAuthStore } from '@/stores/auth'
import RoutineList from '../RoutineList.vue'

vi.mock('@/api/domain', () => ({
  listRoutines: vi.fn(() => Promise.resolve([
    {
      id: 1,
      name: 'Push Day',
      description: 'Upper body push',
      rune: 'chest',
      color: null,
      exercises: [
        { id: 1, exercise_id: 1, position: 0, target_sets: 4, target_reps: 8, target_weight_kg: 80, rest_seconds: 120 },
        { id: 2, exercise_id: 2, position: 1, target_sets: 3, target_reps: 10, target_weight_kg: 60, rest_seconds: 90 },
      ],
    },
    {
      id: 2,
      name: 'Pull Day',
      description: 'Upper body pull',
      rune: 'back',
      color: null,
      exercises: [
        { id: 3, exercise_id: 3, position: 0, target_sets: 4, target_reps: 6, target_weight_kg: 100, rest_seconds: 120 },
      ],
    },
  ])),
  deleteRoutine: vi.fn((id: number) => Promise.resolve(void 0)),
}))

describe('RoutineList', () => {
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
    }
  })

  function build() {
    return mount(RoutineList, {
      global: {
        plugins: [createI18nInstance()],
        stubs: {
          BkRune: true,
          RoutineEditorSheet: true,
        },
      },
    })
  }

  it('displays routines after loading', async () => {
    const wrapper = build()
    await wrapper.vm.$nextTick()

    // Wait for routines to load
    await new Promise(resolve => setTimeout(resolve, 50))
    await wrapper.vm.$nextTick()

    const cards = wrapper.findAll('.p-4.border')
    expect(cards.length).toBeGreaterThan(0)
  })

  it('shows routine name and exercise count', async () => {
    const wrapper = build()
    await wrapper.vm.$nextTick()

    await new Promise(resolve => setTimeout(resolve, 50))
    await wrapper.vm.$nextTick()

    const firstCard = wrapper.find('.p-4.border')
    expect(firstCard.text()).toContain('Push Day')
    expect(firstCard.text()).toContain('2')
  })

  it('opens editor when edit button clicked', async () => {
    const wrapper = build()
    await wrapper.vm.$nextTick()

    await new Promise(resolve => setTimeout(resolve, 50))
    await wrapper.vm.$nextTick()

    expect((wrapper.vm as any).editorOpen).toBe(false)

    const editBtn = wrapper.findAll('button').find(el => {
      const text = (el.element as HTMLButtonElement).textContent || ''
      return text.includes('Editar')
    })
    expect(editBtn).toBeTruthy()
    await editBtn!.trigger('click')
    await wrapper.vm.$nextTick()

    expect((wrapper.vm as any).editorOpen).toBe(true)
  })

  it('deletes routine when confirm clicked after delete prompt', async () => {
    const { deleteRoutine } = await import('@/api/domain')
    vi.mocked(deleteRoutine).mockClear()

    const wrapper = build()
    await wrapper.vm.$nextTick()

    await new Promise(resolve => setTimeout(resolve, 50))
    await wrapper.vm.$nextTick()

    // Click delete button on first routine
    const deleteBtn = wrapper.findAll('button').find(el => {
      const text = (el.element as HTMLButtonElement).textContent || ''
      return text.includes('Borrar') && !text.includes('Editar')
    })
    expect(deleteBtn).toBeTruthy()
    await deleteBtn!.trigger('click')
    await wrapper.vm.$nextTick()

    // Confirm delete is now showing
    const confirmBtn = wrapper.findAll('button').find(el => {
      const text = (el.element as HTMLButtonElement).textContent || ''
      return text === 'Confirmar'
    })
    expect(confirmBtn).toBeTruthy()

    // Click confirm
    await confirmBtn!.trigger('click')
    await wrapper.vm.$nextTick()

    // Assert deleteRoutine was called with correct id
    expect(deleteRoutine).toHaveBeenCalledWith(1)
  })

  it('cancels delete and does not call deleteRoutine', async () => {
    const { deleteRoutine } = await import('@/api/domain')
    vi.mocked(deleteRoutine).mockClear()

    const wrapper = build()
    await wrapper.vm.$nextTick()

    await new Promise(resolve => setTimeout(resolve, 50))
    await wrapper.vm.$nextTick()

    // Click delete button
    const deleteBtn = wrapper.findAll('button').find(el => {
      const text = (el.element as HTMLButtonElement).textContent || ''
      return text.includes('Borrar') && !text.includes('Editar')
    })
    await deleteBtn!.trigger('click')
    await wrapper.vm.$nextTick()

    // Click cancel
    const cancelBtn = wrapper.findAll('button').find(el => {
      const text = (el.element as HTMLButtonElement).textContent || ''
      return text === 'Cancelar'
    })
    await cancelBtn!.trigger('click')
    await wrapper.vm.$nextTick()

    // Assert deleteRoutine was not called
    expect(deleteRoutine).not.toHaveBeenCalled()

    // Verify delete button is shown again (not confirming state)
    const deleteBtnAfter = wrapper.findAll('button').find(el => {
      const text = (el.element as HTMLButtonElement).textContent || ''
      return text.includes('Borrar') && !text.includes('Editar')
    })
    expect(deleteBtnAfter).toBeTruthy()
  })

  it('shows empty state when no routines', async () => {
    const { listRoutines } = await import('@/api/domain')
    vi.mocked(listRoutines).mockResolvedValueOnce([])

    const wrapper = build()
    await wrapper.vm.$nextTick()

    await new Promise(resolve => setTimeout(resolve, 50))
    await wrapper.vm.$nextTick()

    // Should show empty message
    const text = wrapper.text()
    expect(text).toContain('Sin rutinas aún')
  })
})

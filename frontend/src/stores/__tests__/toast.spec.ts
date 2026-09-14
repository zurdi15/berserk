import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { useToastStore } from '../toast'

describe('toast store', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.useFakeTimers()
  })

  it('pushes and auto-expires after 4s', () => {
    const store = useToastStore()
    store.push('info', 'hola')
    expect(store.toasts).toHaveLength(1)
    vi.advanceTimersByTime(4100)
    expect(store.toasts).toHaveLength(0)
  })

  // v0.40.2: un error dura el doble (8 s) y el mismo mensaje repetido no apila
  it('keeps an error toast for 8s', () => {
    const store = useToastStore()
    store.push('error', 'mal')
    vi.advanceTimersByTime(4100)
    expect(store.toasts).toHaveLength(1)
    vi.advanceTimersByTime(4000)
    expect(store.toasts).toHaveLength(0)
  })

  it('does not stack an identical message, it renews the visible one', () => {
    const store = useToastStore()
    store.push('error', 'mal')
    vi.advanceTimersByTime(6000)
    store.push('error', 'mal')
    expect(store.toasts).toHaveLength(1)
    vi.advanceTimersByTime(4000)
    expect(store.toasts).toHaveLength(1)
    vi.advanceTimersByTime(4100)
    expect(store.toasts).toHaveLength(0)
  })

  it('dismisses manually and keeps others', () => {
    const store = useToastStore()
    store.push('error', 'uno')
    store.push('ember', 'dos')
    store.dismiss(store.toasts[0].id)
    expect(store.toasts.map((t) => t.message)).toEqual(['dos'])
  })
})

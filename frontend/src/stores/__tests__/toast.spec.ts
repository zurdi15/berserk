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

  it('dismisses manually and keeps others', () => {
    const store = useToastStore()
    store.push('error', 'uno')
    store.push('ember', 'dos')
    store.dismiss(store.toasts[0].id)
    expect(store.toasts.map((t) => t.message)).toEqual(['dos'])
  })
})

import { describe, expect, it, vi } from 'vitest'

import { SHARED_MEDIA_NAME, navigateWithSharedMedia } from '../viewTransition'

// v0.24.0 — morph del thumb → hero del detalle. La API es progresiva:
// sin soporte (happy-dom, navegadores viejos) navega a secas.
describe('navigateWithSharedMedia', () => {
  it('falls back to a plain navigation when the browser lacks startViewTransition', () => {
    const el = document.createElement('div')
    const navigate = vi.fn()
    navigateWithSharedMedia(el, navigate)
    expect(navigate).toHaveBeenCalledOnce()
    expect(el.style.viewTransitionName ?? '').toBe('')
  })

  it('names the element, runs the navigation inside the transition and cleans the name up after', async () => {
    const el = document.createElement('div')
    const navigate = vi.fn()
    let finish!: () => void
    const finished = new Promise<void>((resolve) => {
      finish = resolve
    })
    const startViewTransition = vi.fn((callback: () => Promise<void> | void) => {
      void callback()
      return { finished }
    })
    ;(document as never as { startViewTransition: unknown }).startViewTransition = startViewTransition

    navigateWithSharedMedia(el, navigate)
    expect(startViewTransition).toHaveBeenCalledOnce()
    expect(navigate).toHaveBeenCalledOnce()
    expect(el.style.viewTransitionName).toBe(SHARED_MEDIA_NAME)

    finish()
    await finished
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(el.style.viewTransitionName ?? '').toBe('')

    delete (document as never as { startViewTransition?: unknown }).startViewTransition
  })

  it('null element navigates directly even with support present', () => {
    const navigate = vi.fn()
    ;(document as never as { startViewTransition: unknown }).startViewTransition = vi.fn()
    navigateWithSharedMedia(null, navigate)
    expect(navigate).toHaveBeenCalledOnce()
    delete (document as never as { startViewTransition?: unknown }).startViewTransition
  })
})

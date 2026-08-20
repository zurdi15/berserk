import { beforeEach, describe, expect, it, vi } from 'vitest'

const registerMock = vi.fn()
vi.mock('virtual:pwa-register', () => ({ registerSW: (opts: unknown) => registerMock(opts) }))

// v0.37.0: la banda "Nueva versión" sale cuando el SW nuevo queda en espera y
// "Actualizar" le pide tomar el control y recargar
describe('appUpdate', () => {
  beforeEach(() => {
    vi.resetModules()
    registerMock.mockReset()
    // happy-dom no trae serviceWorker y initAppUpdate no hace nada sin él
    Object.defineProperty(navigator, 'serviceWorker', { configurable: true, value: {} })
  })

  it('flags the update on onNeedRefresh and applies it with reload', async () => {
    const apply = vi.fn(async () => {})
    registerMock.mockImplementation((opts: { onNeedRefresh: () => void }) => {
      setTimeout(() => opts.onNeedRefresh(), 0)
      return apply
    })
    const mod = await import('../appUpdate')
    mod.initAppUpdate()
    expect(registerMock).toHaveBeenCalledWith(expect.objectContaining({ immediate: true }))
    await new Promise((r) => setTimeout(r, 1))
    expect(mod.updateAvailable.value).toBe(true)

    await mod.applyAppUpdate()
    expect(apply).toHaveBeenCalledWith(true)
    expect(mod.updateAvailable.value).toBe(false)
  })

  it('registers only once', async () => {
    registerMock.mockReturnValue(async () => {})
    const mod = await import('../appUpdate')
    mod.initAppUpdate()
    mod.initAppUpdate()
    expect(registerMock).toHaveBeenCalledTimes(1)
  })
})

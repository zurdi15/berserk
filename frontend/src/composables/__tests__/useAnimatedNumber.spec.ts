import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { effectScope, nextTick, ref, type EffectScope } from 'vue'

import { useAnimatedNumber } from '../useAnimatedNumber'

let callbacks: FrameRequestCallback[]
let now: number
let scope: EffectScope

function pump(ms: number) {
  now += ms
  const batch = callbacks
  callbacks = []
  for (const cb of batch) cb(now)
}

beforeEach(() => {
  callbacks = []
  now = 0
  vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
    callbacks.push(cb)
    return callbacks.length
  })
  vi.stubGlobal('cancelAnimationFrame', () => undefined)
  vi.stubGlobal('performance', { now: () => now })
  // reduced-motion desactivado por defecto: la mayoría de tests quiere ver el
  // tween real, no el salto directo
  vi.stubGlobal('matchMedia', () => ({ matches: false }))
  scope = effectScope()
})

afterEach(() => {
  scope.stop()
  vi.unstubAllGlobals()
})

describe('useAnimatedNumber', () => {
  it('primera aparición: cuenta desde 0 hasta el objetivo y termina exacto', () => {
    const display = scope.run(() => useAnimatedNumber(() => 100, { duration: 500 }))!
    pump(0) // primer frame: t=0
    expect(display.value).toBe(0)
    pump(250) // mitad del tween: entre 0 y 100, easing por delante de lo lineal
    expect(display.value).toBeGreaterThan(50)
    expect(display.value).toBeLessThan(100)
    pump(250)
    expect(display.value).toBe(100)
    expect(callbacks.length).toBe(0) // no quedan frames pendientes
  })

  it('un cambio posterior parte del valor mostrado, no de 0', async () => {
    const target = ref<number>(100)
    const display = scope.run(() => useAnimatedNumber(() => target.value, { duration: 500 }))!
    pump(0)
    pump(500)
    expect(display.value).toBe(100)

    target.value = 40
    await nextTick()
    pump(0)
    expect(display.value).toBe(100) // arranca desde 100, no desde 0
    pump(500)
    expect(display.value).toBe(40)
  })

  it('fuente null: refleja null al instante y al volver un número cuenta desde 0', async () => {
    const target = ref<number | null>(null)
    const display = scope.run(() => useAnimatedNumber(() => target.value, { duration: 500 }))!
    expect(display.value).toBeNull()

    target.value = 60
    await nextTick()
    pump(0)
    expect(display.value).toBe(0)
    pump(500)
    expect(display.value).toBe(60)

    target.value = null
    await nextTick()
    expect(display.value).toBeNull()
  })

  it('sin requestAnimationFrame (entorno node/test) salta directo al objetivo', () => {
    // happy-dom sí trae rAF nativo: para simular su ausencia real (SSR, node)
    // hay que pisarlo explícitamente a undefined, no solo quitar el stub
    vi.stubGlobal('requestAnimationFrame', undefined)
    vi.stubGlobal('cancelAnimationFrame', undefined)
    const display = scope.run(() => useAnimatedNumber(() => 42))!
    expect(display.value).toBe(42)
  })

  it('con reduced-motion activo salta directo al objetivo sin pasar por frames intermedios', () => {
    vi.stubGlobal('matchMedia', () => ({ matches: true }))
    const display = scope.run(() => useAnimatedNumber(() => 77, { duration: 500 }))!
    expect(display.value).toBe(77)
    expect(callbacks.length).toBe(0) // nunca se programó un frame
  })

  it('usa parseInt(core.dur[4]) — 600ms — como duración por defecto cuando no se pasa options.duration', () => {
    const display = scope.run(() => useAnimatedNumber(() => 100))!
    pump(0)
    pump(599)
    expect(display.value).toBeLessThan(100) // a 599ms de 600ms el tween no ha terminado
    pump(1)
    expect(display.value).toBe(100) // a los 600ms exactos, termina
  })
})

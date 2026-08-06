import { describe, expect, it } from 'vitest'

import { tweenFrame } from '../chartTween'

describe('tweenFrame', () => {
  it('includes every real point already reached, without a synthetic tip when targetX lands exactly on one', () => {
    const [xs, ys] = tweenFrame([0, 1, 2, 3], [10, 20, 30, 40], 1)
    expect(xs).toEqual([0, 1])
    expect(ys).toEqual([10, 20])
  })

  it('adds a synthetic tip linearly interpolated between the two real points around targetX', () => {
    const [xs, ys] = tweenFrame([0, 1, 2, 3], [10, 20, 30, 40], 1.5)
    expect(xs).toEqual([0, 1, 1.5])
    expect(ys).toEqual([10, 20, 25]) // punto medio entre 20 y 30
  })

  // M5: la rama de huecos null nunca se ejercita desde BkChart.vue hoy
  // (BkChart.points.value no admite null), pero SÍ es la forma real de
  // uPlot de representar un hueco en una serie — probada aparte en vez de
  // retirarla, para que un consumidor futuro con datos dispersos la
  // herede correcta sin tener que redescubrirla.
  it('does NOT interpolate a synthetic tip across a null gap — clamps at the real point right before the gap instead', () => {
    const [xs, ys] = tweenFrame([0, 1, 2, 3], [10, null, 30, 40], 1.5)
    // el segmento relevante (1→2) tiene un extremo null: sin punta sintética,
    // el trazo se queda clampado en el punto real anterior (x=1, y=null)
    expect(xs).toEqual([0, 1])
    expect(ys).toEqual([10, null])
  })

  it('resumes normal interpolation once targetX moves past the null gap, into an all-real segment', () => {
    const [xs, ys] = tweenFrame([0, 1, 2, 3], [10, null, 30, 40], 2.5)
    expect(xs).toEqual([0, 1, 2, 2.5])
    expect(ys).toEqual([10, null, 30, 35]) // punto medio entre 30 y 40
  })

  it('returns nothing beyond the last real point once targetX reaches or passes the series end', () => {
    const [xs, ys] = tweenFrame([0, 1, 2], [10, 20, 30], 2)
    expect(xs).toEqual([0, 1, 2])
    expect(ys).toEqual([10, 20, 30])
  })
})

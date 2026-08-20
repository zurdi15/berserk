import { describe, expect, it } from 'vitest'

import { runeDataUrl } from '../runeImage'

// v0.34.1: sin canvas real (happy-dom) la rasterización devuelve undefined
// sin lanzar — la shell pinta entonces su reserva. Con tokens vacíos, ídem.
describe('runeDataUrl', () => {
  it('nunca lanza y sin canvas/tokens devuelve undefined', async () => {
    await expect(runeDataUrl('berserk')).resolves.toBeUndefined()
    await expect(runeDataUrl('sowilo')).resolves.toBeUndefined()
  })
})

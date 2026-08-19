import { describe, expect, it } from 'vitest'

import { imageFramingStyle } from '../imageFraming'

// v0.21.4 (zurdi: "tal cual quede en la preview es como se vaya a ver"):
// mismo origen para object-position y el scale — el punto focal no se mueve
// al hacer zoom, y el estilo reproduce el encuadre en cualquier 9:16
describe('imageFramingStyle', () => {
  it('defaults to centered with no transform (zoom 1 adds nothing)', () => {
    expect(imageFramingStyle()).toEqual({ objectPosition: '50% 50%' })
    expect(imageFramingStyle({ image_zoom: 1 })).toEqual({ objectPosition: '50% 50%' })
  })

  it('applies position and zoom with a matching transform-origin', () => {
    expect(imageFramingStyle({ image_pos_x: 20, image_pos_y: 80, image_zoom: 2 })).toEqual({
      objectPosition: '20% 80%',
      transform: 'scale(2)',
      transformOrigin: '20% 80%',
    })
  })

  it('clamps garbage into the valid ranges (0-100 position, 1-3 zoom)', () => {
    expect(imageFramingStyle({ image_pos_x: -10, image_pos_y: 200, image_zoom: 9 })).toEqual({
      objectPosition: '0% 100%',
      transform: 'scale(3)',
      transformOrigin: '0% 100%',
    })
  })
})

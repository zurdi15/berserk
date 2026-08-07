import { describe, expect, it } from 'vitest'

import { foldSearchText } from '../searchFold'

describe('foldSearchText (v0.11.1: búsqueda insensible a acentos)', () => {
  it('lowercases and strips diacritics', () => {
    expect(foldSearchText('Elíptica')).toBe('eliptica')
    expect(foldSearchText('PRENSA')).toBe('prensa')
    expect(foldSearchText('Máquina de remo')).toBe('maquina de remo')
  })

  it('is symmetric: accented query matches unaccented haystack and vice versa', () => {
    expect(foldSearchText('eliptica')).toBe(foldSearchText('Elíptica'))
    expect(foldSearchText('elíptica')).toBe(foldSearchText('Eliptica'))
  })

  it('keeps ñ-less matching working both ways', () => {
    // NFD también descompone la ñ (n + virgulilla combinante): "espanol"
    // encuentra "español" — deseable en un buscador laxo
    expect(foldSearchText('español')).toBe('espanol')
  })
})

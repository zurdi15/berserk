import { describe, expect, it } from 'vitest'

import {
  isLastOfSuperset,
  isLinkedAt,
  nextSupersetIndex,
  normalizeSupersets,
  supersetLabels,
  toggleSupersetLink,
} from '../supersets'

describe('normalizeSupersets', () => {
  it('renumbers groups 0,1,2… in order of appearance', () => {
    expect(normalizeSupersets([7, 7, null, 3, 3])).toEqual([0, 0, null, 1, 1])
  })

  it('dissolves single-member runs to null (a superset needs >= 2 members)', () => {
    expect(normalizeSupersets([5, null, 5])).toEqual([null, null, null])
  })

  it('splits NON-contiguous equal values into separate runs (contiguity defines the group)', () => {
    // mismo valor 4 en dos runs separados por otro grupo: son DOS grupos
    expect(normalizeSupersets([4, 4, 9, 9, 4, 4])).toEqual([0, 0, 1, 1, 2, 2])
  })

  it('is idempotent', () => {
    const once = normalizeSupersets([2, 2, null, 8, 8, 8])
    expect(normalizeSupersets(once)).toEqual(once)
    expect(once).toEqual([0, 0, null, 1, 1, 1])
  })

  it('handles the empty list and all-null lists', () => {
    expect(normalizeSupersets([])).toEqual([])
    expect(normalizeSupersets([null, null])).toEqual([null, null])
  })
})

describe('toggleSupersetLink', () => {
  it('links two loose neighbours into a new group', () => {
    expect(toggleSupersetLink([null, null, null], 1)).toEqual([0, 0, null])
  })

  it('extends an existing group when linking a loose exercise after it', () => {
    expect(toggleSupersetLink([0, 0, null], 2)).toEqual([0, 0, 0])
  })

  it('merges two adjacent groups when linking their boundary', () => {
    expect(toggleSupersetLink([0, 0, 1, 1], 2)).toEqual([0, 0, 0, 0])
  })

  it('unlinks the boundary of a 2-member group, dissolving it entirely', () => {
    expect(toggleSupersetLink([0, 0], 1)).toEqual([null, null])
  })

  it('unlinking mid-group splits it; a leftover single dissolves', () => {
    // [A A A] partido tras el primer miembro: cabeza de 1 se disuelve, cola
    // de 2 sobrevive como grupo nuevo
    expect(toggleSupersetLink([0, 0, 0], 1)).toEqual([null, 0, 0])
    // partido antes del último: cabeza de 2 sobrevive, cola de 1 se disuelve
    expect(toggleSupersetLink([0, 0, 0], 2)).toEqual([0, 0, null])
  })

  it('a 4-member group split in the middle becomes two groups of 2', () => {
    expect(toggleSupersetLink([0, 0, 0, 0], 2)).toEqual([0, 0, 1, 1])
  })

  it('ignores out-of-range boundaries (0 has no previous row)', () => {
    expect(toggleSupersetLink([null, null], 0)).toEqual([null, null])
    expect(toggleSupersetLink([null, null], 5)).toEqual([null, null])
  })

  it('returns a NEW array (never mutates the input)', () => {
    const input: Array<number | null> = [null, null]
    const output = toggleSupersetLink(input, 1)
    expect(input).toEqual([null, null])
    expect(output).not.toBe(input)
  })
})

describe('isLinkedAt', () => {
  it('reports linked boundaries inside a group and unlinked ones elsewhere', () => {
    const values = [0, 0, null, 1, 1]
    expect(isLinkedAt(values, 1)).toBe(true)
    expect(isLinkedAt(values, 2)).toBe(false)
    expect(isLinkedAt(values, 3)).toBe(false)
    expect(isLinkedAt(values, 4)).toBe(true)
    expect(isLinkedAt(values, 0)).toBe(false)
  })

  it('never reports a broken (non-contiguous) pair as linked', () => {
    expect(isLinkedAt([0, null, 0], 2)).toBe(false)
  })
})

describe('supersetLabels', () => {
  it('labels groups A, B… by order of appearance and null for loose rows', () => {
    expect(supersetLabels([3, 3, null, 1, 1])).toEqual(['A', 'A', null, 'B', 'B'])
  })

  it('labels a reorder-broken group as loose (no phantom single-member label)', () => {
    expect(supersetLabels([0, null, 0])).toEqual([null, null, null])
  })
})

describe('isLastOfSuperset / nextSupersetIndex (rest gating, positional rule)', () => {
  const values = [0, 0, null, 1, 1, 1]

  it('only the positionally-last member of each group is "last"', () => {
    expect(isLastOfSuperset(values, 0)).toBe(false)
    expect(isLastOfSuperset(values, 1)).toBe(true)
    expect(isLastOfSuperset(values, 3)).toBe(false)
    expect(isLastOfSuperset(values, 4)).toBe(false)
    expect(isLastOfSuperset(values, 5)).toBe(true)
  })

  it('a loose exercise is always "last" (it rests normally)', () => {
    expect(isLastOfSuperset(values, 2)).toBe(true)
  })

  it('nextSupersetIndex chains members in order and stops at the last', () => {
    expect(nextSupersetIndex(values, 0)).toBe(1)
    expect(nextSupersetIndex(values, 1)).toBeNull()
    expect(nextSupersetIndex(values, 3)).toBe(4)
    expect(nextSupersetIndex(values, 4)).toBe(5)
    expect(nextSupersetIndex(values, 5)).toBeNull()
  })

  it('a loose exercise has no next member', () => {
    expect(nextSupersetIndex(values, 2)).toBeNull()
  })
})

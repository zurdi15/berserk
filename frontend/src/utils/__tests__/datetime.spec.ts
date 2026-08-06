import { afterEach, describe, expect, it, vi } from 'vitest'

import { parseUtc } from '../datetime'

describe('parseUtc', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('parses the real backend naive format (with microseconds) as UTC', () => {
    expect(parseUtc('2026-08-06T03:21:17.685240').getTime()).toBe(
      Date.UTC(2026, 7, 6, 3, 21, 17, 685),
    )
  })

  it('parses a naive datetime without microseconds as UTC', () => {
    expect(parseUtc('2026-08-06T03:21:17').getTime()).toBe(
      Date.UTC(2026, 7, 6, 3, 21, 17),
    )
  })

  it('passes through a string that already carries the Z offset', () => {
    expect(parseUtc('2026-08-06T03:21:17Z').getTime()).toBe(
      Date.UTC(2026, 7, 6, 3, 21, 17),
    )
  })

  it('passes through a string that already carries an explicit +hh:mm offset', () => {
    expect(parseUtc('2026-08-06T05:21:17+02:00').getTime()).toBe(
      Date.UTC(2026, 7, 6, 3, 21, 17),
    )
  })

  it('never shifts by the local offset, unlike a bare new Date() on the same naive string', () => {
    // el bug real: Europe/Madrid (UTC+2 en verano) interpretaba esto como
    // hora local y lo desplazaba 2h respecto al instante UTC real. Se fija el
    // TZ del proceso a un offset no-cero para que la prueba no dependa de la
    // zona horaria de quien la ejecute.
    vi.stubEnv('TZ', 'Europe/Madrid')
    const naive = '2026-08-06T03:21:17.685240'
    expect(parseUtc(naive).getTime()).not.toBe(new Date(naive).getTime())
  })
})

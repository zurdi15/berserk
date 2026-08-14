import { afterEach, describe, expect, it, vi } from 'vitest'

import { clearActAsStorage, getActAs, switchActAs } from '../actAs'

describe('actAs (v0.17.0: admin actúa como otro usuario)', () => {
  afterEach(() => {
    clearActAsStorage()
    vi.restoreAllMocks()
  })

  it('round-trips the persisted state and rejects malformed shapes', () => {
    expect(getActAs()).toBeNull()
    localStorage.setItem('bk:act-as', JSON.stringify({ id: 7, username: 'loki' }))
    expect(getActAs()).toEqual({ id: 7, username: 'loki' })

    localStorage.setItem('bk:act-as', '{"garbage": true}')
    expect(getActAs()).toBeNull()
    localStorage.setItem('bk:act-as', 'not-json')
    expect(getActAs()).toBeNull()
  })

  it('switchActAs purges per-user local state (outbox/cache/snapshot/athlete) before switching identity', async () => {
    const reload = vi.spyOn(window.location, 'reload').mockImplementation(() => {})
    localStorage.setItem('bk:outbox', '[{"stale":true}]')
    localStorage.setItem('bk:outbox-idmap', '[[-1,4]]')
    localStorage.setItem('bk:active-workout', '{"id":1}')
    localStorage.setItem('berserk:athlete-viewing', '{"id":2,"username":"x"}')

    await switchActAs({ id: 7, username: 'loki' })

    expect(localStorage.getItem('bk:outbox')).toBeNull()
    expect(localStorage.getItem('bk:outbox-idmap')).toBeNull()
    expect(localStorage.getItem('bk:active-workout')).toBeNull()
    expect(localStorage.getItem('berserk:athlete-viewing')).toBeNull()
    expect(getActAs()).toEqual({ id: 7, username: 'loki' })
    expect(reload).toHaveBeenCalled()
  })

  it('switchActAs(null) exits the mode (and still purges + reloads)', async () => {
    const reload = vi.spyOn(window.location, 'reload').mockImplementation(() => {})
    localStorage.setItem('bk:act-as', JSON.stringify({ id: 7, username: 'loki' }))

    await switchActAs(null)

    expect(getActAs()).toBeNull()
    expect(reload).toHaveBeenCalled()
  })
})

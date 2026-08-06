import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it } from 'vitest'

import type { UserOut } from '@/api/auth'
import { useAthleteStore } from '../athlete'

const freyja: UserOut = { id: 7, username: 'freyja', is_admin: false, locale: 'es', units: 'kg', timezone: 'UTC', color: '#7C8FFF' }

describe('athlete store', () => {
  beforeEach(() => setActivePinia(createPinia()))

  it('exposes user_id only while viewing someone else', () => {
    const store = useAthleteStore()
    expect(store.userId).toBeUndefined()
    expect(store.isViewing).toBe(false)
    store.view(freyja)
    expect(store.userId).toBe(7)
    expect(store.isViewing).toBe(true)
    store.clear()
    expect(store.userId).toBeUndefined()
  })

  // el color del atleta viaja tal cual desde UserOut hasta el store: el
  // dot del calendario lo consume vía athlete.viewing?.color (ver MonthGrid)
  it('carries the viewed athlete color through untouched', () => {
    const store = useAthleteStore()
    store.view(freyja)
    expect(store.viewing?.color).toBe('#7C8FFF')
  })
})

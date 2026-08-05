import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it } from 'vitest'

import { ApiError } from '@/api/client'
import { i18n } from '@/i18n'
import { useToastStore } from '@/stores/toast'
import { toastApiError } from '../apiErrors'

describe('toastApiError', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    i18n.global.locale.value = 'es'
  })

  it('maps a known slug through i18n', () => {
    toastApiError(new ApiError(409, 'already_shared'))
    const store = useToastStore()
    expect(store.toasts[0].kind).toBe('error')
    expect(store.toasts[0].message).toBe('Ya compartes con ese usuario.')
  })

  it('falls back to generic for unknown slugs and non-ApiError', () => {
    toastApiError(new ApiError(500, 'slug_from_the_future'))
    toastApiError(new TypeError('network down'))
    const store = useToastStore()
    expect(store.toasts.map((t) => t.message)).toEqual([
      'Algo ha fallado. Inténtalo de nuevo.',
      'Algo ha fallado. Inténtalo de nuevo.',
    ])
  })
})

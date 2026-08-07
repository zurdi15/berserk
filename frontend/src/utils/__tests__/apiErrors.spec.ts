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

  // item (v0.4.0): tercer nivel de fallback — un slug reconstruido por
  // client.ts que SÍ tiene traducción propia (p.ej. password_too_short) usa
  // esa, antes de siquiera mirar el campo
  it('maps a reconstructed validation slug (password_too_short) through its own translation, not the generic fielded fallback', () => {
    toastApiError(new ApiError(422, 'password_too_short', 'new_password'))
    const store = useToastStore()
    expect(store.toasts[0].message).toBe('La contraseña debe tener al menos 8 caracteres.')
  })

  it('falls back to errors.validation with the field interpolated when the slug itself has no translation', () => {
    toastApiError(new ApiError(422, 'validation', 'is_admin'))
    const store = useToastStore()
    expect(store.toasts[0].message).toBe('Valor no válido en is_admin.')
  })

  it('falls back to plain generic for a slug with no translation and no field (not the realistic client.ts path, but still safe)', () => {
    toastApiError(new ApiError(422, 'some_future_slug_nobody_mapped'))
    const store = useToastStore()
    expect(store.toasts[0].message).toBe('Algo ha fallado. Inténtalo de nuevo.')
  })
})

import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it } from 'vitest'

import { ApiError, OfflineError } from '@/api/client'
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

  // v0.40.2 (zurdi: "mejorar mucho los toast de error"): un slug sin
  // traducción lleva el detalle técnico; un error que ni es ApiError, el
  // genérico a secas
  it('keeps the technical detail for unknown slugs and stays generic for non-ApiError', () => {
    toastApiError(new ApiError(500, 'slug_from_the_future'))
    toastApiError(new TypeError('network down'))
    const store = useToastStore()
    expect(store.toasts.map((t) => t.message)).toEqual([
      'Algo ha fallado (slug_from_the_future · 500). Inténtalo de nuevo.',
      'Algo ha fallado. Inténtalo de nuevo.',
    ])
  })

  it('maps HTTP status codes when the server sent no slug (ingress 502/503, 500, 413)', () => {
    toastApiError(new ApiError(502, 'generic'))
    toastApiError(new ApiError(503, 'generic'))
    toastApiError(new ApiError(500, 'generic'))
    toastApiError(new ApiError(413, 'generic'))
    const store = useToastStore()
    // 502 y 503 comparten mensaje: el store no apila duplicados
    expect(store.toasts.map((t) => t.message)).toEqual([
      'El servidor no responde ahora mismo (puede estar reiniciándose). Espera un momento y reintenta.',
      'Error interno del servidor. Si se repite, avisa al administrador.',
      'El envío es demasiado grande para el servidor.',
    ])
  })

  it('tells a timeout apart from a dead network', () => {
    toastApiError(new OfflineError('timeout'))
    toastApiError(new OfflineError())
    const store = useToastStore()
    expect(store.toasts.map((t) => t.message)).toEqual([
      'El servidor tarda demasiado en responder. Espera unos segundos y reintenta.',
      'Sin conexión. Esto necesita internet — inténtalo al recuperarla.',
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

  it('falls back to generic WITH the detail for a slug with no translation and no field', () => {
    toastApiError(new ApiError(422, 'some_future_slug_nobody_mapped'))
    const store = useToastStore()
    expect(store.toasts[0].message).toBe('Algo ha fallado (some_future_slug_nobody_mapped · 422). Inténtalo de nuevo.')
  })
})

import { describe, expect, it } from 'vitest'

import { isUsernameValid, usernameErrorKey } from '../usernameValidation'

// v0.27.0: mismas reglas que schemas/users.py::SettingsIn.username (3..50) —
// espejo del spec de passwordValidation
describe('usernameValidation', () => {
  it('treats an empty value as "nothing typed yet", not as an error to shout', () => {
    expect(usernameErrorKey('')).toBeNull()
    expect(isUsernameValid('')).toBe(false)
  })

  it('flags fewer than 3 characters', () => {
    expect(usernameErrorKey('ab')).toBe('errors.username_too_short')
    expect(isUsernameValid('ab')).toBe(false)
  })

  it('accepts exactly 3 and exactly 50 characters (the bounds are inclusive)', () => {
    expect(usernameErrorKey('abc')).toBeNull()
    expect(isUsernameValid('a'.repeat(50))).toBe(true)
  })

  it('flags more than 50 characters', () => {
    expect(usernameErrorKey('a'.repeat(51))).toBe('errors.username_too_long')
    expect(isUsernameValid('a'.repeat(51))).toBe(false)
  })

  // el campo recorta antes de enviar (ver AccountCard), así que las reglas se
  // miden sobre el valor recortado: "  ab  " es corto, no válido de 6
  it('measures the trimmed value, so padding never smuggles a short name through', () => {
    expect(usernameErrorKey('  ab  ')).toBe('errors.username_too_short')
    expect(isUsernameValid('   ')).toBe(false)
    expect(isUsernameValid('  abc  ')).toBe(true)
  })
})

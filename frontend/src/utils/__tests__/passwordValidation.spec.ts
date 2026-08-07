import { describe, expect, it } from 'vitest'

import { isPasswordValid, passwordErrorKey } from '../passwordValidation'

describe('passwordErrorKey', () => {
  it('returns null for an empty string (nothing typed yet, not an error to shout about)', () => {
    expect(passwordErrorKey('')).toBeNull()
  })

  it('flags a password under 8 characters as too short', () => {
    expect(passwordErrorKey('short')).toBe('errors.password_too_short')
  })

  it('accepts exactly 8 characters (the backend minimum)', () => {
    expect(passwordErrorKey('12345678')).toBeNull()
  })

  it('flags a password over 72 UTF-8 bytes as too long', () => {
    expect(passwordErrorKey('x'.repeat(73))).toBe('errors.password_too_long')
  })

  it('accepts exactly 72 bytes', () => {
    expect(passwordErrorKey('x'.repeat(72))).toBeNull()
  })

  // bcrypt (y el backend, _validate_password_bytes) cuenta BYTES UTF-8, no
  // caracteres: un emoji son 4 bytes, así que 20 emojis ya son 80 bytes —
  // por encima del límite aunque solo sean 20 "caracteres"
  it('counts UTF-8 bytes, not characters — multi-byte characters can overflow well under 72 characters', () => {
    const twentyEmoji = '😀'.repeat(20) // 20 chars, 80 bytes UTF-8
    expect(twentyEmoji.length).toBeLessThan(72)
    expect(passwordErrorKey(twentyEmoji)).toBe('errors.password_too_long')
  })
})

describe('isPasswordValid', () => {
  it('is false for an empty password (blocks submit without shouting an inline error)', () => {
    expect(isPasswordValid('')).toBe(false)
  })

  it('is false for a too-short password', () => {
    expect(isPasswordValid('short')).toBe(false)
  })

  it('is false for a too-long password', () => {
    expect(isPasswordValid('x'.repeat(73))).toBe(false)
  })

  it('is true for a password within bounds', () => {
    expect(isPasswordValid('brandnew1')).toBe(true)
  })
})

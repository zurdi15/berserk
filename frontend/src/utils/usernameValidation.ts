// v0.27.0: mismo criterio que passwordValidation.ts (ver su cabecera) — las
// reglas del backend viven también aquí para que el campo diga EN VIVO por
// qué no vale, en vez de descubrirlo en un 422 tras el viaje de red. Mismas
// reglas que schemas/users.py::SettingsIn.username y que
// schemas/auth.py::Credentials.username: 3..50 caracteres.
const MIN_LENGTH = 3
const MAX_LENGTH = 50

export type UsernameErrorKey = 'errors.username_too_short' | 'errors.username_too_long'

// vacío no es "inválido" que gritar, es "todavía nada escrito" — el bloqueo
// del submit lo cubre isUsernameValid, sin ruido antes del primer carácter
export function usernameErrorKey(value: string): UsernameErrorKey | null {
  const trimmed = value.trim()
  if (trimmed.length === 0) return null
  if (trimmed.length < MIN_LENGTH) return 'errors.username_too_short'
  if (trimmed.length > MAX_LENGTH) return 'errors.username_too_long'
  return null
}

export function isUsernameValid(value: string): boolean {
  const trimmed = value.trim()
  return trimmed.length > 0 && usernameErrorKey(trimmed) === null
}

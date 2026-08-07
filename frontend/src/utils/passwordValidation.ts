// item (v0.4.0): reglas de contraseña compartidas por TODO formulario que la
// pida (perfil, admin — crear/resetear, bootstrap, invitación) — antes cada
// uno confiaba en que el backend rechazara un valor inválido con un 422 que
// el cliente ni siquiera sabía traducir (ver apiErrors.ts), así que un
// usuario real solo veía "Algo ha fallado". Mismas reglas que el backend
// (schemas/auth.py: Credentials.password / PasswordChangeIn.new_password):
// min_length=8 CARACTERES, más el límite real de bcrypt — 72 BYTES, no
// caracteres: un acento o emoji puede colar de sobra en 72 caracteres pero
// desbordar en bytes UTF-8, que es justo lo que _validate_password_bytes
// cuenta con len(value.encode()).
const MIN_LENGTH = 8
const MAX_BYTES = 72

export type PasswordErrorKey = 'errors.password_too_short' | 'errors.password_too_long'

// vacío: no es un valor "inválido" que gritar, es "todavía nada escrito" —
// el bloqueo del submit lo cubre aparte (ver isPasswordValid), sin ruido
// antes de que el usuario teclee su primer carácter
export function passwordErrorKey(value: string): PasswordErrorKey | null {
  if (value.length === 0) return null
  if (value.length < MIN_LENGTH) return 'errors.password_too_short'
  if (new TextEncoder().encode(value).length > MAX_BYTES) return 'errors.password_too_long'
  return null
}

export function isPasswordValid(value: string): boolean {
  return value.length > 0 && passwordErrorKey(value) === null
}

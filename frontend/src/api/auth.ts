import { api } from './client'

export interface UserOut {
  id: number
  username: string
  is_admin: boolean
  locale: 'es' | 'en'
  units: 'kg' | 'lb'
  timezone: string
  // opcional en el tipo aunque el backend siempre manda la clave: así los
  // fixtures de test ya existentes (sin color) siguen tipando sin tocarlos
  color?: string | null
  // v0.11.0: objetivo de peso corporal (kg canónicos), null = sin objetivo
  goal_weight_kg?: number | null
  // v0.19.x: foto de perfil — el fichero vive en /users/{id}/avatar
  has_avatar?: boolean
  // v0.25.2: cambia solo al subir otra foto — clave de caché estable del <img>
  avatar_version?: string | null
}

export const getStatus = () => api<{ bootstrapped: boolean }>('/auth/status')
export const login = (username: string, password: string) =>
  api<UserOut>('/auth/login', { method: 'POST', body: { username, password } })
export const bootstrap = (username: string, password: string) =>
  api<UserOut>('/auth/bootstrap', { method: 'POST', body: { username, password } })
export const logout = () => api<void>('/auth/logout', { method: 'POST' })
export const me = () => api<UserOut>('/auth/me')
// v0.27.0: username entra aquí (antes solo el admin podía renombrar, vía
// /admin/users/{id}) — el backend responde 409 username_taken si choca
export const updateSettings = (partial: Partial<Pick<UserOut, 'username' | 'locale' | 'units' | 'timezone' | 'color' | 'goal_weight_kg'>>) =>
  api<UserOut>('/users/me', { method: 'PATCH', body: partial })
export const changePassword = (current_password: string, new_password: string) =>
  api<void>('/auth/password', { method: 'POST', body: { current_password, new_password } })
export const redeemInvite = (token: string, username: string, password: string) =>
  api<UserOut>('/auth/invites/redeem', { method: 'POST', body: { token, username, password } })

import { api } from './client'

export interface UserOut {
  id: number
  username: string
  is_admin: boolean
  locale: string
  units: string
  timezone: string
}

export const getStatus = () => api<{ bootstrapped: boolean }>('/auth/status')
export const login = (username: string, password: string) =>
  api<UserOut>('/auth/login', { method: 'POST', body: { username, password } })
export const bootstrap = (username: string, password: string) =>
  api<UserOut>('/auth/bootstrap', { method: 'POST', body: { username, password } })
export const logout = () => api<void>('/auth/logout', { method: 'POST' })
export const me = () => api<UserOut>('/auth/me')
export const updateSettings = (partial: Partial<Pick<UserOut, 'locale' | 'units' | 'timezone'>>) =>
  api<UserOut>('/users/me', { method: 'PATCH', body: partial })
export const changePassword = (current_password: string, new_password: string) =>
  api<void>('/auth/password', { method: 'POST', body: { current_password, new_password } })

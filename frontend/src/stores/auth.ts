import { defineStore } from 'pinia'
import { computed, ref } from 'vue'

import * as authApi from '@/api/auth'
import type { UserOut } from '@/api/auth'
import { ApiError } from '@/api/client'
import { applyLocale } from '@/i18n'

export const useAuthStore = defineStore('auth', () => {
  const user = ref<UserOut | null>(null)
  const bootstrapped = ref(true)
  const ready = ref(false)

  const isAuthenticated = computed(() => user.value !== null)

  async function init() {
    if (ready.value) return
    try {
      bootstrapped.value = (await authApi.getStatus()).bootstrapped
      if (bootstrapped.value) {
        user.value = await authApi.me()
        applyLocale(user.value.locale)
      }
      ready.value = true
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        // sin sesión no hay usuario: el guard redirige a login sin ruido
        ready.value = true
        return
      }
      // fallo real (red, 500): no cachear el estado — el próximo init reintenta
      throw error
    }
  }

  async function login(username: string, password: string) {
    user.value = await authApi.login(username, password)
    applyLocale(user.value.locale)
  }

  async function bootstrapAccount(username: string, password: string) {
    user.value = await authApi.bootstrap(username, password)
    applyLocale(user.value.locale)
    bootstrapped.value = true
  }

  async function redeemAccount(token: string, username: string, password: string) {
    user.value = await authApi.redeemInvite(token, username, password)
    applyLocale(user.value.locale)
  }

  async function logout() {
    await authApi.logout()
    user.value = null
    // cerrar sesión no puede dejar el "viendo a X" ni el entreno cacheado del usuario anterior
    // se importan aquí para evitar problemas con el orden de inicialización
    const { useAthleteStore } = await import('./athlete')
    const { useActiveWorkoutStore } = await import('./activeWorkout')
    useAthleteStore().clear()
    useActiveWorkoutStore().reset()
    // v0.6.0 offline: TODO lo persistido offline es del usuario saliente —
    // la cache de lecturas no puede filtrarse al siguiente, y una cola
    // pendiente jamás debe reproducirse con la sesión de otro (las series
    // encoladas acabarían en SU historial). El snapshot ya lo borra el
    // reset() de arriba (workout → null limpia la clave vía el watch).
    const { clearReadCache } = await import('@/offline/readCache')
    clearReadCache()
    try {
      localStorage.removeItem('bk:outbox')
      localStorage.removeItem('bk:outbox-idmap')
    } catch {
      // storage inaccesible: tampoco había nada persistido que filtrar
    }
    const { refreshPendingCount } = await import('@/offline/outbox')
    refreshPendingCount()
    // v0.17.0 act-as: cerrar sesión también sale del modo suplantación — un
    // login posterior de un no-admin con el header residual sería 403 en todo
    const { clearActAsStorage } = await import('@/utils/actAs')
    clearActAsStorage()
  }

  return { user, bootstrapped, ready, isAuthenticated, init, login, bootstrapAccount, redeemAccount, logout }
})

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

  async function logout() {
    await authApi.logout()
    user.value = null
  }

  return { user, bootstrapped, ready, isAuthenticated, init, login, bootstrapAccount, logout }
})

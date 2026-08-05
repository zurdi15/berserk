import { defineStore } from 'pinia'
import { computed, ref } from 'vue'

import * as authApi from '@/api/auth'
import type { UserOut } from '@/api/auth'
import { ApiError } from '@/api/client'

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
      }
    } catch (error) {
      // sin sesión no hay usuario: el guard redirige a login sin ruido
      if (!(error instanceof ApiError && error.status === 401)) throw error
    } finally {
      ready.value = true
    }
  }

  async function login(username: string, password: string) {
    user.value = await authApi.login(username, password)
  }

  async function bootstrapAccount(username: string, password: string) {
    user.value = await authApi.bootstrap(username, password)
    bootstrapped.value = true
  }

  async function logout() {
    await authApi.logout()
    user.value = null
  }

  return { user, bootstrapped, ready, isAuthenticated, init, login, bootstrapAccount, logout }
})

import { defineStore } from 'pinia'
import { computed, ref } from 'vue'

import type { UserOut } from '@/api/auth'

export const useAthleteStore = defineStore('athlete', () => {
  const viewing = ref<UserOut | null>(null)
  const userId = computed(() => viewing.value?.id)
  const isViewing = computed(() => viewing.value !== null)
  const view = (user: UserOut) => (viewing.value = user)
  const clear = () => (viewing.value = null)
  return { viewing, userId, isViewing, view, clear }
})

import { defineStore } from 'pinia'
import { ref } from 'vue'

export type ToastKind = 'info' | 'error' | 'ember'

export interface Toast {
  id: number
  kind: ToastKind
  message: string
}

let nextId = 1

export const useToastStore = defineStore('toast', () => {
  const toasts = ref<Toast[]>([])

  function dismiss(id: number) {
    toasts.value = toasts.value.filter((t) => t.id !== id)
  }

  function push(kind: ToastKind, message: string) {
    const id = nextId++
    toasts.value.push({ id, kind, message })
    setTimeout(() => dismiss(id), 4000)
  }

  return { toasts, push, dismiss }
})

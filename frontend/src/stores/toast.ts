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
  // handles del timer de auto-dismiss por toast: hover/foco los pausa y
  // libera un handle nuevo al reanudar, sin tocar la API pública de push
  const timers = new Map<number, ReturnType<typeof setTimeout>>()

  // v0.40.2 (zurdi: "mejorar mucho los toast de error"): un error hay que
  // poder leerlo entero — dura el doble que un aviso informativo
  const DURATION_MS: Record<ToastKind, number> = { info: 4000, ember: 4000, error: 8000 }

  function schedule(id: number, kind: ToastKind) {
    timers.set(
      id,
      setTimeout(() => dismiss(id), DURATION_MS[kind]),
    )
  }

  function dismiss(id: number) {
    toasts.value = toasts.value.filter((t) => t.id !== id)
    const timer = timers.get(id)
    if (timer) clearTimeout(timer)
    timers.delete(id)
  }

  function push(kind: ToastKind, message: string) {
    // v0.40.2: el mismo mensaje repetido (tres toques seguidos con el
    // servidor caído) no apila tres toasts iguales — se reengancha el que ya
    // está en pantalla y se le renueva el tiempo
    const existing = toasts.value.find((t) => t.kind === kind && t.message === message)
    if (existing) {
      pause(existing.id)
      schedule(existing.id, kind)
      return
    }
    const id = nextId++
    toasts.value.push({ id, kind, message })
    schedule(id, kind)
  }

  function pause(id: number) {
    const timer = timers.get(id)
    if (timer) clearTimeout(timer)
    timers.delete(id)
  }

  function resume(id: number) {
    const toast = toasts.value.find((t) => t.id === id)
    if (!toast) return
    schedule(id, toast.kind)
  }

  return { toasts, push, dismiss, pause, resume }
})

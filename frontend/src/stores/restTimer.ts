import { defineStore } from 'pinia'
import { computed, ref } from 'vue'

// timestamps absolutos: el interval solo refresca la vista; si el móvil se
// bloquea y los ticks no corren, el tiempo restante sigue siendo exacto
export const useRestTimerStore = defineStore('restTimer', () => {
  const endsAt = ref<number | null>(null)
  const total = ref(0)
  const now = ref(Date.now())
  let ticker: ReturnType<typeof setInterval> | null = null
  let vibrated = false
  let graceTimeout: ReturnType<typeof setTimeout> | null = null

  const remaining = computed(() =>
    endsAt.value === null ? 0 : Math.max(0, Math.round((endsAt.value - now.value) / 1000)),
  )
  const progress = computed(() => (total.value ? remaining.value / total.value : 0))
  const active = computed(() => endsAt.value !== null)

  function tick() {
    now.value = Date.now()
    if (endsAt.value !== null && now.value >= endsAt.value) {
      if (!vibrated) {
        vibrated = true
        navigator.vibrate?.([200, 100, 200])
        // el timeout de gracia sobrevivía a un restart y borraba el timer nuevo
        graceTimeout = setTimeout(clear, 3000)
      }
    }
  }

  function start(seconds: number) {
    // cancelar timeout de gracia anterior si existe
    if (graceTimeout) clearTimeout(graceTimeout)
    total.value = seconds
    endsAt.value = Date.now() + seconds * 1000
    now.value = Date.now()
    vibrated = false
    if (ticker) clearInterval(ticker)
    ticker = setInterval(tick, 500)
  }

  function clear() {
    // cancelar timeout de gracia si existe
    if (graceTimeout) clearTimeout(graceTimeout)
    endsAt.value = null
    total.value = 0
    vibrated = false
    if (ticker) clearInterval(ticker)
    ticker = null
    graceTimeout = null
  }

  return { endsAt, total, remaining, progress, active, start, clear }
})

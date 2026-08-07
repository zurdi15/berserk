// item 4 (post-0.3.0): preferencias de UI puramente de cliente, sin backend
// — persisten en localStorage para sobrevivir a un refresco o una nueva
// sesión. Si localStorage no está disponible (modo privado agresivo,
// almacenamiento lleno, SSR) se degrada al default en memoria sin romper
// la app: leer/escribir la preferencia nunca debe tirar por sí solo.
const REST_AUTO_KEY = 'berserk:rest-auto-enabled'

// opt-OUT, no opt-in: el default es true (comportamiento actual) para que
// nadie note un cambio hasta que decida apagarlo a propósito
export function getRestAutoEnabled(): boolean {
  try {
    const raw = localStorage.getItem(REST_AUTO_KEY)
    return raw === null ? true : raw === 'true'
  } catch {
    return true
  }
}

export function setRestAutoEnabled(value: boolean): void {
  try {
    localStorage.setItem(REST_AUTO_KEY, String(value))
  } catch {
    // no persiste, pero no debe romper el toggle en memoria
  }
}

// v0.3.2 CARDIO-COUNTDOWN PERSISTENCE: un countdown de cardio de 30 minutos
// solo en estado de componente no sobrevive a que Android mate la pestaña
// con el móvil bloqueado — el descanso de 90s no lo necesita, pero esto sí.
// Mismo patrón que rest-auto (namespaced key, degradación silenciosa), con
// un matiz: aquí no hay un default significativo (nada corriendo = null), y
// el valor persistido puede quedar corrupto o de una forma vieja/ajena
// (versión anterior del shape, u otra clave que colisionara) — se valida el
// shape mínimo en vez de confiar ciegamente en lo que haya en el storage.
const CARDIO_COUNTDOWN_KEY = 'berserk:cardio-countdown'

export interface PersistedCardioCountdown {
  // timestamp ABSOLUTO de fin (Date.now() + targetSeconds*1000 en el
  // instante de arrancar) — mismo principio que CardioCountdown.vue: se
  // recalcula el remaining desde este timestamp, nunca se arrastra un
  // contador de ticks que pudo quedarse parado con la pestaña evictada
  endsAt: number
  workoutId: number
  workoutExerciseId: number
  targetSeconds: number
  distanceM?: number
}

function isPersistedCardioCountdown(value: unknown): value is PersistedCardioCountdown {
  if (typeof value !== 'object' || value === null) return false
  const v = value as Record<string, unknown>
  return (
    typeof v.endsAt === 'number' &&
    typeof v.workoutId === 'number' &&
    typeof v.workoutExerciseId === 'number' &&
    typeof v.targetSeconds === 'number' &&
    (v.distanceM === undefined || typeof v.distanceM === 'number')
  )
}

export function getPersistedCardioCountdown(): PersistedCardioCountdown | null {
  try {
    const raw = localStorage.getItem(CARDIO_COUNTDOWN_KEY)
    if (raw === null) return null
    const parsed: unknown = JSON.parse(raw)
    return isPersistedCardioCountdown(parsed) ? parsed : null
  } catch {
    // JSON.parse malformado, o getItem bloqueado: ninguno debe tirar hacia
    // arriba — un countdown persistido ilegible equivale a "no hay ninguno"
    return null
  }
}

export function setPersistedCardioCountdown(value: PersistedCardioCountdown): void {
  try {
    localStorage.setItem(CARDIO_COUNTDOWN_KEY, JSON.stringify(value))
  } catch {
    // no persiste, pero el countdown en memoria (CardioCountdown.vue) sigue
    // corriendo igual — solo se pierde la capacidad de sobrevivir a un cierre
  }
}

export function clearPersistedCardioCountdown(): void {
  try {
    localStorage.removeItem(CARDIO_COUNTDOWN_KEY)
  } catch {
    // no-op: si tampoco se pudo persistir al empezar, no hay nada que limpiar
  }
}

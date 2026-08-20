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

// v0.4.0 LIGHT THEME: preferencia de tema, puramente de cliente (nunca un
// ajuste de servidor — es instantánea y por dispositivo, no algo que tenga
// sentido sincronizar entre sesiones). Mismo patrón try/catch degradado que
// el resto de este archivo. 'system' es el default: sigue prefers-color-scheme
// hasta que el usuario elige explícitamente oscuro o claro.
export type ThemeMode = 'dark' | 'light' | 'system'
const THEME_KEY = 'berserk:theme'
const VALID_THEME_MODES: readonly ThemeMode[] = ['dark', 'light', 'system']

function isThemeMode(value: string | null): value is ThemeMode {
  return value !== null && (VALID_THEME_MODES as readonly string[]).includes(value)
}

export function getThemeMode(): ThemeMode {
  try {
    const raw = localStorage.getItem(THEME_KEY)
    // valor corrupto/ajeno (versión vieja, u otra clave que colisionara):
    // se trata igual que "nada persistido" en vez de arrastrarlo
    return isThemeMode(raw) ? raw : 'system'
  } catch {
    return 'system'
  }
}

export function setThemeMode(mode: ThemeMode): void {
  try {
    localStorage.setItem(THEME_KEY, mode)
  } catch {
    // no persiste, pero la clase ya aplicada en <html> sigue en pie en memoria
  }
}

// v0.12.0: config de la calculadora de discos (barra + inventario por pares,
// en la unidad de display) — por dispositivo, como el resto de uiPrefs
const PLATE_CONFIG_KEY = 'bk:plate-config'

export function getPlateConfig(): unknown {
  try {
    const raw = localStorage.getItem(PLATE_CONFIG_KEY)
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

export function setPlateConfig(value: unknown): void {
  try {
    localStorage.setItem(PLATE_CONFIG_KEY, JSON.stringify(value))
  } catch {
    // sin persistencia: la config vive lo que la sesión de página
  }
}

// v0.33.0 (zurdi: "algo así molaría, ese bloque de Spotify"): en Android 16 la
// shell puede publicar los cronómetros como Live Update (chip en la barra,
// sección "en tiempo real", Now Bar) o como tarjeta grande con imagen y
// cronómetro propio. Las dos no caben en una misma notificación (las
// promovidas no admiten vistas propias) y Samsung solo promueve a terceros
// con un ajuste de desarrollador: la elección es del usuario, no de una
// heurística. Solo la lee la shell; en web no aplica.
export type TimerNotificationStyle = 'live' | 'card'
const TIMER_NOTIFICATION_STYLE_KEY = 'berserk:timer-notification-style'

export function getTimerNotificationStyle(): TimerNotificationStyle {
  try {
    const raw = localStorage.getItem(TIMER_NOTIFICATION_STYLE_KEY)
    return raw === 'card' ? 'card' : 'live'
  } catch {
    return 'live'
  }
}

export function setTimerNotificationStyle(style: TimerNotificationStyle): void {
  try {
    localStorage.setItem(TIMER_NOTIFICATION_STYLE_KEY, style)
  } catch {
    // sin storage: se queda el valor por defecto
  }
}

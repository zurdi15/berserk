// v0.13.x — puente MÍNIMO con el shell Android de Capacitor (mobile/).
// El shell carga esta app desde el servidor (server.url), y el runtime
// nativo inyecta window.Capacitor con los plugins registrados: se detecta
// en runtime y se usa sin importar nada de @capacitor/* — la PWA no gana
// dependencias y el mismo bundle sirve para web y para el shell.
//
// Piezas (todas no-op en web):
// - permiso de notificaciones: UNA petición memoizada para toda la app
//   (v0.13.2 — dos requestPermissions concurrentes se pisaban y podían
//   tumbar hasta la notificación programada)
// - fin de descanso SONORO: alarma vía BkOngoing.scheduleEndAlarm
//   (AlarmManager.setAlarmClock, EXENTO de la restricción de alarmas
//   exactas de Android 14+ que degradaba la programada de
//   LocalNotifications a inexacta = no llegaba); fallback a
//   LocalNotifications.schedule en shells viejos
// - cronómetros ONGOING (v0.13.1): el sistema pinta el tiempo del entreno
//   corriendo / la cuenta atrás del descanso en barra y pantalla de
//   bloqueo (plugin propio BkOngoing, ver mobile/android)

interface LocalNotificationsPlugin {
  requestPermissions: () => Promise<{ display: string }>
  schedule: (options: { notifications: unknown[] }) => Promise<unknown>
  cancel: (options: { notifications: { id: number }[] }) => Promise<unknown>
}

interface OngoingPlugin {
  startChronometer: (options: Record<string, unknown>) => Promise<unknown>
  startCountdown: (options: Record<string, unknown>) => Promise<unknown>
  stop: (options: { id: number }) => Promise<unknown>
  scheduleEndAlarm?: (options: Record<string, unknown>) => Promise<unknown>
  cancelEndAlarm?: () => Promise<unknown>
}

interface CapacitorGlobal {
  isNativePlatform?: () => boolean
  Plugins?: {
    LocalNotifications?: LocalNotificationsPlugin
    BkOngoing?: OngoingPlugin
  }
}

function capacitor(): CapacitorGlobal | null {
  const cap = (globalThis as { Capacitor?: CapacitorGlobal }).Capacitor
  return cap && cap.isNativePlatform?.() ? cap : null
}

export function isNativeShell(): boolean {
  return capacitor() !== null
}

// ---------- permiso (una sola petición viva a la vez) ----------

let permissionPromise: Promise<boolean> | null = null

export function ensureNativeNotificationPermission(): Promise<boolean> {
  const plugin = capacitor()?.Plugins?.LocalNotifications
  if (!plugin) return Promise.resolve(false)
  if (permissionPromise === null) {
    permissionPromise = plugin
      .requestPermissions()
      .then((result) => result.display === 'granted')
      .catch(() => false)
      .then((granted) => {
        // denegado: no memoizar para siempre — si el usuario lo activa en
        // ajustes del sistema, la siguiente petición lo verá concedido
        if (!granted) permissionPromise = null
        return granted
      })
  }
  return permissionPromise
}

// ---------- fin de descanso sonoro ----------

const REST_NOTIFICATION_ID = 1001

export async function scheduleNativeRestNotification(
  endsAtMs: number,
  title: string,
  body: string,
): Promise<void> {
  const cap = capacitor()
  if (!cap) return
  try {
    await ensureNativeNotificationPermission()
    const ongoing = cap.Plugins?.BkOngoing
    if (ongoing?.scheduleEndAlarm) {
      await ongoing.scheduleEndAlarm({ whenMs: endsAtMs, title, body, channelName: title })
      return
    }
    await cap.Plugins?.LocalNotifications?.schedule({
      notifications: [
        {
          id: REST_NOTIFICATION_ID,
          title,
          body,
          schedule: { at: new Date(endsAtMs), allowWhileIdle: true },
          smallIcon: 'ic_stat_berserk',
        },
      ],
    })
  } catch {
    // sin permiso o plugin roto: la vibración/notification web siguen su curso
  }
}

export async function cancelNativeRestNotification(): Promise<void> {
  const cap = capacitor()
  if (!cap) return
  try {
    if (cap.Plugins?.BkOngoing?.cancelEndAlarm) await cap.Plugins.BkOngoing.cancelEndAlarm()
    await cap.Plugins?.LocalNotifications?.cancel({
      notifications: [{ id: REST_NOTIFICATION_ID }],
    })
  } catch {
    // nada que cancelar
  }
}

// ---------- cronómetros ongoing (el sistema pinta el tiempo) ----------

function ongoingPlugin(): OngoingPlugin | null {
  return capacitor()?.Plugins?.BkOngoing ?? null
}

const REST_COUNTDOWN_ID = 1002
const WORKOUT_CHRONO_ID = 1003

export async function startNativeRestCountdown(endsAtMs: number, title: string): Promise<void> {
  const plugin = ongoingPlugin()
  if (!plugin) return
  try {
    await ensureNativeNotificationPermission()
    await plugin.startCountdown({ id: REST_COUNTDOWN_ID, whenMs: endsAtMs, title, channelName: title })
  } catch {
    // sin permiso: el CTA de la app sigue contando
  }
}

export async function stopNativeRestCountdown(): Promise<void> {
  const plugin = ongoingPlugin()
  if (!plugin) return
  try {
    await plugin.stop({ id: REST_COUNTDOWN_ID })
  } catch {
    // nada que parar
  }
}

export async function startNativeWorkoutChronometer(startedAtMs: number, title: string): Promise<void> {
  const plugin = ongoingPlugin()
  if (!plugin) return
  try {
    await ensureNativeNotificationPermission()
    await plugin.startChronometer({ id: WORKOUT_CHRONO_ID, whenMs: startedAtMs, title, channelName: title })
  } catch {
    // sin permiso: el header del entreno sigue mostrando el crono
  }
}

export async function stopNativeWorkoutChronometer(): Promise<void> {
  const plugin = ongoingPlugin()
  if (!plugin) return
  try {
    await plugin.stop({ id: WORKOUT_CHRONO_ID })
  } catch {
    // nada que parar
  }
}

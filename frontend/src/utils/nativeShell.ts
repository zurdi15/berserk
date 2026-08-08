// v0.13.0 — puente MÍNIMO con el shell Android de Capacitor (mobile/).
// El shell carga esta app desde el servidor (server.url), y el runtime
// nativo inyecta window.Capacitor con los plugins registrados: se detecta
// en runtime y se usa sin importar nada de @capacitor/* — la PWA no gana
// dependencias y el mismo bundle sirve para web y para el shell.
//
// Único uso hoy: la notificación LOCAL del fin del descanso. En el shell
// se PROGRAMA a la hora exacta del fin (suena con la pantalla bloqueada o
// la app matada — el dolor real de la PWA que motivó el shell); en web se
// sigue con la Notification API de siempre (restTimer.notifyRestOver).

interface CapacitorGlobal {
  isNativePlatform?: () => boolean
  Plugins?: {
    LocalNotifications?: {
      requestPermissions: () => Promise<{ display: string }>
      schedule: (options: { notifications: unknown[] }) => Promise<unknown>
      cancel: (options: { notifications: { id: number }[] }) => Promise<unknown>
    }
  }
}

function capacitor(): CapacitorGlobal | null {
  const cap = (globalThis as { Capacitor?: CapacitorGlobal }).Capacitor
  return cap && cap.isNativePlatform?.() ? cap : null
}

export function isNativeShell(): boolean {
  return capacitor() !== null
}

// id fijo: solo existe UNA notificación de descanso a la vez — reprogramar
// con el mismo id sustituye a la anterior
const REST_NOTIFICATION_ID = 1001

export async function scheduleNativeRestNotification(
  endsAtMs: number,
  title: string,
  body: string,
): Promise<void> {
  const plugin = capacitor()?.Plugins?.LocalNotifications
  if (!plugin) return
  try {
    await plugin.requestPermissions()
    await plugin.schedule({
      notifications: [
        {
          id: REST_NOTIFICATION_ID,
          title,
          body,
          schedule: { at: new Date(endsAtMs), allowWhileIdle: true },
          smallIcon: 'ic_stat_icon_config_sample',
        },
      ],
    })
  } catch {
    // sin permiso o plugin roto: la vibración/notification web siguen su curso
  }
}

export async function cancelNativeRestNotification(): Promise<void> {
  const plugin = capacitor()?.Plugins?.LocalNotifications
  if (!plugin) return
  try {
    await plugin.cancel({ notifications: [{ id: REST_NOTIFICATION_ID }] })
  } catch {
    // nada que cancelar
  }
}

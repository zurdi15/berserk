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
  cancelEndAlarm?: (options?: Record<string, unknown>) => Promise<unknown>
  getAppInfo?: () => Promise<{ versionName?: string }>
  openUrl?: (options: { url: string }) => Promise<unknown>
  // v0.28.0 reloj Wear OS (ver el bloque "reloj" al final)
  syncTimer?: (options: WearTimerWire) => Promise<unknown>
  getWearStatus?: () => Promise<Partial<WearStatus>>
  addListener?: (
    event: 'timerCancelled',
    callback: (data: { kind?: string }) => void,
  ) => Promise<{ remove: () => Promise<void> }> | { remove: () => Promise<void> }
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

// ---------- v0.30.0: notificaciones "bonitas" en el móvil ----------
// zurdi: "la notificación y el timer en la barra del móvil molaría que fuese
// más bonita, con una imagen del ejercicio, como Spotify". La shell pinta una
// tarjeta propia (RemoteViews: imagen del ejercicio + cronómetro grande) si
// recibe subtítulo e imagen; las shells anteriores ignoran estos campos.
export interface NativeTimerExtras {
  /** segunda línea: el ejercicio ("Press banca") */
  subtitle?: string
  /** ruta o URL de la imagen (p.ej. exerciseImageUrl(id)); se manda absoluta — la shell la baja con la cookie del WebView */
  imageUrl?: string
}

function absoluteUrl(path?: string): string {
  if (!path) return ''
  try {
    return new URL(path, globalThis.location?.origin ?? 'https://berserk.ginnugagap.net').href
  } catch {
    return ''
  }
}

function extrasPayload(extras?: NativeTimerExtras): { subtitle: string; imageUrl: string } {
  return { subtitle: extras?.subtitle ?? '', imageUrl: absoluteUrl(extras?.imageUrl) }
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
  extras?: NativeTimerExtras,
): Promise<void> {
  const cap = capacitor()
  if (!cap) return
  try {
    await ensureNativeNotificationPermission()
    const ongoing = cap.Plugins?.BkOngoing
    // v0.16.0: SOLO en shells con getAppInfo — en los anteriores
    // scheduleEndAlarm lanzaba SecurityException (setAlarmClock sin permiso
    // de alarmas exactas) y el Bridge de Capacitor la convierte en CIERRE de
    // la app; el catch de aquí no ve nada porque explota en el hilo nativo.
    // getAppInfo nació en el mismo APK que el fix: su presencia es la marca
    // de "scheduleEndAlarm no crashea". Los shells viejos caen al fallback
    // inexacto de LocalNotifications hasta que se actualicen.
    if (ongoing?.scheduleEndAlarm && ongoing.getAppInfo) {
      await ongoing.scheduleEndAlarm({ whenMs: endsAtMs, title, body, channelName: title, ...extrasPayload(extras) })
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

export async function startNativeRestCountdown(endsAtMs: number, title: string, extras?: NativeTimerExtras): Promise<void> {
  const plugin = ongoingPlugin()
  if (!plugin) return
  try {
    await ensureNativeNotificationPermission()
    await plugin.startCountdown({ id: REST_COUNTDOWN_ID, whenMs: endsAtMs, title, channelName: title, ...extrasPayload(extras) })
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

export async function startNativeWorkoutChronometer(startedAtMs: number, title: string, extras?: NativeTimerExtras): Promise<void> {
  const plugin = ongoingPlugin()
  if (!plugin) return
  try {
    await ensureNativeNotificationPermission()
    await plugin.startChronometer({ id: WORKOUT_CHRONO_ID, whenMs: startedAtMs, title, channelName: title, ...extrasPayload(extras) })
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

// ---------- actualización de la APK (v0.16.0) ----------
// El shell carga el bundle del SERVIDOR, así que la web dentro de la APK
// siempre está al día — lo que envejece es el APK instalado (plugins
// nativos). El bundle conoce su propia versión (package.json en build, la
// misma que la última release porque el tren la sube antes de compilar):
// comparándola con la versionName del shell sabemos si hay APK nueva.

function versionLessThan(a: string, b: string): boolean {
  const pa = a.split('.').map(Number)
  const pb = b.split('.').map(Number)
  for (let i = 0; i < 3; i++) {
    const x = pa[i] ?? 0
    const y = pb[i] ?? 0
    if (x !== y) return x < y
  }
  return false
}

export async function checkNativeShellUpdate(
  webVersion: string,
): Promise<{ available: boolean; shellVersion: string | null }> {
  const plugin = ongoingPlugin()
  if (!plugin) return { available: false, shellVersion: null }
  // shells anteriores a getAppInfo: por definición más viejos que cualquier
  // bundle que incluya este código → hay actualización
  if (!plugin.getAppInfo) return { available: true, shellVersion: null }
  try {
    const info = await plugin.getAppInfo()
    const shellVersion = info.versionName ?? null
    if (!shellVersion) return { available: true, shellVersion: null }
    return { available: versionLessThan(shellVersion, webVersion), shellVersion }
  } catch {
    return { available: false, shellVersion: null }
  }
}

/** Abre la descarga de la APK de la versión dada en el navegador del sistema. */
export async function openNativeShellDownload(version: string): Promise<void> {
  const url = `https://github.com/zurdi15/berserk/releases/download/v${version}/berserk-v${version}.apk`
  const plugin = ongoingPlugin()
  try {
    if (plugin?.openUrl) {
      await plugin.openUrl({ url })
      return
    }
  } catch {
    // caer al window.open
  }
  // shells viejos sin openUrl: Capacitor manda los hosts fuera de
  // allowNavigation al navegador del sistema
  window.open(url, '_blank')
}

// ---------- reloj Wear OS (v0.28.0) ----------
// zurdi: "vamos directamente a por la C ... la experiencia más robusta".
// La app del reloj (mobile/wear) NO habla con la web: el móvil publica el
// estado de cada temporizador como DataItem de la Data Layer
// (/berserk/timer/<kind>, vía BkOngoing.syncTimer) y el reloj lo pinta con
// la Ongoing Activity API. Aquí solo viaja la VERDAD del móvil (el mismo
// endsAt/startedAt absoluto de las notificaciones ongoing): el reloj no
// calcula nada. Todo no-op en web y en shells sin syncTimer (APK anterior).

export type WearTimerKind = 'rest' | 'cardio' | 'workout'

/**
 * v0.29.0 (zurdi: "que la vibración no fuese una única vez, sino
 * constantemente hasta que yo le dé a OK"): el reloj sigue avisando tras
 * llegar a cero hasta que se le da al OK, así que tiene que distinguir el
 * `stopped` automático de un descanso que SE TERMINÓ SOLO (finished: el
 * móvil lo limpia a los 3 s de gracia) del que paró el usuario o sustituyó
 * otra serie (cancelled): solo este último calla la alarma.
 */
export type WearStopReason = 'cancelled' | 'finished'

export interface WearTimerSync {
  kind: WearTimerKind
  state: 'running' | 'stopped'
  /** fin (cuenta atrás) o inicio (crono hacia arriba), epoch ms */
  targetEpochMs?: number
  /** duración total de la cuenta atrás (barra de progreso del reloj) */
  totalMs?: number
  /** ya localizado ("Descanso · Press banca"); el reloj solo lo pinta */
  title?: string
  /** solo con `stopped`; por defecto, cancelled */
  reason?: WearStopReason
}

/** lo que recibe el plugin: todos los campos presentes (DataMap sin opcionales) */
export type WearTimerWire = Required<Omit<WearTimerSync, 'reason'>> & { reason: WearStopReason | '' }

export interface WearStatus {
  playServices: boolean
  connected: boolean
  appInstalled: boolean
  watchName: string | null
}

/** ¿Esta shell sabe hablar con el reloj? (marca de capacidad, como getAppInfo) */
export function hasWearBridge(): boolean {
  return typeof ongoingPlugin()?.syncTimer === 'function'
}

export async function syncWearTimer(sync: WearTimerSync): Promise<void> {
  const plugin = ongoingPlugin()
  if (!plugin?.syncTimer) return
  try {
    await plugin.syncTimer({ targetEpochMs: 0, totalMs: 0, title: '', reason: '', ...sync })
  } catch {
    // sin Play Services o sin reloj: el móvil sigue igual
  }
}

export async function getWearStatus(): Promise<WearStatus | null> {
  const plugin = ongoingPlugin()
  if (!plugin?.getWearStatus) return null
  try {
    const status = await plugin.getWearStatus()
    return {
      playServices: status.playServices === true,
      connected: status.connected === true,
      appInstalled: status.appInstalled === true,
      watchName: typeof status.watchName === 'string' && status.watchName ? status.watchName : null,
    }
  } catch {
    return null
  }
}

type WearCancelListener = (kind: WearTimerKind) => void
const wearCancelListeners = new Set<WearCancelListener>()
// se suscribe UNA vez por instancia del plugin (no por oyente): si el plugin
// cambia (tests, o un bridge recreado) se vuelve a suscribir
let wearCancelSubscribedTo: OngoingPlugin | null = null

function isWearTimerKind(value: unknown): value is WearTimerKind {
  return value === 'rest' || value === 'cardio' || value === 'workout'
}

/**
 * Cancelación hecha DESDE el reloj (evento `timerCancelled` del plugin, que
 * a su vez ya hizo la limpieza nativa — notificación y alarma — y publicó el
 * stopped). Quien tenga el temporizador en la web lo cierra por su lado.
 * Devuelve la función para darse de baja.
 */
export function onWearTimerCancelled(listener: WearCancelListener): () => void {
  wearCancelListeners.add(listener)
  const plugin = ongoingPlugin()
  if (plugin?.addListener && wearCancelSubscribedTo !== plugin) {
    wearCancelSubscribedTo = plugin
    try {
      void plugin.addListener('timerCancelled', (event) => {
        const kind = event?.kind
        if (!isWearTimerKind(kind)) return
        for (const callback of [...wearCancelListeners]) callback(kind)
      })
    } catch {
      wearCancelSubscribedTo = null
    }
  }
  return () => {
    wearCancelListeners.delete(listener)
  }
}

// cuenta atrás de cardio en la barra del móvil: hasta v0.28.0 el cardio solo
// existía en la web; ahora sigue el mismo camino que el descanso (y el mismo
// id que conoce BkWearListenerService para cancelarla desde el reloj)
const CARDIO_COUNTDOWN_ID = 1004

export async function startNativeCardioCountdown(endsAtMs: number, title: string, extras?: NativeTimerExtras): Promise<void> {
  const plugin = ongoingPlugin()
  if (!plugin) return
  try {
    await ensureNativeNotificationPermission()
    await plugin.startCountdown({ id: CARDIO_COUNTDOWN_ID, whenMs: endsAtMs, title, channelName: title, ...extrasPayload(extras) })
  } catch {
    // sin permiso: la tarjeta sigue contando
  }
}

export async function stopNativeCardioCountdown(): Promise<void> {
  const plugin = ongoingPlugin()
  if (!plugin) return
  try {
    await plugin.stop({ id: CARDIO_COUNTDOWN_ID })
  } catch {
    // nada que parar
  }
}

// Fin de cardio SONORO en el móvil: misma alarma exacta que el descanso
// (BkOngoing.scheduleEndAlarm) con su propio request code y sus propios ids,
// para que no se pise con la del descanso. Sin ella, con la web muerta a
// las 0:00 la cuenta atrás ongoing se quedaría clavada en la barra hasta
// volver a abrir la app. Solo en shells v0.28.0+ (marca: syncTimer): una
// shell anterior IGNORA los parámetros y cancelaría la alarma del DESCANSO.
const CARDIO_END_REQUEST_CODE = 2002
const CARDIO_END_NOTIFICATION_ID = 1005

export async function scheduleNativeCardioEndAlarm(endsAtMs: number, title: string, body: string, extras?: NativeTimerExtras): Promise<void> {
  const cap = capacitor()
  if (!cap) return
  try {
    await ensureNativeNotificationPermission()
    const ongoing = cap.Plugins?.BkOngoing
    if (ongoing?.scheduleEndAlarm && hasWearBridge()) {
      await ongoing.scheduleEndAlarm({
        whenMs: endsAtMs,
        title,
        body,
        channelName: title,
        requestCode: CARDIO_END_REQUEST_CODE,
        notificationId: CARDIO_END_NOTIFICATION_ID,
        cancelNotificationId: CARDIO_COUNTDOWN_ID,
        ...extrasPayload(extras),
      })
      return
    }
    await cap.Plugins?.LocalNotifications?.schedule({
      notifications: [
        {
          id: CARDIO_END_NOTIFICATION_ID,
          title,
          body,
          schedule: { at: new Date(endsAtMs), allowWhileIdle: true },
          smallIcon: 'ic_stat_berserk',
        },
      ],
    })
  } catch {
    // sin permiso o plugin roto: el reloj y la tarjeta siguen avisando
  }
}

export async function cancelNativeCardioEndAlarm(): Promise<void> {
  const cap = capacitor()
  if (!cap) return
  try {
    const ongoing = cap.Plugins?.BkOngoing
    if (ongoing?.cancelEndAlarm && hasWearBridge()) {
      await ongoing.cancelEndAlarm({ requestCode: CARDIO_END_REQUEST_CODE, notificationId: CARDIO_END_NOTIFICATION_ID })
    }
    await cap.Plugins?.LocalNotifications?.cancel({
      notifications: [{ id: CARDIO_END_NOTIFICATION_ID }],
    })
  } catch {
    // nada que cancelar
  }
}

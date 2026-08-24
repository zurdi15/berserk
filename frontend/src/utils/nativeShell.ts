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

import { getTimerNotificationStyle, type TimerNotificationStyle } from '@/utils/uiPrefs'

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
  // v0.38.0: el ejercicio actual en el reloj (ver el bloque al final)
  syncExercise?: (options: WearExerciseWire) => Promise<unknown>
  addListener?: (
    event: 'timerCancelled' | 'alarmState' | 'exerciseCommand',
    callback: (data: Record<string, unknown>) => void,
  ) => Promise<{ remove: () => Promise<void> }> | { remove: () => Promise<void> }
  // v0.35.0: alarma de fin en bucle (BkAlarmService) — la web pinta el overlay
  getAlarmState?: () => Promise<Record<string, unknown>>
  ackAlarm?: () => Promise<unknown>
}

interface CapacitorGlobal {
  isNativePlatform?: () => boolean
  Plugins?: {
    LocalNotifications?: LocalNotificationsPlugin
    BkOngoing?: OngoingPlugin
    // Capacitor 8: plugin de núcleo (edge-to-edge); no existe en shells anteriores
    SystemBars?: { setStyle?: (options: { style: 'DARK' | 'LIGHT' | 'DEFAULT' }) => Promise<unknown> }
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

function extrasPayload(extras?: NativeTimerExtras): { subtitle: string; imageUrl: string; style: TimerNotificationStyle } {
  // v0.33.0: 'live' = Live Update (chip) en Android 16, 'card' = tarjeta grande con imagen
  return { subtitle: extras?.subtitle ?? '', imageUrl: absoluteUrl(extras?.imageUrl), style: getTimerNotificationStyle() }
}

// ---------- v0.31.0: barras del sistema (shell edge-to-edge, Capacitor 8) ----------
// Con targetSdk 36 el WebView se extiende bajo la barra de estado y la de
// gestos; sus iconos tienen que seguir al tema de la web (claro = iconos
// oscuros). 'DARK'/'LIGHT' en SystemBars nombran el FONDO, como en StatusBar.
export function setNativeSystemBarsStyle(lightBackground: boolean): void {
  const bars = capacitor()?.Plugins?.SystemBars
  if (!bars?.setStyle) return
  try {
    void bars.setStyle({ style: lightBackground ? 'LIGHT' : 'DARK' }).catch(() => {})
  } catch {
    // shell sin el plugin: nada que ajustar
  }
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
      await ongoing.scheduleEndAlarm({ whenMs: endsAtMs, title, body, channelName: title, kind: 'rest', ...extrasPayload(extras) })
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

/**
 * v0.34.0: con reason 'finished' (el clear automático a los 3 s de llegar a
 * cero) la shell NO calla la alarma — vibra hasta el OK, como el reloj; solo
 * 'cancelled' (el usuario, u otra serie) la para. Las shells anteriores
 * ignoran el parámetro y cancelan como siempre.
 */
export async function cancelNativeRestNotification(reason: WearStopReason = 'cancelled'): Promise<void> {
  const cap = capacitor()
  if (!cap) return
  try {
    if (cap.Plugins?.BkOngoing?.cancelEndAlarm) await cap.Plugins.BkOngoing.cancelEndAlarm({ reason })
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
        kind: 'cardio',
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

export async function cancelNativeCardioEndAlarm(reason: WearStopReason = 'cancelled'): Promise<void> {
  const cap = capacitor()
  if (!cap) return
  try {
    const ongoing = cap.Plugins?.BkOngoing
    if (ongoing?.cancelEndAlarm && hasWearBridge()) {
      await ongoing.cancelEndAlarm({ requestCode: CARDIO_END_REQUEST_CODE, notificationId: CARDIO_END_NOTIFICATION_ID, reason })
    }
    await cap.Plugins?.LocalNotifications?.cancel({
      notifications: [{ id: CARDIO_END_NOTIFICATION_ID }],
    })
  } catch {
    // nada que cancelar
  }
}

// ---------- v0.35.0: la alarma de fin del móvil, pintada por la web ----------
// zurdi: "en el móvil, en vez de una pantalla específica para el crono
// terminado, un overlay en la pantalla del entreno con glow naranja". La
// shell vibra hasta el OK (BkAlarmService) y publica su estado; la web lo
// escucha (evento alarmState), lo pregunta al volver a primer plano y manda
// el OK. Todo no-op en web y en shells anteriores.
export interface NativeAlarmState {
  ringing: boolean
  kind: WearTimerKind | null
  title: string
  subtitle: string
}

function toAlarmState(raw: Record<string, unknown> | undefined): NativeAlarmState {
  const kind = raw?.kind
  return {
    ringing: raw?.ringing === true,
    kind: isWearTimerKind(kind) ? kind : null,
    title: typeof raw?.title === 'string' ? raw.title : '',
    subtitle: typeof raw?.subtitle === 'string' ? raw.subtitle : '',
  }
}

export async function getNativeAlarmState(): Promise<NativeAlarmState | null> {
  const plugin = ongoingPlugin()
  if (!plugin?.getAlarmState) return null
  try {
    return toAlarmState(await plugin.getAlarmState())
  } catch {
    return null
  }
}

export async function ackNativeAlarm(): Promise<void> {
  const plugin = ongoingPlugin()
  if (!plugin?.ackAlarm) return
  try {
    await plugin.ackAlarm()
  } catch {
    // sin alarma que callar
  }
}

type NativeAlarmListener = (state: NativeAlarmState) => void
const alarmListeners = new Set<NativeAlarmListener>()
let alarmSubscribedTo: OngoingPlugin | null = null

export function onNativeAlarm(listener: NativeAlarmListener): () => void {
  alarmListeners.add(listener)
  const plugin = ongoingPlugin()
  if (plugin?.addListener && plugin.getAlarmState && alarmSubscribedTo !== plugin) {
    alarmSubscribedTo = plugin
    try {
      void plugin.addListener('alarmState', (event) => {
        const state = toAlarmState(event)
        for (const callback of [...alarmListeners]) callback(state)
      })
    } catch {
      alarmSubscribedTo = null
    }
  }
  return () => {
    alarmListeners.delete(listener)
  }
}

// ---------- v0.38.0: el ejercicio actual, en el reloj ----------
// zurdi: "añadir serie desde el reloj y poder finalizar ejercicio". El móvil
// publica UN DataItem (/berserk/exercise) con el ejercicio en el que se está
// (el último con serie registrada del bloque visible, o el primero pendiente
// — lo decide WorkoutView y lo publica la propia card, que es quien sabe qué
// serie viene: prefill, objetivo y si se puede registrar a ciegas). El reloj
// lo pinta en una página propia con "+ Serie" y "Terminar", y manda órdenes
// por MessageClient; la shell las reenvía a la web como evento
// `exerciseCommand` — la web las ejecuta por el MISMO camino que el check de
// la card (outbox, descanso automático, PRs). Todo no-op en web y en shells
// sin syncExercise.

export interface WearExerciseSync {
  /** 'none' = no hay ejercicio actual (sin entreno, bloque terminado) */
  state: 'exercise' | 'none'
  weid?: number
  /** nombre ya localizado */
  name?: string
  setsDone?: number
  /** 0 = sin objetivo de rutina */
  setsTarget?: number
  /** la siguiente serie tal y como la registraría el check ("8 × 60 kg"); vacío si no hay prefill */
  nextLabel?: string
  /** ¿el reloj puede registrar la siguiente serie de un toque? */
  canLog?: boolean
  completed?: boolean
  // v0.39.0 (zurdi: "cambiar los pesos/niveles y las reps desde el reloj"):
  // la siguiente serie DESGLOSADA para los steppers del reloj. reps 0 = sin
  // stepper de reps; loadMode 'none' = sin stepper de carga. La carga va en
  // unidades de PANTALLA (kg/lb según el usuario) o como nivel plano, con el
  // paso y los topes del cajón (loadSteps.ts); el reloj devuelve lo que
  // enseña y la web lo pasa a kg (displayToKg) — el reloj no sabe de unidades.
  reps?: number
  loadMode?: WearLoadMode
  load?: number
  /** 'kg' | 'lb' con loadMode 'weight'; vacío con 'level'/'none' */
  loadUnit?: string
  loadStep?: number
  loadMin?: number
  loadMax?: number
}

export type WearLoadMode = 'weight' | 'level' | 'none'

/** v0.39.0: lo que el usuario ajustó en el reloj antes de «+ Serie» — solo lo tocado */
export interface WearSetTweak {
  reps?: number
  /** en unidades de pantalla (o nivel), tal como lo enseñaba el reloj */
  load?: number
}

/** lo que recibe el plugin: todos los campos presentes (DataMap sin opcionales) */
export type WearExerciseWire = Required<WearExerciseSync>

export type WearExerciseAction = 'logSet' | 'complete'

/** ¿Esta shell sabe mandar el ejercicio al reloj? */
export function hasWearExerciseBridge(): boolean {
  return typeof ongoingPlugin()?.syncExercise === 'function'
}

export async function syncWearExercise(sync: WearExerciseSync): Promise<void> {
  const plugin = ongoingPlugin()
  if (!plugin?.syncExercise) return
  try {
    await plugin.syncExercise({
      weid: 0,
      name: '',
      setsDone: 0,
      setsTarget: 0,
      nextLabel: '',
      canLog: false,
      completed: false,
      reps: 0,
      loadMode: 'none',
      load: 0,
      loadUnit: '',
      loadStep: 0,
      loadMin: 0,
      loadMax: 0,
      ...sync,
    })
  } catch {
    // sin Play Services o sin reloj: el móvil sigue igual
  }
}

type WearExerciseListener = (action: WearExerciseAction, weid: number, tweak: WearSetTweak) => void
const wearExerciseListeners = new Set<WearExerciseListener>()
let wearExerciseSubscribedTo: OngoingPlugin | null = null

function isWearExerciseAction(value: unknown): value is WearExerciseAction {
  return value === 'logSet' || value === 'complete'
}

/**
 * Orden hecha DESDE el reloj (evento `exerciseCommand` del plugin): registrar
 * la siguiente serie o dar el ejercicio por hecho. Lleva el weid que el reloj
 * tenía en pantalla, para no actuar sobre otro ejercicio si el estado cambió
 * entre medias. Devuelve la función para darse de baja.
 */
export function onWearExerciseCommand(listener: WearExerciseListener): () => void {
  wearExerciseListeners.add(listener)
  const plugin = ongoingPlugin()
  if (plugin?.addListener && plugin.syncExercise && wearExerciseSubscribedTo !== plugin) {
    wearExerciseSubscribedTo = plugin
    try {
      void plugin.addListener('exerciseCommand', (event) => {
        const action = event?.action
        const weid = event?.weid
        if (!isWearExerciseAction(action) || typeof weid !== 'number' || !Number.isFinite(weid)) return
        // v0.39.0: con logSet pueden venir las reps y la carga ajustadas en el
        // reloj; solo lo que sea un número válido y positivo
        const tweak: WearSetTweak = {}
        if (typeof event?.reps === 'number' && Number.isFinite(event.reps) && event.reps > 0) tweak.reps = Math.round(event.reps)
        if (typeof event?.load === 'number' && Number.isFinite(event.load) && event.load > 0) tweak.load = event.load
        for (const callback of [...wearExerciseListeners]) callback(action, weid, tweak)
      })
    } catch {
      wearExerciseSubscribedTo = null
    }
  }
  return () => {
    wearExerciseListeners.delete(listener)
  }
}

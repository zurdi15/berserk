// v0.36.0 Web Push (zurdi: "mi novia tiene iPhone y usa la app. no tiene
// apple watch... no puedo pagar por la app de ios"): sin cuenta de
// desarrollador no hay APK de iOS, pero Safari 16.4+ entrega Web Push a la
// PWA instalada en la pantalla de inicio aunque esté cerrada. El backend
// guarda la suscripción y dispara el aviso a la hora de fin (services/push.py);
// aquí se activa desde Ajustes, y el descanso/cardio programan y cancelan.
// En la shell Android no pinta nada: allí la alarma es nativa (nativeShell.ts).
import { api } from '@/api/client'

import { isNativeShell } from './nativeShell'

const ENABLED_KEY = 'berserk:web-push-enabled'
const DEVICE_KEY = 'berserk:web-push-device'

export type WebPushKind = 'rest' | 'cardio'
// unsupported: navegador sin Push API (o shell nativa, que ya tiene lo suyo)
// needs-install: iOS en Safari "normal" — solo la PWA instalada puede suscribirse
// denied: el usuario bloqueó las notificaciones (se reactiva desde el sistema)
// off/on: soportado y apagado/encendido desde Ajustes
export type WebPushState = 'unsupported' | 'needs-install' | 'denied' | 'off' | 'on'

interface PushConfig {
  enabled: boolean
  public_key: string | null
}

function isIos(): boolean {
  if (typeof navigator === 'undefined') return false
  // iPadOS se presenta como Mac; el touch lo delata
  return /iP(hone|ad|od)/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
}

function isStandalone(): boolean {
  if (typeof window === 'undefined') return false
  const nav = navigator as Navigator & { standalone?: boolean }
  return nav.standalone === true || (typeof matchMedia === 'function' && matchMedia('(display-mode: standalone)').matches)
}

function pushApiAvailable(): boolean {
  return (
    typeof window !== 'undefined' &&
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    typeof Notification !== 'undefined'
  )
}

function readEnabled(): boolean {
  try {
    return localStorage.getItem(ENABLED_KEY) === 'true'
  } catch {
    return false
  }
}

function writeEnabled(value: boolean): void {
  try {
    localStorage.setItem(ENABLED_KEY, String(value))
  } catch {
    // sin storage no hay forma de recordar la preferencia; el toggle sigue en memoria
  }
}

// el client_id de los avisos lleva un id de dispositivo: dos dispositivos del
// mismo usuario (móvil + tablet) no se pisan el descanso el uno al otro
function deviceId(): string {
  try {
    let id = localStorage.getItem(DEVICE_KEY)
    if (!id) {
      id = typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : String(Date.now())
      localStorage.setItem(DEVICE_KEY, id)
    }
    return id
  } catch {
    return 'web'
  }
}

export function getWebPushState(): WebPushState {
  if (isNativeShell()) return 'unsupported'
  if (isIos() && !isStandalone()) return 'needs-install'
  if (!pushApiAvailable()) return 'unsupported'
  if (Notification.permission === 'denied') return 'denied'
  return readEnabled() && Notification.permission === 'granted' ? 'on' : 'off'
}

export function isWebPushOn(): boolean {
  return getWebPushState() === 'on'
}

function urlBase64ToUint8Array(base64: string): Uint8Array {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4)
  const raw = atob((base64 + padding).replace(/-/g, '+').replace(/_/g, '/'))
  return Uint8Array.from(raw, (c) => c.charCodeAt(0))
}

async function registration(): Promise<ServiceWorkerRegistration> {
  return navigator.serviceWorker.ready
}

async function pushSubscription(reg: ServiceWorkerRegistration): Promise<PushSubscription | null> {
  return reg.pushManager.getSubscription()
}

async function upload(sub: PushSubscription): Promise<void> {
  const json = sub.toJSON()
  await api('/push/subscriptions', {
    method: 'PUT',
    body: { endpoint: json.endpoint, keys: json.keys, user_agent: navigator.userAgent.slice(0, 255) },
  })
}

// Solo desde un gesto del usuario (el botón de Ajustes): el prompt de permiso
// se ignora fuera de uno. Devuelve el estado resultante.
export async function enableWebPush(): Promise<WebPushState> {
  const state = getWebPushState()
  if (state === 'unsupported' || state === 'needs-install' || state === 'denied') return state
  const permission = await Notification.requestPermission()
  if (permission !== 'granted') return getWebPushState()
  const config = await api<PushConfig>('/push/config')
  if (!config.enabled || !config.public_key) return 'unsupported'
  const reg = await registration()
  let sub = await pushSubscription(reg)
  if (!sub) {
    sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(config.public_key) as BufferSource,
    })
  }
  await upload(sub)
  writeEnabled(true)
  return 'on'
}

export async function disableWebPush(): Promise<WebPushState> {
  writeEnabled(false)
  try {
    const reg = await registration()
    const sub = await pushSubscription(reg)
    if (sub) {
      const endpoint = sub.endpoint
      await sub.unsubscribe()
      await api('/push/subscriptions/unsubscribe', { method: 'POST', body: { endpoint } })
    }
  } catch {
    // el flag ya está apagado: el backend seguirá teniendo una suscripción
    // que el navegador ya no escucha, y la purgará al primer 410
  }
  return getWebPushState()
}

// Al arrancar con el push activo: los servicios push rotan endpoints y el
// backend puede haber purgado el viejo; re-subir el actual es barato y evita
// que "dejó de avisar" sea un misterio. Fuera del flujo crítico: nunca tira.
export async function refreshWebPushSubscription(): Promise<void> {
  if (!isWebPushOn()) return
  try {
    const reg = await registration()
    const sub = await pushSubscription(reg)
    if (sub) await upload(sub)
  } catch {
    // sin red o sin sesión: se reintenta en el siguiente arranque
  }
}

export async function sendWebPushTest(): Promise<number> {
  const result = await api<{ delivered: number }>('/push/test', { method: 'POST' })
  return result.delivered
}

function clientId(kind: WebPushKind): string {
  return `${deviceId()}-${kind}`.slice(0, 64)
}

// Programa el aviso de fin en el backend. No-op si el push está apagado; los
// fallos se tragan (sin red, el descanso local sigue avisando con vibración).
export async function scheduleWebPushTimer(kind: WebPushKind, endsAtMs: number, title: string, body: string): Promise<void> {
  if (!isWebPushOn()) return
  try {
    await api(`/push/timers/${clientId(kind)}`, {
      method: 'PUT',
      body: { kind, fire_at: new Date(endsAtMs).toISOString(), title, body },
    })
  } catch {
    // sin red no hay push que programar; la vibración in-app sigue
  }
}

export async function cancelWebPushTimer(kind: WebPushKind): Promise<void> {
  if (!isWebPushOn()) return
  try {
    await api(`/push/timers/${clientId(kind)}`, { method: 'DELETE' })
  } catch {
    // el backend lo disparará igual; peor que un aviso de más es uno de menos
  }
}

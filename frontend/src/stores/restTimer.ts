import { defineStore } from 'pinia'
import { computed, ref } from 'vue'

import { i18n } from '@/i18n'
import {
  cancelNativeRestNotification,
  isNativeShell,
  onWearTimerCancelled,
  scheduleNativeRestNotification,
  startNativeRestCountdown,
  stopNativeRestCountdown,
  syncWearTimer,
  type WearStopReason,
} from '@/utils/nativeShell'
import { cancelWebPushTimer, scheduleWebPushTimer } from '@/utils/webPush'

// timestamps absolutos: el interval solo refresca la vista; si el móvil se
// bloquea y los ticks no corren, el tiempo restante sigue siendo exacto
export const useRestTimerStore = defineStore('restTimer', () => {
  const endsAt = ref<number | null>(null)
  const total = ref(0)
  const now = ref(Date.now())
  let ticker: ReturnType<typeof setInterval> | null = null
  let vibrated = false
  let graceTimeout: ReturnType<typeof setTimeout> | null = null
  // el ejercicio que originó el descanso, si quien llama a start() lo pasa —
  // solo se usa para el cuerpo de la notificación (item 2, v0.3.0)
  let restExerciseName: string | null = null
  // se pide UNA vez por sesión de página, nunca en cada start(): repetir el
  // prompt del navegador en cada serie sería spam de permisos
  let permissionRequested = false

  // v0.28.0 reloj (zurdi: "vamos directamente a por la C"): cancelar el
  // descanso desde la muñeca. El móvil obedece con clear() — que además
  // re-publica el stopped — para que web, barra del móvil y reloj converjan.
  onWearTimerCancelled((kind) => {
    if (kind === 'rest' && endsAt.value !== null) clear()
  })

  const remaining = computed(() =>
    endsAt.value === null ? 0 : Math.max(0, Math.round((endsAt.value - now.value) / 1000)),
  )
  const progress = computed(() => (total.value ? remaining.value / total.value : 0))
  const active = computed(() => endsAt.value !== null)
  // v0.10.0 (zurdi: "más feedback de que el timer ha terminado + transición
  // más smooth a la runa"): fase FINISHED — el countdown llegó a 0 solo y
  // vive sus ~3s de gracia (ver tick) antes de que clear() devuelva la runa.
  // El CTA la usa para mostrar el "¡hecho!" con pulso en vez de un 0:00 que
  // se esfuma de golpe; la vibración+notificación de tick() siguen igual.
  const finished = computed(() => active.value && remaining.value === 0)
  // m:ss compartido por el CTA del shell (item 1) y quien más lo necesite —
  // antes vivía duplicado en TimerPill, retirado en este mismo cambio
  const label = computed(() => {
    const m = Math.floor(remaining.value / 60)
    const s = String(remaining.value % 60).padStart(2, '0')
    return `${m}:${s}`
  })

  // el permiso solo puede pedirse desde un gesto de usuario real: start()
  // siempre cuelga de un submit de serie (click), así que es el único sitio
  // legítimo para esto — jamás se llama al cargar la página
  function ensureNotificationPermission() {
    if (permissionRequested) return
    permissionRequested = true
    if (typeof Notification === 'undefined' || Notification.permission !== 'default') return
    void Notification.requestPermission()
  }

  async function notifyRestOver() {
    // visible = las señales in-app (vibración + countdown en el CTA) ya
    // avisan; la notificación del sistema es solo para cuando el móvil está
    // bloqueado o en otra app — mostrarla también en foreground es ruido
    if (typeof document === 'undefined' || document.visibilityState !== 'hidden') return
    if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return

    const title = i18n.global.t('timer.notifyTitle')
    const body = restExerciseName
      ? i18n.global.t('timer.notifyBodyWithExercise', { exercise: restExerciseName })
      : i18n.global.t('timer.notifyBody')
    const options: NotificationOptions = { body, icon: '/icons/pwa-192.png', tag: 'berserk-rest-timer' }

    try {
      // Android en concreto lanza "Illegal constructor" al hacer
      // `new Notification()` desde una página con un service worker activo:
      // hay que pasar por el registro cuando existe. vite-pwa (generateSW,
      // ver vite.config.ts) no necesita código propio para esto —
      // showNotification() es un método nativo de cualquier
      // ServiceWorkerRegistration activa, generada o escrita a mano. En dev
      // (SW deshabilitado) o navegadores sin SW, new Notification() es el
      // camino pragmático: sigue siendo una PWA funcional sin él. El await
      // solo se paga cuando de verdad hay SW que consultar — así el camino
      // sin SW no cede el hilo de más.
      let registration: ServiceWorkerRegistration | undefined
      if ('serviceWorker' in navigator) registration = await navigator.serviceWorker.getRegistration()
      if (registration) await registration.showNotification(title, options)
      else new Notification(title, options)
    } catch {
      // notificación no soportada/bloqueada en este entorno: la vibración ya avisó
    }
  }

  function tick() {
    now.value = Date.now()
    if (endsAt.value !== null && now.value >= endsAt.value) {
      if (!vibrated) {
        vibrated = true
        navigator.vibrate?.([200, 100, 200])
        void notifyRestOver()
        // el timeout de gracia sobrevivía a un restart y borraba el timer nuevo
        // v0.29.0: el reloj distingue este clear (terminó solo → sigue
        // avisando hasta el OK) del de cancelar (calla)
        graceTimeout = setTimeout(() => clear('finished'), 3000)
      }
    }
  }

  // v0.30.0: imageUrl = imagen del ejercicio para la tarjeta de la barra del móvil
  function start(seconds: number, exerciseName?: string, imageUrl?: string) {
    // cancelar timeout de gracia anterior si existe
    if (graceTimeout) clearTimeout(graceTimeout)
    total.value = seconds
    endsAt.value = Date.now() + seconds * 1000
    // v0.13.0 shell Android: notificación LOCAL programada a la hora exacta
    // del fin — suena con la pantalla bloqueada o la app matada, que es lo
    // que la Notification API web no puede garantizar. En web es no-op.
    if (isNativeShell()) {
      // v0.13.1: cuenta atrás VISIBLE en barra/bloqueo (cronómetro del
      // sistema, silenciosa) + la programada de abajo que SUENA al llegar
      void startNativeRestCountdown(endsAt.value, i18n.global.t('timer.restOngoingTitle'), { subtitle: exerciseName, imageUrl })
      // v0.28.0 reloj: el mismo endsAt absoluto viaja a la Data Layer para
      // el Galaxy Watch (cuenta atrás en la esfera + vibración a cero)
      void syncWearTimer({
        kind: 'rest',
        state: 'running',
        targetEpochMs: endsAt.value,
        totalMs: seconds * 1000,
        title: exerciseName
          ? `${i18n.global.t('timer.restOngoingTitle')} · ${exerciseName}`
          : i18n.global.t('timer.restOngoingTitle'),
      })
      // v0.35.0: título = el tipo ("Descanso"); el ejercicio va de subtítulo y
      // la shell lo pone de titular — nada de "Descanso terminado"
      void scheduleNativeRestNotification(
        endsAt.value,
        i18n.global.t('timer.restOngoingTitle'),
        exerciseName
          ? i18n.global.t('timer.notifyBodyWithExercise', { exercise: exerciseName })
          : i18n.global.t('timer.notifyBody'),
        { subtitle: exerciseName, imageUrl },
      )
    }
    else {
      // v0.36.0 Web Push (PWA, iPhone incluido): el backend avisa a la hora
      // exacta aunque la PWA esté cerrada — no-op si no está activado en Ajustes
      void scheduleWebPushTimer(
        'rest',
        endsAt.value,
        i18n.global.t('timer.notifyTitle'),
        exerciseName
          ? i18n.global.t('timer.notifyBodyWithExercise', { exercise: exerciseName })
          : i18n.global.t('timer.notifyBody'),
      )
    }
    now.value = Date.now()
    vibrated = false
    restExerciseName = exerciseName ?? null
    ensureNotificationPermission()
    if (ticker) clearInterval(ticker)
    ticker = setInterval(tick, 500)
  }

  function clear(reason: WearStopReason = 'cancelled') {
    // cancelar timeout de gracia si existe
    if (graceTimeout) clearTimeout(graceTimeout)
    // v0.13.0 shell Android: un descanso cancelado a mano no debe sonar
    // luego — la reprogramación de start() ya sustituye por id fijo
    if (isNativeShell()) {
      void cancelNativeRestNotification(reason)
      void stopNativeRestCountdown()
      void syncWearTimer({ kind: 'rest', state: 'stopped', reason })
    } else if (reason === 'cancelled' && endsAt.value !== null) {
      // un descanso cancelado a mano no debe sonar luego en el iPhone; si
      // terminó solo (finished) el backend ya lo disparó o está en ello
      void cancelWebPushTimer('rest')
    }
    endsAt.value = null
    total.value = 0
    vibrated = false
    restExerciseName = null
    if (ticker) clearInterval(ticker)
    ticker = null
    graceTimeout = null
  }

  return { endsAt, total, remaining, progress, active, finished, label, start, clear }
})

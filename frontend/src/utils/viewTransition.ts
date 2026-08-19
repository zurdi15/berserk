import { nextTick } from 'vue'

// v0.24.0 (zurdi: view transitions): morph del thumb de un ejercicio hacia
// el hero de su vista detalle vía la View Transition API same-document.
// El elemento de ORIGEN recibe el view-transition-name justo antes de
// navegar (solo puede haber UN elemento con ese nombre a la vez — ponérselo
// a todos los thumbs de la lista rompería la transición entera); el DESTINO
// lo declara estático en su template. Sin soporte del navegador (happy-dom
// de los specs, Firefox viejo) se navega a secas — la feature es progresiva.
export const SHARED_MEDIA_NAME = 'exercise-media'

type DocumentWithVT = Document & {
  startViewTransition?: (callback: () => Promise<void> | void) => { finished: Promise<void> }
}

export function navigateWithSharedMedia(
  el: HTMLElement | null,
  navigate: () => Promise<unknown> | void,
): void {
  const doc = document as DocumentWithVT
  if (!doc.startViewTransition || !el) {
    void navigate()
    return
  }
  el.style.viewTransitionName = SHARED_MEDIA_NAME
  const transition = doc.startViewTransition(async () => {
    await navigate()
    await nextTick()
  })
  // el origen puede seguir montado (KeepAlive, back inmediato): limpiar el
  // nombre al terminar evita nombres duplicados en la SIGUIENTE transición
  void transition.finished.finally(() => {
    el.style.viewTransitionName = ''
  })
}

// v0.17.0 act-as (zurdi: "que los admin puedan editar las rutinas,
// ejercicios, etc. de cualquier usuario, como si estuviesen logados como ese
// usuario"): estado de suplantación persistido en localStorage — client.ts
// añade el header X-Bk-Act-As a TODA petición mientras esté activo, y el
// backend (get_current_user) resuelve el usuario objetivo para lecturas y
// mutaciones por igual. Solo el backend decide si el admin puede: un no-admin
// con este estado residual recibe 403 y el banner ofrece salir.
const STORAGE_KEY = 'bk:act-as'

export interface ActAsState {
  id: number
  username: string
}

export function getActAs(): ActAsState | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw === null) return null
    const parsed: unknown = JSON.parse(raw)
    if (
      typeof parsed === 'object' &&
      parsed !== null &&
      typeof (parsed as ActAsState).id === 'number' &&
      typeof (parsed as ActAsState).username === 'string'
    ) {
      return parsed as ActAsState
    }
    return null
  } catch {
    // storage inaccesible o shape ilegible = no se está actuando como nadie
    return null
  }
}

export function clearActAsStorage(): void {
  try {
    localStorage.removeItem(STORAGE_KEY)
  } catch {
    // sin storage tampoco había estado que limpiar
  }
}

/**
 * Entra o sale del modo act-as y RECARGA la app. La recarga no es pereza:
 * todo lo cacheado en memoria (auth.user, stores, catálogos) es del usuario
 * anterior, y un boot limpio con el header ya activo es la única forma de
 * que el estado entero sea coherente de golpe (mismo criterio que el
 * restore de backup en AdminCard).
 *
 * Antes de cambiar de identidad se purga TODO lo persistido por-usuario —
 * misma higiene que logout(): una cola offline del admin jamás debe
 * reproducirse como el usuario suplantado ni al revés.
 */
export async function switchActAs(state: ActAsState | null): Promise<void> {
  try {
    localStorage.removeItem('berserk:athlete-viewing')
    localStorage.removeItem('bk:active-workout')
    localStorage.removeItem('bk:outbox')
    localStorage.removeItem('bk:outbox-idmap')
  } catch {
    // sin storage no había nada persistido que filtrar
  }
  const { clearReadCache } = await import('@/offline/readCache')
  clearReadCache()
  try {
    if (state === null) localStorage.removeItem(STORAGE_KEY)
    else localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
  } catch {
    // sin storage el modo no puede persistir — no hay nada que hacer
  }
  window.location.reload()
}

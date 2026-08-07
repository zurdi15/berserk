import { defineStore } from 'pinia'
import { computed, ref } from 'vue'

import type { UserOut } from '@/api/auth'

// item 4 (v0.4.0, bug real de zurdi): "en el calendario no veo los dots de
// otro user al que le he compartido y me ha compartido". Root cause: NI el
// backend (calendar.py ya filtra scheduled Y workouts por target.id) NI el
// hilo de athlete.userId hacia getMonth estaban rotos — reproducido en vivo
// (dos usuarios, grant mutuo, Playwright real) los dots SÍ aparecían justo
// tras elegir "ver" a alguien. Lo que no sobrevivía era ESTE store: `viewing`
// solo vivía en memoria, así que cualquier recarga completa (F5, o el móvil
// evictando la PWA en segundo plano — el mismo caso que ya forzó a persistir
// el countdown de cardio en uiPrefs.ts) la perdía en silencio: el banner
// "Viendo a X" desaparecía y el calendario volvía a pintar los datos
// PROPIOS del viewer sin avisar — si ese mes no tenía nada propio, se veía
// literalmente "sin dots". Mismo patrón que uiPrefs.ts: clave con
// namespace, degradación silenciosa (localStorage no disponible/lleno no
// debe romper la app), y se valida el shape mínimo antes de confiar en lo
// persistido (una versión vieja/ajena del shape no debe colar). auth.ts ya
// limpia esta store explícitamente en logout()/401 (unauthorizedHandler en
// main.ts) — persistir aquí no lo contradice: solo sobrevive mientras la
// SESIÓN sigue siendo válida, nunca más allá de un logout.
const STORAGE_KEY = 'berserk:athlete-viewing'

function isUserOut(value: unknown): value is UserOut {
  if (typeof value !== 'object' || value === null) return false
  const v = value as Record<string, unknown>
  return typeof v.id === 'number' && typeof v.username === 'string'
}

function readPersistedViewing(): UserOut | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw === null) return null
    const parsed: unknown = JSON.parse(raw)
    return isUserOut(parsed) ? parsed : null
  } catch {
    // JSON.parse malformado, o getItem bloqueado (modo privado agresivo):
    // un valor persistido ilegible equivale a "no se está viendo a nadie"
    return null
  }
}

function writePersistedViewing(user: UserOut | null): void {
  try {
    if (user === null) {
      localStorage.removeItem(STORAGE_KEY)
    } else {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(user))
    }
  } catch {
    // no persiste, pero el estado en memoria (viewing.value) sigue
    // funcionando igual para el resto de la sesión actual
  }
}

export const useAthleteStore = defineStore('athlete', () => {
  const viewing = ref<UserOut | null>(readPersistedViewing())
  const userId = computed(() => viewing.value?.id)
  const isViewing = computed(() => viewing.value !== null)
  const view = (user: UserOut) => {
    viewing.value = user
    writePersistedViewing(user)
  }
  const clear = () => {
    viewing.value = null
    writePersistedViewing(null)
  }
  return { viewing, userId, isViewing, view, clear }
})

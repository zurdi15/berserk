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

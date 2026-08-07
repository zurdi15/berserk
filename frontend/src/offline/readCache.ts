// v0.6.0 offline de gimnasio: cache de lecturas — cada GET exitoso se guarda
// y, si un GET falla por red, client.ts sirve lo último visto en su lugar
// (Hoy/Calendario/rutinas en solo-lectura dentro del gym sin cobertura).
// localStorage y no IndexedDB a propósito: los payloads de berserk son
// pequeños (instancia personal), la API síncrona no introduce carreras con
// el replay del outbox, y happy-dom lo soporta en tests sin fakes — mismo
// criterio de persistencia que uiPrefs/athlete. La cache no se usa NUNCA
// online (no es una capa de frescura, es un salvavidas), así que no hay
// invalidación que razonar: se sobreescribe en cada lectura real.
const PREFIX = 'bk:cache:'

export function cacheRead(path: string, data: unknown) {
  try {
    localStorage.setItem(PREFIX + path, JSON.stringify(data))
  } catch {
    // cuota llena o storage bloqueado: la cache es best-effort, nunca rompe
    // el flujo online que la alimenta
  }
}

export function readCached<T>(path: string): { hit: true; data: T } | { hit: false } {
  try {
    const raw = localStorage.getItem(PREFIX + path)
    if (raw === null) return { hit: false }
    return { hit: true, data: JSON.parse(raw) as T }
  } catch {
    // getItem bloqueado (modo privado agresivo, o el stub roto del entorno
    // de tests — ver athlete.spec.ts) o JSON ilegible: sin cache
    return { hit: false }
  }
}

// login/logout limpian la cache entera: la clave no lleva userId (una
// instancia berserk es de una persona por navegador en la práctica), así que
// cambiar de usuario no puede heredar lecturas del anterior
export function clearReadCache() {
  try {
    const doomed: string[] = []
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i)
      if (key?.startsWith(PREFIX)) doomed.push(key)
    }
    for (const key of doomed) localStorage.removeItem(key)
  } catch {
    // storage inaccesible: no hay nada legible que limpiar
  }
}

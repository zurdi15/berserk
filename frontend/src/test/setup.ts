// Setup global de vitest — higiene de localStorage (v0.16.1, el porqué del
// ci rojo crónico desde v0.4.0): el store de atleta (y uiPrefs) persiste en
// localStorage, y los specs montan pinias frescas SIN limpiar el storage.
// Nadie lo notaba porque el resultado dependía de la versión de Node:
//   - Node ≥23 (local): expone un localStorage global ROTO sin
//     --localstorage-file (setItem is not a function) que hace sombra al de
//     happy-dom → la persistencia muere en el try/catch de producción y los
//     tests salían verdes POR ACCIDENTE.
//   - Node 22 (CI): sin global propio, manda el localStorage REAL de
//     happy-dom (compartido entre tests del mismo fichero) → el atleta
//     persistido en un test se filtraba al siguiente: 46 fallos.
// Aquí igualamos los dos mundos: storage FUNCIONAL siempre (si el de Node
// está roto, uno en memoria) y limpio antes de cada test.
import { beforeEach } from 'vitest'

function storageWorks(): boolean {
  try {
    localStorage.setItem('__bk_probe__', '1')
    localStorage.removeItem('__bk_probe__')
    return true
  } catch {
    return false
  }
}

if (!storageWorks()) {
  const backing = new Map<string, string>()
  const memoryStorage: Storage = {
    get length() {
      return backing.size
    },
    clear: () => backing.clear(),
    getItem: (key) => (backing.has(key) ? backing.get(key)! : null),
    key: (index) => [...backing.keys()][index] ?? null,
    removeItem: (key) => {
      backing.delete(key)
    },
    setItem: (key, value) => {
      backing.set(key, String(value))
    },
  }
  Object.defineProperty(globalThis, 'localStorage', {
    value: memoryStorage,
    configurable: true,
  })
}

beforeEach(() => {
  localStorage.clear()
})

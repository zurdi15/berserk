import { ref } from 'vue'

import { ApiError, OfflineError } from '@/api/client'
import * as domain from '@/api/domain'
import type { SetIn } from '@/api/domain'

// v0.6.0 offline de gimnasio: cola FIFO de mutaciones del entreno hechas sin
// red, persistida en localStorage (mismo criterio que readCache.ts) y
// reproducida EN ORDEN al recuperar conexión. Cada entrada lleva un UUID
// (client_id) que el backend usa para dedupe: un replay que se corta tras
// insertar pero antes de confirmar no duplica nada al reintentar (ver
// routers/workouts.py).
//
// IDs temporales: las mutaciones offline referencian entidades que aún no
// existen en el servidor con ids NEGATIVOS (ver activeWorkout.ts). El replay
// mantiene un mapa temp→real que se persiste junto a la cola: si la app
// muere a mitad de replay, el resume puede seguir resolviendo referencias de
// las entradas restantes. Las cadenas son cortas por construcción
// (workout → exercise → set), y el orden FIFO garantiza que el creador de un
// temp id se reproduce antes que cualquier entrada que lo referencie.
//
// Clasificación de errores en replay:
// - OfflineError (red): PARAR — la cola queda intacta y se reintenta en el
//   siguiente trigger.
// - ApiError (el servidor respondió un 4xx/5xx real): la entrada se DESCARTA
//   y se cuenta como conflicto (p.ej. el ejercicio se borró desde otro
//   dispositivo) — reintentarla daría el mismo error para siempre y
//   bloquearía el resto de la cola.

export type OutboxEntry =
  | { id: string; kind: 'startWorkout'; tempWorkoutId: number; body: Parameters<typeof domain.startWorkout>[0]; tempExerciseIds: number[] }
  | { id: string; kind: 'addExercise'; workoutId: number; tempExerciseId: number; exerciseId: number; blockLabel?: string | null }
  | { id: string; kind: 'logSet'; workoutId: number; exerciseId: number; tempSetId: number; body: SetIn }
  | { id: string; kind: 'updateSet'; workoutId: number; exerciseId: number; setId: number; body: SetIn }
  | { id: string; kind: 'deleteSet'; workoutId: number; exerciseId: number; setId: number }
  | { id: string; kind: 'setExerciseRest'; workoutId: number; exerciseId: number; restSeconds: number | null }
  | { id: string; kind: 'setExerciseBlock'; workoutId: number; exerciseId: number; blockLabel: string | null }
  | { id: string; kind: 'setExerciseCompleted'; workoutId: number; exerciseId: number; completed: boolean }
  | { id: string; kind: 'removeExercise'; workoutId: number; exerciseId: number }
  | { id: string; kind: 'setSupersetGroups'; workoutId: number; groups: { exerciseId: number; group: number | null }[] }
  | { id: string; kind: 'finishWorkout'; workoutId: number }

const QUEUE_KEY = 'bk:outbox'
const IDMAP_KEY = 'bk:outbox-idmap'

// contador reactivo para el chip del shell — la única ventana de la UI al outbox
export const pendingCount = ref(0)
export const syncing = ref(false)

function loadQueue(): OutboxEntry[] {
  try {
    return JSON.parse(localStorage.getItem(QUEUE_KEY) ?? '[]') as OutboxEntry[]
  } catch {
    return []
  }
}

function saveQueue(queue: OutboxEntry[]) {
  try {
    localStorage.setItem(QUEUE_KEY, JSON.stringify(queue))
  } catch {
    // storage inaccesible: la cola vive solo en memoria esta sesión —
    // degradación silenciosa, mismo criterio que athlete.ts
  }
  pendingCount.value = queue.length
}

function loadIdMap(): Map<number, number> {
  try {
    return new Map(JSON.parse(localStorage.getItem(IDMAP_KEY) ?? '[]') as [number, number][])
  } catch {
    return new Map()
  }
}

function saveIdMap(map: Map<number, number>) {
  try {
    localStorage.setItem(IDMAP_KEY, JSON.stringify([...map.entries()]))
  } catch {
    // ver saveQueue
  }
}

export function enqueue(entry: OutboxEntry) {
  const queue = loadQueue()
  queue.push(entry)
  saveQueue(queue)
}

export function hasPending(): boolean {
  return loadQueue().length > 0
}

// refresca el contador reactivo desde el storage (boot y tests)
export function refreshPendingCount() {
  pendingCount.value = loadQueue().length
}

export function newClientId(): string {
  return crypto.randomUUID()
}

// ids temporales del lado del cliente: negativos, monotónicos por sesión de
// página, persistidos para no reutilizar uno tras recargar con cola pendiente
const TEMP_SEQ_KEY = 'bk:temp-seq'
let memoryTempSeq = 0
export function nextTempId(): number {
  try {
    const next = Number(localStorage.getItem(TEMP_SEQ_KEY) ?? '0') - 1
    localStorage.setItem(TEMP_SEQ_KEY, String(next))
    return next
  } catch {
    // sin storage no hay cola persistida que sobreviva recargas, así que un
    // contador en memoria basta para la unicidad de esta sesión
    return --memoryTempSeq
  }
}

function resolveId(id: number, idMap: Map<number, number>): number | null {
  if (id >= 0) return id
  return idMap.get(id) ?? null
}

type DrainedCallback = (result: { synced: number; conflicts: number }) => void
const drainedCallbacks = new Set<DrainedCallback>()
export function onDrained(callback: DrainedCallback): () => void {
  drainedCallbacks.add(callback)
  return () => drainedCallbacks.delete(callback)
}

// una sola pasada de replay a la vez: los triggers (evento online, volver a
// la app, boot) pueden solaparse y la cola es FIFO estricta
let inFlight: Promise<void> | null = null

export function syncNow(): Promise<void> {
  if (inFlight) return inFlight
  inFlight = drain().finally(() => {
    inFlight = null
  })
  return inFlight
}

async function replayEntry(entry: OutboxEntry, idMap: Map<number, number>): Promise<void> {
  switch (entry.kind) {
    case 'startWorkout': {
      const workout = await domain.startWorkout({ ...entry.body, client_id: entry.id })
      idMap.set(entry.tempWorkoutId, workout.id)
      // empezar desde rutina crea los ejercicios EN EL SERVIDOR en el mismo
      // orden de posición que la copia local optimista — el mapeo de sus
      // temp ids es posicional a propósito (no hay client_id por ejercicio
      // copiado: los crea el backend, no una entrada de la cola)
      entry.tempExerciseIds.forEach((tempId, index) => {
        const real = workout.exercises[index]
        if (real) idMap.set(tempId, real.id)
      })
      return
    }
    case 'addExercise': {
      const workoutId = resolveId(entry.workoutId, idMap)
      if (workoutId === null) throw new ApiError(410, 'offline_dependency_lost')
      const wex = await domain.addWorkoutExercise(workoutId, {
        exercise_id: entry.exerciseId,
        // v0.17.0 bloques: el alta encolada conserva su bloque en el replay
        block_label: entry.blockLabel ?? undefined,
        client_id: entry.id,
      })
      idMap.set(entry.tempExerciseId, wex.id)
      return
    }
    case 'logSet': {
      const workoutId = resolveId(entry.workoutId, idMap)
      const exerciseId = resolveId(entry.exerciseId, idMap)
      if (workoutId === null || exerciseId === null) throw new ApiError(410, 'offline_dependency_lost')
      const result = await domain.logSet(workoutId, exerciseId, { ...entry.body, client_id: entry.id })
      idMap.set(entry.tempSetId, result.set.id)
      return
    }
    case 'updateSet': {
      const workoutId = resolveId(entry.workoutId, idMap)
      const exerciseId = resolveId(entry.exerciseId, idMap)
      const setId = resolveId(entry.setId, idMap)
      if (workoutId === null || exerciseId === null || setId === null) throw new ApiError(410, 'offline_dependency_lost')
      await domain.updateSet(workoutId, exerciseId, setId, entry.body)
      return
    }
    case 'deleteSet': {
      const workoutId = resolveId(entry.workoutId, idMap)
      const exerciseId = resolveId(entry.exerciseId, idMap)
      const setId = resolveId(entry.setId, idMap)
      // borrar un set que solo existió offline y cuya creación se descartó
      // por conflicto: no hay nada que borrar — éxito vacuo
      if (workoutId === null || exerciseId === null || setId === null) return
      try {
        await domain.deleteSet(workoutId, exerciseId, setId)
      } catch (error) {
        // un 404 en el replay de un DELETE es éxito: ya no está
        if (!(error instanceof ApiError && error.status === 404)) throw error
      }
      return
    }
    case 'setExerciseRest': {
      const workoutId = resolveId(entry.workoutId, idMap)
      const exerciseId = resolveId(entry.exerciseId, idMap)
      if (workoutId === null || exerciseId === null) throw new ApiError(410, 'offline_dependency_lost')
      await domain.updateWorkoutExercise(workoutId, exerciseId, { rest_seconds: entry.restSeconds })
      return
    }
    case 'setExerciseBlock': {
      const workoutId = resolveId(entry.workoutId, idMap)
      const exerciseId = resolveId(entry.exerciseId, idMap)
      if (workoutId === null || exerciseId === null) throw new ApiError(410, 'offline_dependency_lost')
      await domain.updateWorkoutExercise(workoutId, exerciseId, { block_label: entry.blockLabel })
      return
    }
    case 'setExerciseCompleted': {
      const workoutId = resolveId(entry.workoutId, idMap)
      const exerciseId = resolveId(entry.exerciseId, idMap)
      if (workoutId === null || exerciseId === null) throw new ApiError(410, 'offline_dependency_lost')
      await domain.updateWorkoutExercise(workoutId, exerciseId, { completed: entry.completed })
      return
    }
    case 'removeExercise': {
      const workoutId = resolveId(entry.workoutId, idMap)
      const exerciseId = resolveId(entry.exerciseId, idMap)
      // quitar un ejercicio que solo existió offline y cuyo alta se descartó:
      // éxito vacuo (mismo criterio que deleteSet)
      if (workoutId === null || exerciseId === null) return
      try {
        await domain.removeWorkoutExercise(workoutId, exerciseId)
      } catch (error) {
        if (!(error instanceof ApiError && error.status === 404)) throw error
      }
      return
    }
    case 'setSupersetGroups': {
      const workoutId = resolveId(entry.workoutId, idMap)
      if (workoutId === null) throw new ApiError(410, 'offline_dependency_lost')
      // ejercicios cuya alta se descartó por conflicto se filtran (el
      // contrato de completitud del endpoint es sobre los que EXISTEN);
      // si tras filtrar no queda un payload coherente, el 422 del servidor
      // descarta esta entrada como conflicto — mejor que bloquear la cola
      const groups = entry.groups
        .map((g) => ({ workout_exercise_id: resolveId(g.exerciseId, idMap), superset_group: g.group }))
        .filter((g): g is { workout_exercise_id: number; superset_group: number | null } => g.workout_exercise_id !== null)
      if (groups.length === 0) return
      await domain.setWorkoutSupersetGroups(workoutId, groups)
      return
    }
    case 'finishWorkout': {
      const workoutId = resolveId(entry.workoutId, idMap)
      if (workoutId === null) throw new ApiError(410, 'offline_dependency_lost')
      await domain.finishWorkout(workoutId)
      return
    }
  }
}

async function drain(): Promise<void> {
  let queue = loadQueue()
  if (queue.length === 0) return
  const idMap = loadIdMap()
  syncing.value = true
  let synced = 0
  let conflicts = 0
  try {
    while (queue.length > 0) {
      const entry = queue[0]
      try {
        await replayEntry(entry, idMap)
        synced++
      } catch (error) {
        if (error instanceof OfflineError) {
          // seguimos sin red de verdad: parar sin tocar la cola
          return
        }
        if (error instanceof ApiError) {
          conflicts++
        } else {
          throw error
        }
      }
      queue = queue.slice(1)
      saveQueue(queue)
      saveIdMap(idMap)
    }
    // cola vacía: el mapa ya no tiene referencias pendientes que resolver
    try {
      localStorage.removeItem(IDMAP_KEY)
    } catch {
      // ver saveQueue
    }
  } finally {
    syncing.value = false
    if (queue.length === 0 && (synced > 0 || conflicts > 0)) {
      for (const callback of drainedCallbacks) callback({ synced, conflicts })
    }
  }
}

// v0.5.0 superseries: lógica pura compartida por el editor de rutina (donde
// se ENLAZA) y la vista de entreno (donde se AGRUPA visualmente y se gatea el
// auto-descanso). El contrato con el backend (superset_group en
// routine_exercises/workout_exercises) es mínimo a propósito: ejercicios
// CONTIGUOS con el mismo valor no-nulo forman un grupo, null = suelto. Todo
// lector pasa por normalizeSupersets, así que un grouping "roto" (contigüidad
// perdida por un reorden mid-workout, valores sin normalizar de un
// save-as-routine…) degrada solo: los runs de longitud 1 se disuelven a
// sueltos en vez de renderizar un grupo fantasma de un miembro.

export type SupersetValue = number | null

// id de grupo normalizado (0,1,2… por orden de aparición) por índice, o -1 si
// la fila queda suelta — núcleo interno del resto de funciones
function groupIds(values: SupersetValue[]): number[] {
  const result = new Array<number>(values.length).fill(-1)
  let nextId = 0
  let i = 0
  while (i < values.length) {
    const value = values[i]
    if (value == null) {
      i += 1
      continue
    }
    let end = i
    while (end + 1 < values.length && values[end + 1] === value) end += 1
    // un "grupo" de 1 no es un grupo: queda suelto (superserie exige >= 2)
    if (end > i) {
      for (let k = i; k <= end; k++) result[k] = nextId
      nextId += 1
    }
    i = end + 1
  }
  return result
}

/** Valores canónicos a persistir: grupos renumerados 0,1,2… en orden de
 * aparición; runs de longitud 1 disueltos a null. Idempotente. */
export function normalizeSupersets(values: SupersetValue[]): SupersetValue[] {
  return groupIds(values).map((id) => (id === -1 ? null : id))
}

/** ¿La fila `index` está enlazada con la ANTERIOR (frontera index-1 / index)? */
export function isLinkedAt(values: SupersetValue[], index: number): boolean {
  if (index <= 0 || index >= values.length) return false
  const ids = groupIds(values)
  return ids[index] !== -1 && ids[index] === ids[index - 1]
}

/** Enlaza/desenlaza la frontera entre index-1 e index. Enlazar funde los
 * grupos (o sueltos) de ambos lados en uno; desenlazar parte el grupo por esa
 * frontera (las mitades que queden de 1 miembro se disuelven vía
 * normalización). Devuelve SIEMPRE un array nuevo normalizado. */
export function toggleSupersetLink(values: SupersetValue[], index: number): SupersetValue[] {
  const norm = normalizeSupersets(values)
  if (index <= 0 || index >= norm.length) return norm
  const result = [...norm]
  // valores temporales sin colisión posible: los ids normalizados son siempre
  // < norm.length (como mucho ⌊n/2⌋ grupos), así que n y n+1 quedan libres
  const temp = norm.length
  if (result[index] != null && result[index] === result[index - 1]) {
    // desenlazar: la cola del run (desde index) pasa a valor propio
    const group = result[index]
    for (let k = index; k < result.length && result[k] === group; k++) result[k] = temp
  } else {
    // enlazar: el grupo (o suelto) que contiene a index-1 y el que contiene
    // a index se funden en un único valor
    const head = result[index - 1]
    const tail = result[index]
    for (let k = 0; k < result.length; k++) {
      if ((head != null && result[k] === head) || (tail != null && result[k] === tail)) {
        result[k] = temp
      }
    }
    if (head == null) result[index - 1] = temp
    if (tail == null) result[index] = temp
  }
  return normalizeSupersets(result)
}

// A, B, C… Z, AA… — presentacional puro, nunca se persiste
function letterFor(groupId: number): string {
  let label = ''
  let n = groupId
  do {
    label = String.fromCharCode(65 + (n % 26)) + label
    n = Math.floor(n / 26) - 1
  } while (n >= 0)
  return label
}

/** Etiqueta presentacional ('A', 'B'…) por índice, null para sueltos. */
export function supersetLabels(values: SupersetValue[]): Array<string | null> {
  return groupIds(values).map((id) => (id === -1 ? null : letterFor(id)))
}

/** ¿Es `index` el ÚLTIMO miembro (por orden) de su grupo? true también para
 * sueltos: un ejercicio sin grupo siempre "cierra su propia ronda" (el
 * gating del auto-descanso trata ambos casos igual — sí descansa). */
export function isLastOfSuperset(values: SupersetValue[], index: number): boolean {
  const ids = groupIds(values)
  if (ids[index] === -1) return true
  // los runs son contiguos: el último miembro es el que no tiene a su mismo
  // grupo justo después
  return index + 1 >= ids.length || ids[index + 1] !== ids[index]
}

/** Índice del SIGUIENTE miembro del grupo de `index`, o null si es el último
 * o está suelto — alimenta el chip "siguiente" tras registrar una serie. */
export function nextSupersetIndex(values: SupersetValue[], index: number): number | null {
  const ids = groupIds(values)
  if (ids[index] === -1) return null
  return index + 1 < ids.length && ids[index + 1] === ids[index] ? index + 1 : null
}

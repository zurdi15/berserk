import { defineStore } from 'pinia'
import { ref, watch } from 'vue'

import { ApiError, OfflineError } from '@/api/client'
import * as domain from '@/api/domain'
import type { ExerciseHistoryOut, PersonalRecordOut, SetIn, SetLogOut, SetOut, WorkoutExerciseOut, WorkoutOut } from '@/api/domain'
import { i18n } from '@/i18n'
import { normalizeSupersets } from '@/lib/supersets'
import { isNativeShell, startNativeWorkoutChronometer, stopNativeWorkoutChronometer, syncWearTimer } from '@/utils/nativeShell'
import { routineImageUrl } from '@/api/domain'
import { isValidRuneName } from '@/lib/runeResolve'
import { runeDataUrl } from '@/utils/runeImage'
import { online } from '@/offline/net'
import * as outbox from '@/offline/outbox'
import { useRestTimerStore } from '@/stores/restTimer'
import { todayIso } from '@/utils/dates'

// v0.6.0 offline de gimnasio: este store es la pieza que hace el entreno
// usable sin red. Cada mutación tiene dos caminos:
// - online y sin cola pendiente: API + refresh, como siempre.
// - offline O con cola pendiente: aplicar el cambio al workout local de
//   forma optimista (ids temporales NEGATIVOS de outbox.nextTempId) y
//   encolarlo en el outbox para el replay.
// "Con cola pendiente" cuenta como offline aunque haya vuelto la red: si una
// serie encolada aún no se ha reproducido, mandar la siguiente en directo la
// adelantaría (el servidor las numeraría al revés) — la cola es FIFO
// estricta y TODO pasa por ella hasta drenarla (ShellView dispara syncNow).
// El workout local se persiste como snapshot en localStorage en cada cambio:
// recargar la PWA en el gym sin cobertura recupera el entreno tal cual.
const SNAPSHOT_KEY = 'bk:active-workout'

function loadSnapshot(): WorkoutOut | null {
  try {
    const raw = localStorage.getItem(SNAPSHOT_KEY)
    return raw === null ? null : (JSON.parse(raw) as WorkoutOut)
  } catch {
    return null
  }
}

export const useActiveWorkoutStore = defineStore('activeWorkout', () => {
  const workout = ref<WorkoutOut | null>(null)

  // v0.13.1 shell Android (zurdi: "notificación permanente con el tiempo de
  // entreno, como la del cronómetro"): mientras hay entreno vivo, una
  // notificación ongoing con cronómetro DEL SISTEMA corre en barra y
  // pantalla de bloqueo; muere con el entreno (terminar/descartar). El
  // watch cubre TODOS los caminos que fijan workout (start, resume desde
  // snapshot offline, load al arrancar) sin tocar cada uno. En web es no-op.
  watch(
    () => workout.value && workout.value.started_at,
    (startedAt) => {
      if (!isNativeShell()) return
      if (workout.value && workout.value.ended_at === null) {
        // started_at llega naive en UTC del backend; en offline puede faltar
        const parsedMs = startedAt ? Date.parse(`${startedAt}Z`) : Date.now()
        const startedMs = Number.isFinite(parsedMs) ? parsedMs : Date.now()
        const title = i18n.global.t('workout.ongoingTitle')
        // v0.30.0: la imagen de la rutina ilustra la tarjeta de la barra del
        // móvil; v0.34.1: sin foto, su runa (como el hero del pre-inicio), y sin
        // rutina, el bindrune de la casa. Resolver la rutina es asíncrono (la
        // lista viene de la cache de lecturas): el crono arranca en cuanto se sabe
        const routineId = workout.value.routine_id
        void (async () => {
          let imageUrl: string | undefined
          try {
            const routine = routineId != null ? (await domain.listRoutines()).find((r) => r.id === routineId) : undefined
            if (routine?.has_image) imageUrl = routineImageUrl(routine.id)
            else imageUrl = await runeDataUrl(routine?.rune && isValidRuneName(routine.rune) ? routine.rune : 'berserk')
          } catch {
            imageUrl = undefined
          }
          void startNativeWorkoutChronometer(startedMs, title, { imageUrl })
        })()
        // v0.28.0 reloj: el crono del entreno también va a la Data Layer —
        // el reloj lo pinta pequeño bajo la cuenta atrás, o en la esfera si
        // no hay ninguna en marcha
        void syncWearTimer({ kind: 'workout', state: 'running', targetEpochMs: startedMs, title })
      } else {
        void stopNativeWorkoutChronometer()
        void syncWearTimer({ kind: 'workout', state: 'stopped' })
      }
    },
    { immediate: true },
  )
  const loading = ref(false)
  const lastRecords = ref<PersonalRecordOut[]>([])
  // item 3: cache de "última sesión" por exercise_id, vigente mientras dure
  // ESTE entreno — se limpia en cualquier punto donde `workout` pase a
  // referirse a uno distinto (start/resume/reset), porque el resultado
  // depende de qué workout se excluye de la búsqueda (ver exerciseHistory)
  const historyCache = ref(new Map<number, ExerciseHistoryOut | null>())

  // snapshot SIEMPRE al día (flush sync: que una muerte súbita de la pestaña
  // justo tras registrar una serie no pierda el cambio optimista)
  watch(
    workout,
    (value) => {
      try {
        if (value === null) localStorage.removeItem(SNAPSHOT_KEY)
        else localStorage.setItem(SNAPSHOT_KEY, JSON.stringify(value))
      } catch {
        // storage inaccesible: sin snapshot que sobreviva recargas, pero el
        // entreno en memoria sigue intacto (degradación, no rotura)
      }
    },
    { deep: true, flush: 'sync' },
  )

  const offline = () => !online.value || outbox.hasPending()

  async function resume() {
    loading.value = true
    historyCache.value.clear()
    try {
      // con cola pendiente el snapshot local ES la verdad más completa: el
      // servidor aún no tiene las entradas sin reproducir
      if (outbox.hasPending()) {
        workout.value = loadSnapshot()
        return
      }
      workout.value = await domain.getActiveWorkout()
    } catch (error) {
      if (error instanceof OfflineError) {
        workout.value = loadSnapshot()
        return
      }
      // sin entreno activo no es un error: es el estado normal
      if (!(error instanceof ApiError && error.slug === 'no_active_workout')) throw error
      workout.value = null
    } finally {
      loading.value = false
    }
  }

  async function refresh() {
    // offline/cola pendiente: el estado del servidor está incompleto por
    // definición — el workout local optimista manda
    if (offline() || !workout.value) return
    workout.value = await domain.getWorkout(workout.value.id)
  }

  async function start(body: Parameters<typeof domain.startWorkout>[0]) {
    historyCache.value.clear()
    if (!offline()) {
      try {
        workout.value = await domain.startWorkout(body)
        return
      } catch (error) {
        if (!(error instanceof OfflineError)) throw error
        // la red murió justo aquí: cae a la rama offline de abajo
      }
    }
    // arranque offline: la copia de la rutina la hace el cliente con lo
    // último visto (listRoutines viene de readCache sin red); una rutina
    // jamás vista offline no se puede arrancar — OfflineError y toast
    const tempExerciseIds: number[] = []
    let exercises: WorkoutExerciseOut[] = []
    if (body.routine_id != null) {
      const routines = await domain.listRoutines()
      const routine = routines.find((r) => r.id === body.routine_id)
      if (!routine) throw new OfflineError()
      exercises = routine.exercises.map((item, index) => {
        const tempId = outbox.nextTempId()
        tempExerciseIds.push(tempId)
        return {
          id: tempId,
          exercise_id: item.exercise_id,
          position: index + 1,
          note: null,
          rest_seconds: item.rest_seconds ?? null,
          superset_group: item.superset_group ?? null,
          block_label: item.block_label ?? null,
          sets: [],
        }
      })
    }
    const tempWorkoutId = outbox.nextTempId()
    workout.value = {
      id: tempWorkoutId,
      date: body.date ?? todayIso(),
      started_at: new Date().toISOString(),
      ended_at: null,
      routine_id: body.routine_id ?? null,
      note: null,
      feeling: null,
      stretched: false,
      exercises,
      muscle_tag_ids: [],
    }
    outbox.enqueue({ id: outbox.newClientId(), kind: 'startWorkout', tempWorkoutId, body, tempExerciseIds })
  }


  // v0.12.0: nota por ejercicio — cache por store (misma vida que el
  // historial); sin rama offline: sin red no se muestra ni se edita (v1)
  const noteCache = new Map<number, string>()

  async function exerciseNote(exerciseId: number): Promise<string> {
    if (noteCache.has(exerciseId)) return noteCache.get(exerciseId)!
    let note = ''
    try {
      note = (await domain.getExerciseNote(exerciseId)).note
    } catch (error) {
      if (!(error instanceof OfflineError)) throw error
    }
    noteCache.set(exerciseId, note)
    return note
  }

  async function saveExerciseNote(exerciseId: number, note: string): Promise<string> {
    const saved = (await domain.putExerciseNote(exerciseId, note)).note
    noteCache.set(exerciseId, saved)
    return saved
  }

  async function exerciseHistory(exerciseId: number): Promise<ExerciseHistoryOut | null> {
    if (historyCache.value.has(exerciseId)) return historyCache.value.get(exerciseId) ?? null
    let result: ExerciseHistoryOut | null
    try {
      result = await domain.getExerciseHistory(exerciseId, {
        exclude_workout_id: workout.value && workout.value.id > 0 ? workout.value.id : undefined,
      })
    } catch (error) {
      // el hint de "última vez" es prescindible: sin red y sin cache, no hay
      // historial que enseñar — nunca un error de cara al usuario
      if (!(error instanceof OfflineError)) throw error
      result = null
    }
    historyCache.value.set(exerciseId, result)
    return result
  }

  // v0.33.0 (zurdi: "al finalizar un entrenamiento la notificación se queda"):
  // el watch de arriba ya apaga el crono al pasar workout a null, pero se
  // apaga también aquí, explícito e idempotente — un camino menos que depende
  // de que Vue observe el cambio justo como esperamos
  function stopWorkoutChrono() {
    if (!isNativeShell()) return
    void stopNativeWorkoutChronometer()
    void syncWearTimer({ kind: 'workout', state: 'stopped', reason: 'cancelled' })
  }

  async function finish(): Promise<WorkoutOut> {
    if (!offline()) {
      const finished = await domain.finishWorkout(workout.value!.id)
      workout.value = null
      lastRecords.value = []
      stopWorkoutChrono()
      return finished
    }
    // cierre offline: el resumen se construye del estado local; los PRs de
    // las series encoladas se detectarán en el replay (sin celebración — la
    // celebración es un evento en vivo, no una notificación diferida)
    const finished: WorkoutOut = { ...workout.value!, ended_at: new Date().toISOString() }
    outbox.enqueue({ id: outbox.newClientId(), kind: 'finishWorkout', workoutId: finished.id })
    workout.value = null
    lastRecords.value = []
    stopWorkoutChrono()
    return finished
  }

  // v0.17.0 bloques: blockLabel opcional — el stepper del entreno añade al
  // bloque que se está mirando (null/omitido = sin bloque, como siempre)
  async function addExercise(exercise_id: number, blockLabel: string | null = null) {
    if (!offline()) {
      try {
        await domain.addWorkoutExercise(workout.value!.id, {
          exercise_id,
          block_label: blockLabel ?? undefined,
        })
        await refresh()
        return
      } catch (error) {
        if (!(error instanceof OfflineError)) throw error
        // v0.34.0: la red murió (o el timeout saltó) al añadir — misma caída
        // a la rama offline que logSet: el ejercicio aparece ya y se encola
      }
    }
    const tempId = outbox.nextTempId()
    workout.value!.exercises = [
      ...workout.value!.exercises,
      {
        id: tempId,
        exercise_id,
        position: workout.value!.exercises.length + 1,
        note: null,
        // ad-hoc: sin override de descanso (mismo default que el backend
        // aplicaría sin rutina de origen a mano) y siempre suelto
        rest_seconds: null,
        superset_group: null,
        block_label: blockLabel,
        sets: [],
      },
    ]
    outbox.enqueue({
      id: outbox.newClientId(),
      kind: 'addExercise',
      workoutId: workout.value!.id,
      tempExerciseId: tempId,
      exerciseId: exercise_id,
      blockLabel,
    })
  }

  async function removeExercise(weid: number) {
    if (!offline()) {
      await domain.removeWorkoutExercise(workout.value!.id, weid)
      await refresh()
      return
    }
    workout.value!.exercises = workout.value!.exercises
      .filter((e) => e.id !== weid)
      .map((e, index) => ({ ...e, position: index + 1 }))
    outbox.enqueue({
      id: outbox.newClientId(),
      kind: 'removeExercise',
      workoutId: workout.value!.id,
      exerciseId: weid,
    })
  }

  async function reorder(ids: number[]) {
    // reordenar exige red (fuera del alcance offline v1: es raro mid-gym y
    // su endpoint reescribe posiciones en bloque — encolarlo entre altas
    // temporales complica el replay sin caso de uso real)
    workout.value = await domain.reorderWorkoutExercises(workout.value!.id, ids)
  }

  // v0.8.0 (zurdi rediseña la creación): añade DOS ejercicios ya enlazados —
  // composición de acciones existentes, así que hereda el soporte offline
  // entero gratis (dos altas + el bulk de grupos, cada una por su rama).
  // v0.17.0: el par también puede nacer dentro del bloque visible del stepper
  async function addSupersetPair(exerciseA: number, exerciseB: number, blockLabel: string | null = null) {
    await addExercise(exerciseA, blockLabel)
    await addExercise(exerciseB, blockLabel)
    const values = workout.value!.exercises.map((e) => e.superset_group ?? null)
    // valor marcador libre de colisiones (normalize renumera): length nunca
    // coincide con un grupo normalizado existente (siempre < length/2)
    const marker = values.length
    values[values.length - 2] = marker
    values[values.length - 1] = marker
    await setSupersetGroups(normalizeSupersets(values))
  }

  // v0.9.1 (zurdi: el editor de superserie permite "cambiar alguno de los
  // dos ejercicios"): sustituye un miembro del grupo por otro ejercicio —
  // quitar el viejo (SUS SERIES SE VAN CON ÉL, el sheet lo avisa) + añadir
  // el nuevo + recolocarlo en el hueco + reenlazar el grupo. El paso de
  // recolocar usa reorder, que EXIGE red (v1): un cambio de miembro offline
  // falla con OfflineError y el toast estándar — es una edición excepcional,
  // no un gesto de gimnasio en túnel.
  async function swapSupersetMember(oldWeid: number, newExerciseId: number) {
    const exercises = workout.value!.exercises
    const oldIndex = exercises.findIndex((e) => e.id === oldWeid)
    if (oldIndex === -1) return
    const group = exercises[oldIndex].superset_group ?? null

    await removeExercise(oldWeid)
    await addExercise(newExerciseId)

    const current = workout.value!.exercises
    const newWeid = current[current.length - 1].id
    const ids = current.map((e) => e.id)
    ids.pop()
    ids.splice(oldIndex, 0, newWeid)
    workout.value = await domain.reorderWorkoutExercises(workout.value!.id, ids)

    const values = workout.value!.exercises.map((e) => e.superset_group ?? null)
    values[oldIndex] = group
    await setSupersetGroups(normalizeSupersets(values))
  }

  // v0.7.0: superseries editables EN el entreno — recibe el estado completo
  // normalizado por posición (lib/supersets.ts) y lo aplica en bloque
  async function setSupersetGroups(values: (number | null)[]) {
    const exercises = workout.value!.exercises
    if (!offline()) {
      workout.value = await domain.setWorkoutSupersetGroups(
        workout.value!.id,
        exercises.map((e, index) => ({ workout_exercise_id: e.id, superset_group: values[index] ?? null })),
      )
      return
    }
    workout.value!.exercises = exercises.map((e, index) => ({
      ...e,
      superset_group: values[index] ?? null,
    }))
    outbox.enqueue({
      id: outbox.newClientId(),
      kind: 'setSupersetGroups',
      workoutId: workout.value!.id,
      groups: exercises.map((e, index) => ({ exerciseId: e.id, group: values[index] ?? null })),
    })
  }

  function localExercise(weid: number): WorkoutExerciseOut {
    const wex = workout.value!.exercises.find((e) => e.id === weid)
    if (!wex) throw new Error('unknown workout exercise')
    return wex
  }

  async function logSet(weid: number, body: SetIn): Promise<SetLogOut> {
    if (!offline()) {
      try {
        const result = await domain.logSet(workout.value!.id, weid, body)
        if (result.new_records.length) lastRecords.value = result.new_records
        await refresh()
        return result
      } catch (error) {
        if (!(error instanceof OfflineError)) throw error
        // la red murió al registrar: cae a la rama offline — la serie no se
        // pierde (el dedupe por client_id del replay evita duplicarla si el
        // servidor sí la recibió antes de morir la conexión... solo cuando
        // fue el outbox quien la mandó; este primer intento iba SIN
        // client_id, así que aquí el fallo fue antes de llegar al servidor)
      }
    }
    const wex = localExercise(weid)
    const tempSetId = outbox.nextTempId()
    const newSet: SetOut = {
      id: tempSetId,
      set_number: wex.sets.length + 1,
      reps: body.reps ?? null,
      weight_kg: body.weight_kg ?? null,
      duration_seconds: body.duration_seconds ?? null,
      distance_m: body.distance_m ?? null,
      is_warmup: body.is_warmup ?? false,
      rpe: body.rpe ?? null,
      load_mode: body.load_mode ?? 'weight',
      completed_at: new Date().toISOString(),
    }
    wex.sets = [...wex.sets, newSet]
    outbox.enqueue({
      id: outbox.newClientId(),
      kind: 'logSet',
      workoutId: workout.value!.id,
      exerciseId: weid,
      tempSetId,
      body,
    })
    // sin new_records: los PRs se detectan en el servidor al sincronizar
    return { set: newSet, new_records: [] }
  }

  async function updateSet(weid: number, sid: number, body: SetIn) {
    if (!offline()) {
      await domain.updateSet(workout.value!.id, weid, sid, body)
      await refresh()
      return
    }
    const wex = localExercise(weid)
    wex.sets = wex.sets.map((s) =>
      s.id === sid
        ? {
            ...s,
            reps: body.reps ?? null,
            weight_kg: body.weight_kg ?? null,
            duration_seconds: body.duration_seconds ?? null,
            distance_m: body.distance_m ?? null,
            is_warmup: body.is_warmup ?? false,
            rpe: body.rpe ?? null,
            load_mode: body.load_mode ?? 'weight',
          }
        : s,
    )
    outbox.enqueue({
      id: outbox.newClientId(),
      kind: 'updateSet',
      workoutId: workout.value!.id,
      exerciseId: weid,
      setId: sid,
      body,
    })
  }

  async function deleteSet(weid: number, sid: number) {
    if (!offline()) {
      await domain.deleteSet(workout.value!.id, weid, sid)
      await refresh()
      return
    }
    const wex = localExercise(weid)
    wex.sets = wex.sets
      .filter((s) => s.id !== sid)
      .map((s, index) => ({ ...s, set_number: index + 1 }))
    outbox.enqueue({
      id: outbox.newClientId(),
      kind: 'deleteSet',
      workoutId: workout.value!.id,
      exerciseId: weid,
      setId: sid,
    })
  }

  // v0.18.1 (zurdi: "los bloques deberían poder cambiarse también mid
  // entreno"): mover un ejercicio de bloque (o estrenar uno, o sacarlo a
  // sin-bloque) — el stepper agrupa por etiqueta, así que cambiarla basta
  // para que la card salte a su step sin reordenar nada
  async function setExerciseBlock(weid: number, blockLabel: string | null) {
    if (!offline()) {
      await domain.updateWorkoutExercise(workout.value!.id, weid, { block_label: blockLabel })
      await refresh()
      return
    }
    const wex = localExercise(weid)
    wex.block_label = blockLabel
    outbox.enqueue({
      id: outbox.newClientId(),
      kind: 'setExerciseBlock',
      workoutId: workout.value!.id,
      exerciseId: weid,
      blockLabel,
    })
  }

  async function setExerciseRest(weid: number, restSeconds: number | null) {
    if (!offline()) {
      await domain.updateWorkoutExercise(workout.value!.id, weid, { rest_seconds: restSeconds })
      await refresh()
      return
    }
    const wex = localExercise(weid)
    wex.rest_seconds = restSeconds
    outbox.enqueue({
      id: outbox.newClientId(),
      kind: 'setExerciseRest',
      workoutId: workout.value!.id,
      exerciseId: weid,
      restSeconds,
    })
  }

  async function discard() {
    // descartar exige red (v1): es la acción más destructiva del flujo y
    // reproducirla en diferido tras una cola de series sería tirar trabajo
    // registrado sin que el usuario vea qué está tirando
    await domain.deleteWorkout(workout.value!.id)
    workout.value = null
    stopWorkoutChrono()
    lastRecords.value = []
    // el descarte cierra el entreno, así que un descanso en marcha ya no aplica
    useRestTimerStore().clear()
  }

  function reset() {
    workout.value = null
    lastRecords.value = []
    historyCache.value.clear()
  }

  return {
    workout,
    loading,
    lastRecords,
    resume,
    refresh,
    start,
    finish,
    addExercise,
    addSupersetPair,
    removeExercise,
    reorder,
    setSupersetGroups,
    swapSupersetMember,
    logSet,
    updateSet,
    deleteSet,
    discard,
    exerciseHistory,
    exerciseNote,
    saveExerciseNote,
    setExerciseRest,
    setExerciseBlock,
    reset,
  }
})

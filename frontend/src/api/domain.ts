import { api } from './client'
import type { UserOut } from './auth'

export type { UserOut }

// Shared types
export type Measurement = 'strength' | 'bodyweight' | 'timed' | 'cardio'

// Catalog types
export interface MuscleGroupOut {
  id: number
  slug: string
  name_es: string
  name_en: string
  owner_id: number | null
  // item 14: runa dedicada, opcional en el tipo aunque el backend siempre
  // manda la clave (mismo criterio que UserOut.color) — así los fixtures de
  // test ya existentes (sin rune) siguen tipando sin tocarlos. Resolución
  // efectiva SIEMPRE vía runeResolve.groupRune (rune ?? slug), nunca leyendo
  // este campo a pelo.
  rune?: string | null
}

export interface ExerciseMuscleLink {
  muscle_group_id: number
  is_primary: boolean
}

export interface ExerciseOut {
  id: number
  name_es: string
  name_en: string
  // el Out del backend serializa measurement como str suelto (ver
  // backend/app/schemas/catalog.py ExerciseOut), pero ExerciseIn solo acepta
  // estos 4 valores vía Literal: narrower a propósito para que el resto del
  // frontend discrimine por union
  measurement: Measurement
  owner_id: number | null
  // W2 feature 1: ejercicio PROPIO compartido con todo el mundo (distinto de
  // owner_id null, el catálogo admin) — opcional en el tipo aunque el
  // backend siempre manda la clave (mismo criterio que MuscleGroupOut.rune):
  // así los fixtures de test ya existentes (sin is_public) siguen tipando
  // sin tocarlos. Resolución efectiva siempre vía `?? false`.
  is_public?: boolean
  // atribución para la sección catálogo-ish: null para el catálogo admin y
  // para las propias filas del usuario que las pide; opcional por el mismo
  // motivo que is_public arriba
  owner_username?: string | null
  muscle_groups: ExerciseMuscleLink[]
}

// Workout types
export interface SetOut {
  id: number
  set_number: number
  reps: number | null
  weight_kg: number | null
  duration_seconds: number | null
  distance_m: number | null
  is_warmup: boolean
  rpe: number | null
  completed_at: string
}

export interface PersonalRecordOut {
  id: number
  exercise_id: number
  kind: string
  value: number
  achieved_at: string
}

export interface SetLogOut {
  set: SetOut
  new_records: PersonalRecordOut[]
}

export interface WorkoutExerciseOut {
  id: number
  exercise_id: number
  position: number
  note: string | null
  // item 11: override de descanso de ESTE ejercicio en ESTE entreno; null
  // cae al target de la rutina de origen o al default general (ver rest.ts)
  rest_seconds: number | null
  sets: SetOut[]
}

export interface WorkoutOut {
  id: number
  date: string
  started_at: string | null
  ended_at: string | null
  routine_id: number | null
  note: string | null
  feeling: number | null
  // item 8: "check en el entreno" — sin minutos/tipo, solo si se ha estirado
  stretched: boolean
  exercises: WorkoutExerciseOut[]
  // item 4: derivados de los grupos primarios de los ejercicios del entreno,
  // ya no elegidos a mano — de solo lectura desde el frontend (ver
  // routers/workouts.py::sync_derived_muscle_groups)
  muscle_tag_ids: number[]
}

// item 3: historial de la última sesión TERMINADA (no la actual) en la que
// se hizo este ejercicio — usado para el prefill del drawer y el hint de la
// tarjeta compacta (ver components/workout/setDefaults.ts / setHistoryFormat.ts)
export interface ExerciseHistorySetOut {
  reps: number | null
  weight_kg: number | null
  duration_seconds: number | null
  distance_m: number | null
  is_warmup: boolean
}

export interface ExerciseHistoryOut {
  workout_id: number
  date: string
  sets: ExerciseHistorySetOut[]
}

export interface SetIn {
  reps?: number | null
  weight_kg?: number | null
  duration_seconds?: number | null
  distance_m?: number | null
  is_warmup?: boolean
  rpe?: number | null
}

// Routine types
export interface RoutineExerciseOut {
  id: number
  exercise_id: number
  position: number
  target_sets: number
  target_reps: number | null
  target_weight_kg: number | null
  rest_seconds: number | null
}

export interface RoutineOut {
  id: number
  name: string
  description: string | null
  rune: string | null
  color: string | null
  // W2 feature 2: los tres siguientes son opcionales en el tipo aunque el
  // backend siempre los manda (mismo criterio que ExerciseOut.is_public /
  // MuscleGroupOut.rune) — evita tener que tocar fixtures de RoutineOut de
  // otros carriles (RoutineEditorSheet está fuera de este carril) por un
  // campo que no usan. Resolución efectiva siempre vía `?? false` / `?? null`.
  // owner_id: null = plantilla GLOBAL (creada por un admin, ver globalizeRoutine)
  owner_id?: number | null
  // rutina propia compartida como plantilla de solo lectura con el resto
  is_public?: boolean
  // atribución en la sección Plantillas; null para una plantilla GLOBAL
  owner_username?: string | null
  exercises: RoutineExerciseOut[]
}

export interface RoutineExerciseIn {
  exercise_id: number
  target_sets?: number
  target_reps?: number | null
  target_weight_kg?: number | null
  rest_seconds?: number | null
}

// Calendar types
export interface ScheduledOut {
  id: number
  date: string
  time: string | null
  routine_id: number | null
  status: 'planned' | 'done' | 'skipped'
  workout_id: number | null
  note: string | null
}

export interface WorkoutSummaryOut {
  id: number
  date: string
  feeling: number | null
  muscle_group_ids: number[]
}

// SHARED-DOTS OVERLAY (v0.4.1): un usuario que me ha concedido acceso
// (ShareGrant owner->yo), con sus días de entreno terminado ese mes — dato
// mínimo para dots ambient, nunca detalle (eso sigue detrás del modo atleta)
export interface SharedUserOut {
  user_id: number
  username: string
  color: string | null
  dates: string[]
}

export interface CalendarMonthOut {
  scheduled: ScheduledOut[]
  workouts: WorkoutSummaryOut[]
  // ausente (undefined) en modo atleta: el backend OMITE la clave del JSON
  // en vez de mandar [] o null (ver backend schemas/calendar.py) — así el
  // frontend distingue "sin overlay" (viendo a otro) de "overlay vacío" (sin
  // shares propios) sin un segundo flag
  shared?: SharedUserOut[]
}

// Progress types
export interface SeriesPoint {
  workout_id: number
  date: string
  top_weight: number
  volume: number
  est_1rm: number
}

export interface HeatmapDay {
  date: string
  count: number
}

export interface DistributionItem {
  muscle_group_id: number
  sets: number
}

export interface StatsOut {
  total_workouts: number
  total_gym_seconds: number
  total_cardio_seconds: number
  total_distance_m: number
  total_volume_kg: number
  total_sets: number
  total_reps: number
  prs_count: number
  avg_session_seconds: number
  longest_streak_weeks: number
}

// Body types
export interface BodyEntryOut {
  date: string
  weight_kg: number | null
  waist_cm: number | null
  chest_cm: number | null
  arm_cm: number | null
  thigh_cm: number | null
  hip_cm: number | null
}

export interface BodyIn {
  weight_kg?: number | null
  waist_cm?: number | null
  chest_cm?: number | null
  arm_cm?: number | null
  thigh_cm?: number | null
  hip_cm?: number | null
}

export interface SharingOut {
  given: UserOut[]
  received: UserOut[]
}

// item 11: ficha mínima del picker de "conceder acceso" — nunca lleva
// is_admin/locale/timezone (ver backend/app/schemas/users.py UserDirectoryOut)
export interface UserDirectoryEntry {
  id: number
  username: string
  color: string | null
}

export interface InviteOut {
  id: number
  created_at: string
  expires_at: string
  used_at: string | null
}

// Helper function for building query strings
function qs(params: Record<string, unknown>): string {
  const pairs: [string, string][] = Object.entries(params)
    .filter(([, v]) => v !== undefined && v !== null)
    .map(([k, v]) => [k === 'userId' ? 'user_id' : k, String(v)])
  return pairs.length ? `?${new URLSearchParams(pairs)}` : ''
}

// Catalog endpoints
export const listMuscleGroups = (userId?: number) =>
  api<MuscleGroupOut[]>(`/muscle-groups${qs({ userId })}`)

export const createMuscleGroup = (body: {
  slug: string
  name_es: string
  name_en: string
  is_global?: boolean
  rune?: string | null
}) =>
  api<MuscleGroupOut>('/muscle-groups', { method: 'POST', body })

// item 5: no existía PATCH para grupos musculares — un admin lo usa para
// editar nombre de una fila predefinida. item 14: slug ya no dobla como
// "runa" (columna dedicada abajo); el dueño de un grupo propio también
// puede patchear el suyo, no solo un admin sobre uno global (ver _can_edit)
export const updateMuscleGroup = (id: number, body: {
  slug?: string
  name_es?: string
  name_en?: string
  rune?: string | null
}) =>
  api<MuscleGroupOut>(`/muscle-groups/${id}`, { method: 'PATCH', body })

export const deleteMuscleGroup = (id: number) =>
  api<void>(`/muscle-groups/${id}`, { method: 'DELETE' })

export const listExercises = (params: {
  q?: string
  muscle_group_id?: number
  measurement?: string
  userId?: number
} = {}) =>
  api<ExerciseOut[]>(`/exercises${qs(params)}`)

export const createExercise = (body: {
  name_es: string
  name_en: string
  measurement: Measurement
  muscle_groups: ExerciseMuscleLink[]
  // item 3: ejercicio global (owner_id null) — solo un admin puede pedirlo
  is_global?: boolean
  // W2 feature 1: check "Visible para todos" del propio ejercicio
  is_public?: boolean
}) =>
  api<ExerciseOut>('/exercises', { method: 'POST', body })

export const updateExercise = (id: number, body: {
  name_es?: string
  name_en?: string
  muscle_groups?: ExerciseMuscleLink[]
  is_public?: boolean
}) =>
  api<ExerciseOut>(`/exercises/${id}`, { method: 'PATCH', body })

export const deleteExercise = (id: number) =>
  api<void>(`/exercises/${id}`, { method: 'DELETE' })

// Routine endpoints
export const listRoutines = (userId?: number) =>
  api<RoutineOut[]>(`/routines${qs({ userId })}`)

// W2 feature 2: plantillas GLOBALES + públicas de otros usuarios (las
// propias ya vienen en listRoutines) — para la sección "Plantillas" de
// RoutineList. Ruta fija /routines/templates, registrada en el backend
// ANTES de /routines/{id} para no colisionar con ese path param.
export const listRoutineTemplates = () =>
  api<RoutineOut[]>('/routines/templates')

export const createRoutine = (body: {
  name: string
  description?: string | null
  rune?: string | null
  color?: string | null
}) =>
  api<RoutineOut>('/routines', { method: 'POST', body })

export const updateRoutine = (id: number, body: {
  name?: string
  description?: string | null
  rune?: string | null
  color?: string | null
  // W2 feature 2: toggle "Visible para todos" en la tarjeta de RoutineList
  is_public?: boolean
}) =>
  api<RoutineOut>(`/routines/${id}`, { method: 'PATCH', body })

export const deleteRoutine = (id: number) =>
  api<void>(`/routines/${id}`, { method: 'DELETE' })

export const replaceRoutineExercises = (id: number, items: RoutineExerciseIn[]) =>
  api<RoutineOut>(`/routines/${id}/exercises`, { method: 'PUT', body: items })

// W2 feature 2: copia una plantilla visible (global o pública) a MIS
// rutinas — nunca una referencia viva, ver backend routers/routines.py
export const copyRoutine = (id: number) =>
  api<RoutineOut>(`/routines/${id}/copy`, { method: 'POST' })

// W2 feature 2: admin-only — convierte una rutina PROPIA en plantilla
// global (owner_id -> NULL); deja la lista personal del admin
export const globalizeRoutine = (id: number) =>
  api<RoutineOut>(`/routines/${id}/globalize`, { method: 'POST' })

// Workout endpoints
export const startWorkout = (body: {
  date?: string
  routine_id?: number
  scheduled_session_id?: number
  // entreno retroactivo: crea ya cerrado (ver backend WorkoutStartIn) — date
  // pasa a ser obligatorio en ese caso, el backend 422 si falta
  finished?: boolean
}) =>
  api<WorkoutOut>('/workouts', { method: 'POST', body })

export const listWorkouts = (params: {
  from_date?: string
  to_date?: string
  limit?: number
  offset?: number
  userId?: number
} = {}) =>
  api<WorkoutOut[]>(`/workouts${qs(params)}`)

export const getActiveWorkout = () =>
  api<WorkoutOut>('/workouts/active')

export const getWorkout = (id: number, userId?: number) =>
  api<WorkoutOut>(`/workouts/${id}${qs({ userId })}`)

export const finishWorkout = (id: number) =>
  api<WorkoutOut>(`/workouts/${id}/finish`, { method: 'POST' })

export const updateWorkout = (id: number, body: {
  date?: string
  note?: string | null
  feeling?: number | null
  stretched?: boolean
  // item 5 (post-0.3.0): timing editable de un entreno retroactivo — solo
  // aplica sobre uno YA CERRADO (backend: 409 workout_not_finished si no lo
  // está). started_time es "HH:MM" (nunca null: no tiene semántica de
  // "borrar la hora de inicio", ver WorkoutEditView.vue)
  started_time?: string
  duration_minutes?: number
}) =>
  api<WorkoutOut>(`/workouts/${id}`, { method: 'PATCH', body })

export const deleteWorkout = (id: number) =>
  api<void>(`/workouts/${id}`, { method: 'DELETE' })

export const addWorkoutExercise = (id: number, body: {
  exercise_id: number
  note?: string | null
}) =>
  api<WorkoutExerciseOut>(`/workouts/${id}/exercises`, { method: 'POST', body })

// item 11: binding re-añadido (existía antes de round 8 y se había retirado
// al no tener consumidor frontend) — PATCH .../exercises/{weid} ya existía
// en el backend para `note`; ahora también acepta rest_seconds
export const updateWorkoutExercise = (wid: number, weid: number, body: {
  note?: string | null
  rest_seconds?: number | null
}) =>
  api<WorkoutExerciseOut>(`/workouts/${wid}/exercises/${weid}`, { method: 'PATCH', body })

export const removeWorkoutExercise = (wid: number, weid: number) =>
  api<void>(`/workouts/${wid}/exercises/${weid}`, { method: 'DELETE' })

export const reorderWorkoutExercises = (wid: number, ids: number[]) =>
  api<WorkoutOut>(`/workouts/${wid}/exercises-order`, { method: 'PUT', body: { workout_exercise_ids: ids } })

export const logSet = (wid: number, weid: number, body: SetIn) =>
  api<SetLogOut>(`/workouts/${wid}/exercises/${weid}/sets`, { method: 'POST', body })

export const updateSet = (wid: number, weid: number, sid: number, body: SetIn) =>
  api<SetOut>(`/workouts/${wid}/exercises/${weid}/sets/${sid}`, { method: 'PATCH', body })

export const deleteSet = (wid: number, weid: number, sid: number) =>
  api<void>(`/workouts/${wid}/exercises/${weid}/sets/${sid}`, { method: 'DELETE' })

// Calendar endpoints
export const schedule = (body: {
  date: string
  time?: string | null
  routine_id?: number | null
  note?: string | null
}) =>
  api<ScheduledOut>('/calendar', { method: 'POST', body })

export const getMonth = (year: number, month: number, userId?: number) =>
  api<CalendarMonthOut>(`/calendar/${year}/${month}${qs({ userId })}`)

export const updateSchedule = (id: number, body: {
  date?: string
  time?: string | null
  routine_id?: number | null
  note?: string | null
  status?: 'planned' | 'skipped'
}) =>
  api<ScheduledOut>(`/calendar/${id}`, { method: 'PATCH', body })

export const deleteSchedule = (id: number) =>
  api<void>(`/calendar/${id}`, { method: 'DELETE' })

// Progress endpoints
export const getSeries = (exerciseId: number, userId?: number) =>
  api<{ series: SeriesPoint[] }>(`/progress/exercises/${exerciseId}${qs({ userId })}`)

export const getRecords = (params: {
  exercise_id?: number
  userId?: number
} = {}) =>
  api<PersonalRecordOut[]>(`/progress/records${qs(params)}`)

export const getHeatmap = (year: number, userId?: number) =>
  api<HeatmapDay[]>(`/progress/heatmap/${year}${qs({ userId })}`)

export const getStreak = (userId?: number) =>
  api<{ weeks: number }>(`/progress/streak${qs({ userId })}`)

export const getDistribution = (weeks?: number, userId?: number) =>
  api<DistributionItem[]>(`/progress/muscle-distribution${qs({ weeks, userId })}`)

export const getTrainedExercises = (userId?: number) =>
  api<{ exercise_ids: number[] }>(`/progress/trained-exercises${qs({ userId })}`)

export const getStats = (userId?: number) =>
  api<StatsOut>(`/progress/stats${qs({ userId })}`)

export const getExerciseHistory = (
  exerciseId: number,
  params: { exclude_workout_id?: number; userId?: number } = {},
) =>
  api<ExerciseHistoryOut | null>(`/progress/exercise-history/${exerciseId}${qs(params)}`)

// Body endpoints
export const listBody = (userId?: number) =>
  api<BodyEntryOut[]>(`/body${qs({ userId })}`)

export const upsertBody = (date: string, body: BodyIn) =>
  api<BodyEntryOut>(`/body/${date}`, { method: 'PUT', body })

export const deleteBody = (date: string) =>
  api<void>(`/body/${date}`, { method: 'DELETE' })

// Sharing endpoints
export const getSharing = () =>
  api<SharingOut>('/sharing')

export const grantSharing = (username: string) =>
  api<UserOut>('/sharing', { method: 'POST', body: { username } })

export const revokeSharing = (viewerId: number) =>
  api<void>(`/sharing/${viewerId}`, { method: 'DELETE' })

// item 11: listado (autenticado, NO admin-only) para el picker de conceder
// acceso — no hay username-guessing, se elige de una lista real
export const listUserDirectory = () =>
  api<UserDirectoryEntry[]>('/users/directory')

// Admin endpoints
export const adminListUsers = () =>
  api<UserOut[]>('/admin/users')

export const adminCreateUser = (body: {
  username: string
  password: string
  is_admin?: boolean
}) =>
  api<UserOut>('/admin/users', { method: 'POST', body })

export const adminUpdateUser = (id: number, body: {
  // item (v0.4.0): el admin ya puede editar nombre y color, no solo
  // password/is_admin — color es anulable a propósito (null limpia al
  // aurora del tema, mismo criterio que /users/me), username no (un null
  // explícito lo ignora, ver backend routers/admin.py::update_user)
  username?: string
  password?: string
  is_admin?: boolean
  color?: string | null
}) =>
  api<UserOut>(`/admin/users/${id}`, { method: 'PATCH', body })

export const adminDeleteUser = (id: number) =>
  api<void>(`/admin/users/${id}`, { method: 'DELETE' })

export const adminCreateInvite = () =>
  api<{ token: string }>('/admin/invites', { method: 'POST' })

export const adminListInvites = () =>
  api<InviteOut[]>('/admin/invites')

export const adminDeleteInvite = (id: number) =>
  api<void>(`/admin/invites/${id}`, { method: 'DELETE' })

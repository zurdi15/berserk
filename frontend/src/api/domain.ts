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

export interface CalendarMonthOut {
  scheduled: ScheduledOut[]
  workouts: WorkoutSummaryOut[]
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
}) =>
  api<MuscleGroupOut>('/muscle-groups', { method: 'POST', body })

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
}) =>
  api<ExerciseOut>('/exercises', { method: 'POST', body })

export const updateExercise = (id: number, body: {
  name_es?: string
  name_en?: string
  muscle_groups?: ExerciseMuscleLink[]
}) =>
  api<ExerciseOut>(`/exercises/${id}`, { method: 'PATCH', body })

export const deleteExercise = (id: number) =>
  api<void>(`/exercises/${id}`, { method: 'DELETE' })

// Routine endpoints
export const listRoutines = (userId?: number) =>
  api<RoutineOut[]>(`/routines${qs({ userId })}`)

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
}) =>
  api<RoutineOut>(`/routines/${id}`, { method: 'PATCH', body })

export const deleteRoutine = (id: number) =>
  api<void>(`/routines/${id}`, { method: 'DELETE' })

export const replaceRoutineExercises = (id: number, items: RoutineExerciseIn[]) =>
  api<RoutineOut>(`/routines/${id}/exercises`, { method: 'PUT', body: items })

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
  password?: string
  is_admin?: boolean
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

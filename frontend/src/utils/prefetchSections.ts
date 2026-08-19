// v0.21.4 (zurdi: "nada más entrar, un pre-fetch de toda la info de las 5
// secciones — cuando haga click en Perfil, la actividad reciente ya ha
// cargado"): al montar el shell se disparan EN PARALELO las lecturas de
// todas las secciones y se guardan en viewCache bajo LAS MISMAS CLAVES que
// cada vista ya lee (patrón SWR del facelift v3: hidratar al instante,
// refrescar en fondo). Con esto la PRIMERA visita a cada sección pinta como
// la segunda: sin esperar red.
//
// Reglas de la casa:
// - Solo datos PROPIOS (claves ':me'): el modo atleta sigue siendo
//   network-first con sus claves por userId, sin cambios.
// - Promise.allSettled y todo fallo en silencio: esto es un calentador de
//   caché, jamás un toast — cada vista conserva su propio manejo de errores.
// - Los snapshots compuestos (today:me, routines:list, library:all) solo se
//   escriben si TODAS sus piezas resolvieron: un snapshot a medias rompería
//   el hydrate de su vista (asigna todos los campos sin mirar).
// - La sección de aterrizaje dispara sus propias llamadas a la vez que
//   estas (duplicado asumido, una vez por arranque): deduplicar contra los
//   fetch de cada vista acoplaría todo por un puñado de GETs pequeños.
import type {
  CalendarMonthOut,
  DistributionItem,
  ExerciseOut,
  FeedOut,
  HeatmapDay,
  MuscleGroupOut,
  PersonalRecordOut,
  RotationOut,
  RoutineOut,
  ScheduledOut,
  StatsOut,
  WorkoutOut,
} from '@/api/domain'
import {
  getDistribution,
  getHeatmap,
  getMonth,
  getRecords,
  getRotation,
  getSocialFeed,
  getStats,
  getStreak,
  listExercises,
  listMuscleGroups,
  listRoutines,
  listRoutineTemplates,
  listWorkouts,
} from '@/api/domain'
import { getMondayOfWeek, todayIso } from '@/utils/dates'
import { setViewCache } from '@/utils/viewCache'

function ok<T>(result: PromiseSettledResult<T>): T | undefined {
  return result.status === 'fulfilled' ? result.value : undefined
}

export async function prefetchSections(): Promise<void> {
  const today = todayIso()
  const monday = getMondayOfWeek()
  const now = new Date()
  const year = now.getFullYear()
  const month = now.getMonth() + 1

  const [
    streakR,
    monthR,
    weekWorkoutsR,
    recordsR,
    exercisesR,
    muscleGroupsR,
    distributionR,
    rotationR,
    feedR,
    heatmapR,
    statsR,
    routinesR,
    templatesR,
  ] = await Promise.allSettled([
    getStreak(),
    getMonth(year, month),
    listWorkouts({ from_date: monday, to_date: today }),
    getRecords({}),
    listExercises({}),
    listMuscleGroups(),
    getDistribution(4),
    getRotation(),
    getSocialFeed(),
    getHeatmap(year),
    getStats(),
    listRoutines(),
    listRoutineTemplates(),
  ])

  const streak = ok<{ weeks: number }>(streakR)
  const monthData = ok<CalendarMonthOut>(monthR)
  const weekWorkouts = ok<WorkoutOut[]>(weekWorkoutsR)
  const records = ok<PersonalRecordOut[]>(recordsR)
  const exercises = ok<ExerciseOut[]>(exercisesR)
  const muscleGroups = ok<MuscleGroupOut[]>(muscleGroupsR)
  const distribution = ok<DistributionItem[]>(distributionR)
  const rotation = ok<RotationOut>(rotationR)
  const feed = ok<FeedOut>(feedR)
  const heatmap = ok<HeatmapDay[]>(heatmapR)
  const stats = ok<StatsOut>(statsR)
  const routines = ok<RoutineOut[]>(routinesR)
  const templates = ok<RoutineOut[]>(templatesR)

  // HOY — snapshot completo o nada (ver regla arriba); TodaySnapshot vive en
  // TodayView, aquí se replica su shape campo a campo (claves compartidas =
  // contrato compartido)
  if (streak && monthData && weekWorkouts && records && exercises && muscleGroups && distribution) {
    setViewCache<{
      streak: { weeks: number } | null
      schedules: ScheduledOut[]
      workouts: WorkoutOut[]
      records: PersonalRecordOut[]
      exercises: ExerciseOut[]
      muscleGroups: MuscleGroupOut[]
      distribution: DistributionItem[]
    }>('today:me', {
      streak,
      schedules: monthData.scheduled,
      workouts: weekWorkouts,
      records,
      exercises,
      muscleGroups,
      distribution,
    })
  }
  if (rotation) setViewCache('today:rotation', rotation)
  if (feed) setViewCache('today:feed', feed)

  // CALENDARIO
  if (muscleGroups) setViewCache('mgroups:me', muscleGroups)
  if (monthData) setViewCache(`cal:me:${year}-${month}`, monthData)
  if (heatmap) setViewCache(`heatmap:me:${year}`, heatmap)

  // PROGRESIÓN
  if (exercises) setViewCache('progress:catalog:me', exercises)
  if (records) setViewCache('progress:records:me', records)
  if (stats) setViewCache('progress:stats:me', stats)

  // PERFIL — puntos de la semana (mismo derivado que ProfileView.loadWeek)
  if (weekWorkouts) setViewCache('profile:week', [...new Set(weekWorkouts.map((w) => w.date))])

  // RUTINAS y BIBLIOTECA (los hubs de Perfil) — y las mismas claves hidratan
  // el catálogo de la sección Entreno (ver WorkoutView.loadCatalog)
  if (routines && templates && exercises) {
    setViewCache('routines:list', { routines, templates, catalog: exercises })
  }
  if (exercises && muscleGroups) {
    setViewCache('library:all', { exercises, groups: muscleGroups })
  }
}

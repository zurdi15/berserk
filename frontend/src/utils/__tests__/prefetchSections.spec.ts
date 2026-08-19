import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/api/domain', () => ({
  getStreak: vi.fn(async () => ({ weeks: 3 })),
  getMonth: vi.fn(async () => ({ workouts: [] })),
  listWorkouts: vi.fn(async () => [
    { id: 1, date: '2026-08-18' },
    { id: 2, date: '2026-08-19' },
    { id: 3, date: '2026-08-19' },
  ]),
  getRecords: vi.fn(async () => [{ id: 9, kind: 'max_weight' }]),
  listExercises: vi.fn(async () => [{ id: 5, name_es: 'Press banca' }]),
  listMuscleGroups: vi.fn(async () => [{ id: 1, slug: 'chest' }]),
  getDistribution: vi.fn(async () => [{ muscle_group_id: 1, sets: 4 }]),
  getRotation: vi.fn(async () => ({ routines: [], next_position: null })),
  getSocialFeed: vi.fn(async () => ({ events: [], comparison: [] })),
  getHeatmap: vi.fn(async () => [{ date: '2026-08-19', count: 1 }]),
  getStats: vi.fn(async () => ({ total_workouts: 7 })),
  listRoutines: vi.fn(async () => [{ id: 3, name: 'Push' }]),
  listRoutineTemplates: vi.fn(async () => [{ id: 4, name: 'Global' }]),
}))

import * as domain from '@/api/domain'
import { prefetchSections } from '../prefetchSections'
import { clearViewCache, getViewCache } from '../viewCache'

// v0.21.4 (zurdi: "nada más entrar, un pre-fetch de toda la info de las 5
// secciones"): las claves escritas aquí son EXACTAMENTE las que cada vista
// lee — este spec es el contrato compartido
describe('prefetchSections', () => {
  beforeEach(() => {
    clearViewCache()
    vi.clearAllMocks()
  })

  it('warms every section cache under the exact keys the views read', async () => {
    await prefetchSections()

    const now = new Date()
    const year = now.getFullYear()
    const month = now.getMonth() + 1

    // HOY: snapshot completo con el shape de TodayView
    const today = getViewCache<Record<string, unknown>>('today:me')
    expect(today).toBeDefined()
    expect(Object.keys(today!).sort()).toEqual(
      ['distribution', 'exercises', 'muscleGroups', 'records', 'streak', 'workouts'].sort(),
    )
    expect(today!.streak).toEqual({ weeks: 3 })
    expect(getViewCache('today:rotation')).toEqual({ routines: [], next_position: null })
    expect(getViewCache('today:feed')).toEqual({ events: [], comparison: [] })

    // CALENDARIO
    expect(getViewCache('mgroups:me')).toEqual([{ id: 1, slug: 'chest' }])
    expect(getViewCache(`cal:me:${year}-${month}`)).toEqual({ workouts: [] })
    expect(getViewCache(`heatmap:me:${year}`)).toEqual([{ date: '2026-08-19', count: 1 }])

    // PROGRESIÓN
    expect(getViewCache('progress:catalog:me')).toEqual([{ id: 5, name_es: 'Press banca' }])
    expect(getViewCache('progress:records:me')).toEqual([{ id: 9, kind: 'max_weight' }])
    expect(getViewCache('progress:stats:me')).toEqual({ total_workouts: 7 })

    // PERFIL: fechas de la semana, deduplicadas (mismo derivado que loadWeek)
    expect(getViewCache('profile:week')).toEqual(['2026-08-18', '2026-08-19'])

    // RUTINAS/BIBLIOTECA (y el catálogo de la sección Entreno lee estas)
    expect(getViewCache('routines:list')).toEqual({
      routines: [{ id: 3, name: 'Push' }],
      templates: [{ id: 4, name: 'Global' }],
      catalog: [{ id: 5, name_es: 'Press banca' }],
    })
    expect(getViewCache('library:all')).toEqual({
      exercises: [{ id: 5, name_es: 'Press banca' }],
      groups: [{ id: 1, slug: 'chest' }],
    })
  })

  it('prefetches OWN data only (no userId threading anywhere)', async () => {
    await prefetchSections()
    expect(domain.getStreak).toHaveBeenCalledWith()
    expect(domain.getRecords).toHaveBeenCalledWith({})
    expect(domain.listExercises).toHaveBeenCalledWith({})
  })

  it('a failed piece never blocks the rest, and a composite snapshot missing a piece is skipped', async () => {
    vi.mocked(domain.getStreak).mockRejectedValueOnce(new Error('boom'))
    vi.mocked(domain.getSocialFeed).mockRejectedValueOnce(new Error('boom'))

    await expect(prefetchSections()).resolves.toBeUndefined()

    // el snapshot de Hoy pierde una pieza (streak) → NO se escribe a medias
    expect(getViewCache('today:me')).toBeUndefined()
    expect(getViewCache('today:feed')).toBeUndefined()
    // pero todo lo demás sí calienta
    expect(getViewCache('progress:stats:me')).toBeDefined()
    expect(getViewCache('routines:list')).toBeDefined()
    expect(getViewCache('profile:week')).toBeDefined()
  })
})

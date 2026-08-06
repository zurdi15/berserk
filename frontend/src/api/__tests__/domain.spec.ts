import { afterEach, describe, expect, it, vi } from 'vitest'

import * as domain from '../domain'

function spyFetch() {
  const spy = vi.fn(async () => new Response(JSON.stringify({}), {
    status: 200, headers: { 'Content-Type': 'application/json' },
  }))
  vi.stubGlobal('fetch', spy)
  return spy
}

afterEach(() => vi.unstubAllGlobals())

describe('domain api paths', () => {
  it('builds catalog and sharing-aware urls', async () => {
    const spy = spyFetch()
    await domain.listExercises({ q: 'press', muscle_group_id: 3, userId: 7 })
    await domain.listMuscleGroups()
    await domain.getMonth(2026, 8, 7)
    await domain.getStreak()
    await domain.getSeries(12, 7)
    const urls = spy.mock.calls.map((c: any) => c[0])
    expect(urls).toEqual([
      '/api/v1/exercises?q=press&muscle_group_id=3&user_id=7',
      '/api/v1/muscle-groups',
      '/api/v1/calendar/2026/8?user_id=7',
      '/api/v1/progress/streak',
      '/api/v1/progress/exercises/12?user_id=7',
    ])
  })

  it('hits workout set endpoints with the nested path and method', async () => {
    const spy = spyFetch()
    await domain.logSet(4, 9, { reps: 5, weight_kg: 100, is_warmup: false })
    await domain.reorderWorkoutExercises(4, [9, 8])
    await domain.deleteSet(4, 9, 33)
    const calls = spy.mock.calls.map((c: any) => [c[0], c[1]?.method])
    expect(calls).toEqual([
      ['/api/v1/workouts/4/exercises/9/sets', 'POST'],
      ['/api/v1/workouts/4/exercises-order', 'PUT'],
      ['/api/v1/workouts/4/exercises/9/sets/33', 'DELETE'],
    ])
  })

  it('admin and body endpoints', async () => {
    const spy = spyFetch()
    await domain.adminCreateInvite()
    await domain.upsertBody('2026-08-05', { weight_kg: 80 })
    const calls = spy.mock.calls.map((c: any) => [c[0], c[1]?.method])
    expect(calls).toEqual([
      ['/api/v1/admin/invites', 'POST'],
      ['/api/v1/body/2026-08-05', 'PUT'],
    ])
  })

  it('replaceRoutineExercises sends bare array', async () => {
    const spy = spyFetch()
    const items = [{ exercise_id: 1, target_sets: 3 }]
    await domain.replaceRoutineExercises(5, items)
    const [url, opts] = spy.mock.calls[0] as any
    expect(url).toBe('/api/v1/routines/5/exercises')
    expect(opts.method).toBe('PUT')
    expect(JSON.parse(opts.body as string)).toEqual(items)
  })

  // item 11: binding re-añadido tras haberse retirado por falta de consumidor
  // (round 8) — ahora WorkoutExerciseCard lo usa para el override de descanso
  it('updateWorkoutExercise PATCHes the nested workout-exercise path', async () => {
    const spy = spyFetch()
    await domain.updateWorkoutExercise(4, 9, { rest_seconds: 120 })
    const [url, opts] = spy.mock.calls[0] as any
    expect(url).toBe('/api/v1/workouts/4/exercises/9')
    expect(opts.method).toBe('PATCH')
    expect(JSON.parse(opts.body as string)).toEqual({ rest_seconds: 120 })
  })

  // item 3: historial de la última sesión terminada de un ejercicio
  it('getExerciseHistory uses the exercise-history path with exclude/user query params', async () => {
    const spy = spyFetch()
    await domain.getExerciseHistory(12, { exclude_workout_id: 4, userId: 7 })
    const url = (spy.mock.calls[0] as any)?.[0] as string
    expect(url).toBe('/api/v1/progress/exercise-history/12?exclude_workout_id=4&user_id=7')
  })

  it('getDistribution uses muscle-distribution path', async () => {
    const spy = spyFetch()
    await domain.getDistribution(12, 7)
    const url = (spy.mock.calls[0] as any)?.[0] as string
    expect(url).toBe('/api/v1/progress/muscle-distribution?weeks=12&user_id=7')
  })
})

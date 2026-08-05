# berserk Phase 4: Views Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The five real views of berserk — Hoy, Calendario, Entreno (with the global rest timer and PR celebration), Progresión and Perfil (settings, rutinas, sharing, admin) — plus the integration glue (401 handling, error toasts, locale sync, athlete view-mode, desktop nav) on top of the phase-2 API and phase-3 design system.

**Architecture:** A thin typed domain API layer (`api/domain.ts`) mirrors the backend routes exactly. Three Pinia stores carry cross-view state (activeWorkout, restTimer, athlete); everything else is view-local fetching through composables. Views compose Bk* primitives exclusively; feature subcomponents live in `components/<feature>/`. The rest timer uses absolute timestamps and renders as a global pill in the shell; PR celebration is an overlay fed by `SetLogOut.new_records` from live logging only.

**Tech Stack:** Vue 3.5 + TS, Pinia, vue-router, vue-i18n, uPlot (new dep) — no other additions.

## Global Constraints

- Everything from phases 1-3 still binds: semantic tokens/utilities only (guard-enforced), entry-only transform/opacity CSS animations under the single reduced-motion guard, ALL user-facing copy via vue-i18n added to BOTH `es.ts` and `en.ts` (key-parity test must stay green), kg canonical with `utils/units` display conversion, Spanish "why" comments / English identifiers, conventional commits, TDD per task, tests colocated in `__tests__` (happy-dom default; `// @vitest-environment node` only for file-reading specs).
- Sharing reads thread `?user_id=` (athlete store); mutations NEVER take user_id.
- Ember is EXCLUSIVELY for achievements (PR celebration, streak flame; the bootstrap screen exception is already sanctioned). Aurora = interaction/data.
- Timer pill uses `z-(--bk-z-timer)`; toasts stay above it (`--bk-z-toast` = 60 > timer 70? tokens: nav 40, sheet 50, toast 60, timer 70 — timer sits ABOVE toasts by token design; keep as tokens define, do not invent values).
- API error surface: every catch path either handles the slug locally (form error) or calls `toastApiError(error)` — no silent failures.
- Phase-5 carries stay OUT of scope: toast a11y/keyboard, font precache, spacing-token bridge, guard pattern widening.
- Commands run from `frontend/` on branch `feat/phase-4-views`; `npm run test` and `npm run build` green before every commit.

## File Structure (new/modified)

```
frontend/src/
├── api/domain.ts                    # NEW: typed endpoints for the whole phase-2 API
├── api/client.ts                    # MOD: 401 hook
├── i18n/index.ts                    # MOD: singleton + applyLocale
├── i18n/{es,en}.ts                  # MOD per task: new namespaces
├── utils/apiErrors.ts               # NEW: toastApiError
├── utils/dates.ts                   # NEW: month/weekday helpers
├── stores/{athlete,activeWorkout,restTimer}.ts   # NEW
├── stores/auth.ts                   # MOD: locale sync + init recovery
├── router/index.ts                  # MOD: guard error handling
├── lib/{BkTabs,BkSelect,BkHeatmap,BkChart}.vue   # NEW primitives
├── components/
│   ├── shell/{TimerPill,AthleteBanner}.vue
│   ├── profile/{SettingsCard,PasswordCard,SharingCard,AdminCard}.vue
│   ├── routines/{RoutineList,RoutineEditorSheet}.vue
│   ├── today/{StreakCard,TodaySessionCard,WeekSummaryCard,RecentPrs}.vue
│   ├── calendar/{MonthGrid,ScheduleSheet}.vue
│   ├── workout/{WorkoutExerciseCard,SetForm,AddExerciseSheet,FinishSummary}.vue
│   ├── progress/{ExercisePicker,PrList,DistributionBars,BodySection}.vue
│   └── celebration/BkCelebration.vue
└── views/{TodayView,CalendarView,WorkoutView,ProgressView,ProfileView}.vue  # replace placeholders
```

---

### Task 1: Integration base (401 hook, error toasts, locale sync, init recovery)

**Files:**
- Modify: `frontend/src/api/client.ts`, `frontend/src/i18n/index.ts`, `frontend/src/stores/auth.ts`, `frontend/src/router/index.ts`, `frontend/src/main.ts`, `frontend/src/composables/useLocale.ts`
- Create: `frontend/src/utils/apiErrors.ts`
- Test: `frontend/src/utils/__tests__/apiErrors.spec.ts`, extend `frontend/src/stores/__tests__/auth.spec.ts`

**Interfaces:**
- Produces: `setUnauthorizedHandler(fn: (() => void) | null)` in client.ts — invoked once per `ApiError` with status 401 AND slug `not_authenticated` (login's `invalid_credentials` 401 must NOT trigger it); `i18n` singleton + `applyLocale(locale: string)` exported from `i18n/index.ts` (validates 'es'|'en', sets global locale + `document.documentElement.lang`); `toastApiError(error: unknown)` in `utils/apiErrors.ts` (ApiError slug → `errors.<slug>` when `i18n.global.te()` else `errors.generic`; non-ApiError → generic; pushes kind 'error' toast); auth store: `applyLocale(user.locale)` after every session resolution, and `init()` no longer caches `ready` on non-401 failure (recoverable retry); router guard wraps `auth.init()` in try/catch → on failure `toastApiError` + allow only login route.

- [ ] **Step 1: Write the failing tests**

`frontend/src/utils/__tests__/apiErrors.spec.ts`:

```typescript
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it } from 'vitest'

import { ApiError } from '@/api/client'
import { i18n } from '@/i18n'
import { useToastStore } from '@/stores/toast'
import { toastApiError } from '../apiErrors'

describe('toastApiError', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    i18n.global.locale.value = 'es'
  })

  it('maps a known slug through i18n', () => {
    toastApiError(new ApiError(409, 'already_shared'))
    const store = useToastStore()
    expect(store.toasts[0].kind).toBe('error')
    expect(store.toasts[0].message).toBe('Ya compartes con ese usuario.')
  })

  it('falls back to generic for unknown slugs and non-ApiError', () => {
    toastApiError(new ApiError(500, 'slug_from_the_future'))
    toastApiError(new TypeError('network down'))
    const store = useToastStore()
    expect(store.toasts.map((t) => t.message)).toEqual([
      'Algo ha fallado. Inténtalo de nuevo.',
      'Algo ha fallado. Inténtalo de nuevo.',
    ])
  })
})
```

Extend `frontend/src/stores/__tests__/auth.spec.ts` with:

```typescript
  it('applies the user locale on session resolution', async () => {
    vi.mocked(authApi.getStatus).mockResolvedValue({ bootstrapped: true })
    vi.mocked(authApi.me).mockResolvedValue({ ...user, locale: 'en' })
    const store = useAuthStore()
    await store.init()
    const { i18n } = await import('@/i18n')
    expect(i18n.global.locale.value).toBe('en')
  })

  it('does not cache ready on non-401 init failure', async () => {
    vi.mocked(authApi.getStatus).mockRejectedValue(new ApiError(500, 'generic'))
    const store = useAuthStore()
    await expect(store.init()).rejects.toBeInstanceOf(ApiError)
    expect(store.ready).toBe(false)
    // recuperación: el siguiente init reintenta de verdad
    vi.mocked(authApi.getStatus).mockResolvedValue({ bootstrapped: true })
    vi.mocked(authApi.me).mockResolvedValue(user)
    await store.init()
    expect(store.ready).toBe(true)
  })
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd frontend && npm run test`
Expected: FAIL — `toastApiError`/`i18n` singleton missing; auth behaviors unimplemented.

- [ ] **Step 3: Implement**

`frontend/src/i18n/index.ts` — replace content:

```typescript
import { createI18n } from 'vue-i18n'

import { en } from './en'
import { es } from './es'

export type Locale = 'es' | 'en'

export function createI18nInstance(locale: Locale = 'es') {
  return createI18n({
    legacy: false,
    locale,
    fallbackLocale: 'es',
    messages: { es, en },
  })
}

// instancia única: los helpers fuera de componentes (toasts de error,
// sincronización de locale del backend) necesitan el mismo i18n que la app
export const i18n = createI18nInstance()

export function applyLocale(locale: string) {
  if (locale !== 'es' && locale !== 'en') return
  i18n.global.locale.value = locale
  document.documentElement.lang = locale
}
```

`frontend/src/main.ts`: use the singleton (`app.use(i18n)` instead of `app.use(createI18nInstance())`; adjust import) and, after `app.use(router)`, wire:

```typescript
import { setUnauthorizedHandler } from './api/client'
import { useAuthStore } from './stores/auth'

setUnauthorizedHandler(() => {
  // sesión muerta a mitad de uso: fuera al login sin bucles (el guard haría
  // lo mismo, pero solo en navegación; esto cubre cualquier fetch)
  const auth = useAuthStore()
  auth.user = null
  router.push({ name: 'login' })
})
```

(`useAuthStore` outside setup works because pinia is installed on `app` before any call fires.)

`frontend/src/api/client.ts` — add:

```typescript
let unauthorizedHandler: (() => void) | null = null

export function setUnauthorizedHandler(fn: (() => void) | null) {
  unauthorizedHandler = fn
}
```

and inside the `!response.ok` branch, before throwing:

```typescript
    const slug = toSlug((payload as { detail?: unknown }).detail)
    if (response.status === 401 && slug === 'not_authenticated') {
      unauthorizedHandler?.()
    }
    throw new ApiError(response.status, slug)
```

`frontend/src/utils/apiErrors.ts`:

```typescript
import { ApiError } from '@/api/client'
import { i18n } from '@/i18n'
import { useToastStore } from '@/stores/toast'

export function toastApiError(error: unknown) {
  const slug = error instanceof ApiError ? error.slug : 'generic'
  const key = `errors.${slug}`
  const message = i18n.global.te(key) ? i18n.global.t(key) : i18n.global.t('errors.generic')
  useToastStore().push('error', message)
}
```

`frontend/src/stores/auth.ts` — three changes:
1. import `applyLocale` from `@/i18n`; call `applyLocale(user.value.locale)` right after `user.value` is set in `init()`, `login()` and `bootstrapAccount()`.
2. `init()` failure semantics:

```typescript
  async function init() {
    if (ready.value) return
    try {
      bootstrapped.value = (await authApi.getStatus()).bootstrapped
      if (bootstrapped.value) {
        user.value = await authApi.me()
        applyLocale(user.value.locale)
      }
      ready.value = true
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        // sin sesión no hay usuario: el guard redirige a login sin ruido
        ready.value = true
        return
      }
      // fallo real (red, 500): no cachear el estado — el próximo init reintenta
      throw error
    }
  }
```

`frontend/src/router/index.ts` — guard resilience:

```typescript
router.beforeEach(async (to) => {
  const auth = useAuthStore()
  try {
    await auth.init()
  } catch (error) {
    toastApiError(error)
    // backend caído: el login es estático y es el único destino con sentido
    return to.name === 'login' ? true : { name: 'login' }
  }
  // ... (el resto del guard existente, sin cambios)
})
```

(import `toastApiError`.)

`frontend/src/composables/useLocale.ts` — fix the stale comment ("la Task 7 conecta el PATCH real" → explain persist is injected by Perfil) and route through `applyLocale`:

```typescript
import { applyLocale, type Locale } from '@/i18n'

// persist es inyectable: Perfil conecta el PATCH /users/me; sin sesión, no-op
export function useLocale(persist: (locale: Locale) => void = () => {}) {
  function setLocale(next: Locale) {
    applyLocale(next)
    persist(next)
  }
  return { setLocale }
}
```

- [ ] **Step 4: Run tests, build**

Run: `cd frontend && npm run test && npm run build`
Expected: all green (existing suites unaffected; router spec still passes with the try/catch).

- [ ] **Step 5: Commit**

```bash
git add frontend/
git commit -m "feat: api 401 hook, error toasts, locale sync and resilient boot"
```

---

### Task 2: Domain API layer

**Files:**
- Create: `frontend/src/api/domain.ts`
- Test: `frontend/src/api/__tests__/domain.spec.ts`

**Interfaces:**
- Produces (ALL functions accept an optional trailing `userId?: number` ONLY where the backend endpoint is a TargetUser read — it serializes as `?user_id=`): types `MuscleGroupOut, ExerciseOut, ExerciseMuscleLink, RoutineOut, RoutineExerciseOut, RoutineExerciseIn, WorkoutOut, WorkoutExerciseOut, SetOut, SetIn, SetLogOut, PersonalRecordOut, ScheduledOut, CalendarMonthOut, WorkoutSummaryOut, SeriesPoint, HeatmapDay, DistributionItem, BodyEntryOut, BodyIn, SharingOut, InviteOut` mirroring the backend schemas field-for-field (snake_case preserved: `weight_kg`, `target_reps`, `rest_seconds`, `is_warmup`, `muscle_tag_ids`, `scheduled_session_id`, `new_records`, `muscle_group_ids`, `top_weight`, `est_1rm`).
- Endpoint functions (exact paths):
  - catalog: `listMuscleGroups(userId?)`, `createMuscleGroup(body)`, `deleteMuscleGroup(id)`, `listExercises(params?: {q?, muscle_group_id?, measurement?, userId?})`, `createExercise(body)`, `updateExercise(id, body)`, `deleteExercise(id)`
  - routines: `listRoutines()`, `createRoutine(body)`, `updateRoutine(id, body)`, `deleteRoutine(id)`, `replaceRoutineExercises(id, items: RoutineExerciseIn[])`
  - workouts: `startWorkout(body: {date?, routine_id?, scheduled_session_id?})`, `listWorkouts(params?: {from_date?, to_date?, limit?, offset?, userId?})`, `getActiveWorkout()`, `getWorkout(id, userId?)`, `finishWorkout(id)`, `updateWorkout(id, body)`, `deleteWorkout(id)`, `addWorkoutExercise(id, body: {exercise_id, note?})`, `updateWorkoutExercise(wid, weid, body)`, `removeWorkoutExercise(wid, weid)`, `reorderWorkoutExercises(wid, ids: number[])`, `setWorkoutMuscleTags(wid, ids: number[])`, `logSet(wid, weid, body: SetIn) -> SetLogOut`, `updateSet(wid, weid, sid, body)`, `deleteSet(wid, weid, sid)`
  - calendar: `schedule(body)`, `getMonth(year, month, userId?) -> CalendarMonthOut`, `updateSchedule(id, body)`, `deleteSchedule(id)`
  - progress: `getSeries(exerciseId, userId?) -> {series: SeriesPoint[]}`, `getRecords(params?: {exercise_id?, userId?})`, `getHeatmap(year, userId?)`, `getStreak(userId?) -> {weeks}`, `getDistribution(weeks?, userId?)`
  - body: `listBody(userId?)`, `upsertBody(date: string, body: BodyIn)`, `deleteBody(date: string)`
  - sharing: `getSharing() -> SharingOut`, `grantSharing(username)`, `revokeSharing(viewerId)`
  - admin: `adminListUsers()`, `adminCreateUser(body)`, `adminUpdateUser(id, body)`, `adminDeleteUser(id)`, `adminCreateInvite() -> {token}`, `adminListInvites()`, `adminDeleteInvite(id)`
- Internal helper `qs(params: Record<string, unknown>)` building the query string (skips undefined; maps `userId` → `user_id`).

- [ ] **Step 1: Write the failing test**

`frontend/src/api/__tests__/domain.spec.ts` (mock fetch like the client spec; assert exact URLs and methods for a representative sample from every router):

```typescript
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
    const urls = spy.mock.calls.map((c) => c[0] as string)
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
    const calls = spy.mock.calls.map((c) => [c[0], (c[1] as RequestInit).method])
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
    const calls = spy.mock.calls.map((c) => [c[0], (c[1] as RequestInit).method])
    expect(calls).toEqual([
      ['/api/v1/admin/invites', 'POST'],
      ['/api/v1/body/2026-08-05', 'PUT'],
    ])
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npm run test`
Expected: FAIL — module missing.

- [ ] **Step 3: Implement `frontend/src/api/domain.ts`**

Write the full module: the type interfaces (copy field names from `backend/app/schemas/*.py` — verify against the source, not memory), the `qs` helper, and one exported function per endpoint listed in Interfaces, each a thin `api<T>(...)` call. Representative excerpts (the rest follow the identical pattern):

```typescript
import { api } from './client'

export interface ExerciseMuscleLink {
  muscle_group_id: number
  is_primary: boolean
}

export interface ExerciseOut {
  id: number
  name_es: string
  name_en: string
  measurement: 'strength' | 'bodyweight' | 'timed' | 'cardio'
  owner_id: number | null
  muscle_groups: ExerciseMuscleLink[]
}

export interface SetLogOut {
  set: SetOut
  new_records: PersonalRecordOut[]
}

// ... resto de interfaces espejo del backend ...

function qs(params: Record<string, unknown>): string {
  // forma de array: URLSearchParams conserva el orden de inserción, que los
  // tests fijan; Object.fromEntries podría perder pares duplicados
  const pairs: [string, string][] = Object.entries(params)
    .filter(([, v]) => v !== undefined && v !== null)
    .map(([k, v]) => [k === 'userId' ? 'user_id' : k, String(v)])
  return pairs.length ? `?${new URLSearchParams(pairs)}` : ''
}

export const listExercises = (params: { q?: string; muscle_group_id?: number; measurement?: string; userId?: number } = {}) =>
  api<ExerciseOut[]>(`/exercises${qs(params)}`)

export const logSet = (wid: number, weid: number, body: SetIn) =>
  api<SetLogOut>(`/workouts/${wid}/exercises/${weid}/sets`, { method: 'POST', body })

export const reorderWorkoutExercises = (wid: number, workout_exercise_ids: number[]) =>
  api<WorkoutOut>(`/workouts/${wid}/exercises-order`, { method: 'PUT', body: { workout_exercise_ids } })

export const getMonth = (year: number, month: number, userId?: number) =>
  api<CalendarMonthOut>(`/calendar/${year}/${month}${qs({ userId })}`)
```

CRITICAL: `qs` must preserve insertion order for the test — `URLSearchParams` keeps it; build with the mapped pairs array (`new URLSearchParams(pairs)` accepts the array form — use that, not `Object.fromEntries`, so duplicate-safe and ordered).

- [ ] **Step 4: Run tests, build**

Run: `cd frontend && npm run test && npm run build`
Expected: green.

- [ ] **Step 5: Commit**

```bash
git add frontend/
git commit -m "feat: typed domain api layer"
```

---

### Task 3: Cross-view stores (athlete, activeWorkout, restTimer)

**Files:**
- Create: `frontend/src/stores/athlete.ts`, `frontend/src/stores/activeWorkout.ts`, `frontend/src/stores/restTimer.ts`
- Test: `frontend/src/stores/__tests__/athlete.spec.ts`, `frontend/src/stores/__tests__/activeWorkout.spec.ts`, `frontend/src/stores/__tests__/restTimer.spec.ts`

**Interfaces:**
- `useAthleteStore()`: `viewing: UserOut | null`, `userId: computed<number | undefined>` (undefined when viewing self — feeds every domain read's `userId` param), `isViewing: computed<boolean>`, `view(user: UserOut)`, `clear()`.
- `useActiveWorkoutStore()`: `workout: WorkoutOut | null`, `loading: boolean`, `lastRecords: PersonalRecordOut[]` (celebration queue, consumed by Task 12); actions `resume()` (GET active; 404 `no_active_workout` → workout=null WITHOUT toast), `start(body)`, `refresh()` (re-GET by id), `finish() -> WorkoutOut` (returns the finished workout for the summary, then clears state), `addExercise(exercise_id)`, `removeExercise(weid)`, `reorder(ids)`, `logSet(weid, body) -> SetLogOut` (refreshes workout, sets `lastRecords` when non-empty), `updateSet(weid, sid, body)`, `deleteSet(weid, sid)` — every mutation ends with `refresh()` so `workout` mirrors the server.
- `useRestTimerStore()`: `endsAt: number | null`, `total: number`, `remaining: computed<number>` (secs, ticked by an internal 500ms interval while active), `progress: computed<number>` (remaining/total, 0..1), `active: computed<boolean>`, `start(seconds)`, `clear()`; on reaching 0: `navigator.vibrate?.([200, 100, 200])` guarded, auto-`clear()` after 3s grace. Absolute timestamps (`Date.now()`), never accumulated ticks.

- [ ] **Step 1: Write the failing tests**

`frontend/src/stores/__tests__/restTimer.spec.ts`:

```typescript
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'

import { useRestTimerStore } from '../restTimer'

describe('rest timer store', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.useFakeTimers()
    vi.setSystemTime(1_000_000)
  })
  afterEach(() => vi.useRealTimers())

  it('counts down from absolute timestamps (survives missed ticks)', () => {
    const timer = useRestTimerStore()
    timer.start(90)
    expect(timer.active).toBe(true)
    expect(timer.remaining).toBe(90)
    // el móvil bloqueado no ejecuta intervals: saltamos 60s de golpe
    vi.setSystemTime(1_000_000 + 60_000)
    vi.advanceTimersByTime(500)
    expect(timer.remaining).toBe(30)
    expect(timer.progress).toBeCloseTo(30 / 90, 2)
  })

  it('vibrates once and auto-clears after the grace period', () => {
    const vibrate = vi.fn()
    vi.stubGlobal('navigator', { vibrate })
    const timer = useRestTimerStore()
    timer.start(10)
    vi.setSystemTime(1_000_000 + 10_500)
    vi.advanceTimersByTime(600)
    expect(vibrate).toHaveBeenCalledTimes(1)
    vi.advanceTimersByTime(3_100)
    expect(timer.active).toBe(false)
    vi.unstubAllGlobals()
  })

  it('restarting replaces the previous countdown', () => {
    const timer = useRestTimerStore()
    timer.start(90)
    timer.start(30)
    expect(timer.remaining).toBe(30)
    expect(timer.total).toBe(30)
  })
})
```

`frontend/src/stores/__tests__/activeWorkout.spec.ts` (mock `@/api/domain`):

```typescript
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/api/domain', () => ({
  getActiveWorkout: vi.fn(),
  startWorkout: vi.fn(),
  getWorkout: vi.fn(),
  finishWorkout: vi.fn(),
  logSet: vi.fn(),
  addWorkoutExercise: vi.fn(),
  removeWorkoutExercise: vi.fn(),
  reorderWorkoutExercises: vi.fn(),
  updateSet: vi.fn(),
  deleteSet: vi.fn(),
}))

import * as domain from '@/api/domain'
import { ApiError } from '@/api/client'
import { useActiveWorkoutStore } from '../activeWorkout'

const workout = { id: 4, date: '2026-08-05', ended_at: null, exercises: [], muscle_tag_ids: [] }

describe('active workout store', () => {
  beforeEach(() => setActivePinia(createPinia()))

  it('resume swallows no_active_workout silently', async () => {
    vi.mocked(domain.getActiveWorkout).mockRejectedValue(new ApiError(404, 'no_active_workout'))
    const store = useActiveWorkoutStore()
    await store.resume()
    expect(store.workout).toBeNull()
  })

  it('logSet refreshes and queues new records', async () => {
    vi.mocked(domain.getActiveWorkout).mockResolvedValue(workout as never)
    const store = useActiveWorkoutStore()
    await store.resume()
    vi.mocked(domain.logSet).mockResolvedValue({
      set: { id: 1, set_number: 1 },
      new_records: [{ id: 9, kind: 'max_weight', value: 100 }],
    } as never)
    vi.mocked(domain.getWorkout).mockResolvedValue(workout as never)
    await store.logSet(9, { reps: 5, weight_kg: 100, is_warmup: false })
    expect(store.lastRecords).toHaveLength(1)
    expect(domain.getWorkout).toHaveBeenCalledWith(4)
  })

  it('finish returns the workout and clears state', async () => {
    vi.mocked(domain.getActiveWorkout).mockResolvedValue(workout as never)
    const store = useActiveWorkoutStore()
    await store.resume()
    vi.mocked(domain.finishWorkout).mockResolvedValue({ ...workout, ended_at: 'x' } as never)
    const finished = await store.finish()
    expect(finished.ended_at).toBe('x')
    expect(store.workout).toBeNull()
  })
})
```

`frontend/src/stores/__tests__/athlete.spec.ts`:

```typescript
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it } from 'vitest'

import { useAthleteStore } from '../athlete'

const freyja = { id: 7, username: 'freyja', is_admin: false, locale: 'es', units: 'kg', timezone: 'UTC' }

describe('athlete store', () => {
  beforeEach(() => setActivePinia(createPinia()))

  it('exposes user_id only while viewing someone else', () => {
    const store = useAthleteStore()
    expect(store.userId).toBeUndefined()
    expect(store.isViewing).toBe(false)
    store.view(freyja)
    expect(store.userId).toBe(7)
    expect(store.isViewing).toBe(true)
    store.clear()
    expect(store.userId).toBeUndefined()
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd frontend && npm run test`
Expected: FAIL — stores missing.

- [ ] **Step 3: Implement the three stores**

`frontend/src/stores/restTimer.ts`:

```typescript
import { defineStore } from 'pinia'
import { computed, ref } from 'vue'

// timestamps absolutos: el interval solo refresca la vista; si el móvil se
// bloquea y los ticks no corren, el tiempo restante sigue siendo exacto
export const useRestTimerStore = defineStore('restTimer', () => {
  const endsAt = ref<number | null>(null)
  const total = ref(0)
  const now = ref(Date.now())
  let ticker: ReturnType<typeof setInterval> | null = null
  let vibrated = false

  const remaining = computed(() =>
    endsAt.value === null ? 0 : Math.max(0, Math.round((endsAt.value - now.value) / 1000)),
  )
  const progress = computed(() => (total.value ? remaining.value / total.value : 0))
  const active = computed(() => endsAt.value !== null)

  function tick() {
    now.value = Date.now()
    if (endsAt.value !== null && now.value >= endsAt.value) {
      if (!vibrated) {
        vibrated = true
        navigator.vibrate?.([200, 100, 200])
        setTimeout(clear, 3000)
      }
    }
  }

  function start(seconds: number) {
    total.value = seconds
    endsAt.value = Date.now() + seconds * 1000
    now.value = Date.now()
    vibrated = false
    if (ticker) clearInterval(ticker)
    ticker = setInterval(tick, 500)
  }

  function clear() {
    endsAt.value = null
    total.value = 0
    vibrated = false
    if (ticker) clearInterval(ticker)
    ticker = null
  }

  return { endsAt, total, remaining, progress, active, start, clear }
})
```

`frontend/src/stores/activeWorkout.ts`:

```typescript
import { defineStore } from 'pinia'
import { ref } from 'vue'

import { ApiError } from '@/api/client'
import * as domain from '@/api/domain'
import type { PersonalRecordOut, SetIn, SetLogOut, WorkoutOut } from '@/api/domain'

export const useActiveWorkoutStore = defineStore('activeWorkout', () => {
  const workout = ref<WorkoutOut | null>(null)
  const loading = ref(false)
  const lastRecords = ref<PersonalRecordOut[]>([])

  async function resume() {
    loading.value = true
    try {
      workout.value = await domain.getActiveWorkout()
    } catch (error) {
      // sin entreno activo no es un error: es el estado normal
      if (!(error instanceof ApiError && error.slug === 'no_active_workout')) throw error
      workout.value = null
    } finally {
      loading.value = false
    }
  }

  async function refresh() {
    if (workout.value) workout.value = await domain.getWorkout(workout.value.id)
  }

  async function start(body: Parameters<typeof domain.startWorkout>[0]) {
    workout.value = await domain.startWorkout(body)
  }

  async function finish(): Promise<WorkoutOut> {
    const finished = await domain.finishWorkout(workout.value!.id)
    workout.value = null
    lastRecords.value = []
    return finished
  }

  async function addExercise(exercise_id: number) {
    await domain.addWorkoutExercise(workout.value!.id, { exercise_id })
    await refresh()
  }

  async function removeExercise(weid: number) {
    await domain.removeWorkoutExercise(workout.value!.id, weid)
    await refresh()
  }

  async function reorder(ids: number[]) {
    workout.value = await domain.reorderWorkoutExercises(workout.value!.id, ids)
  }

  async function logSet(weid: number, body: SetIn): Promise<SetLogOut> {
    const result = await domain.logSet(workout.value!.id, weid, body)
    if (result.new_records.length) lastRecords.value = result.new_records
    await refresh()
    return result
  }

  async function updateSet(weid: number, sid: number, body: SetIn) {
    await domain.updateSet(workout.value!.id, weid, sid, body)
    await refresh()
  }

  async function deleteSet(weid: number, sid: number) {
    await domain.deleteSet(workout.value!.id, weid, sid)
    await refresh()
  }

  return { workout, loading, lastRecords, resume, refresh, start, finish, addExercise, removeExercise, reorder, logSet, updateSet, deleteSet }
})
```

`frontend/src/stores/athlete.ts`:

```typescript
import { defineStore } from 'pinia'
import { computed, ref } from 'vue'

import type { UserOut } from '@/api/auth'

export const useAthleteStore = defineStore('athlete', () => {
  const viewing = ref<UserOut | null>(null)
  const userId = computed(() => viewing.value?.id)
  const isViewing = computed(() => viewing.value !== null)
  const view = (user: UserOut) => (viewing.value = user)
  const clear = () => (viewing.value = null)
  return { viewing, userId, isViewing, view, clear }
})
```

- [ ] **Step 4: Run tests, build**

Run: `cd frontend && npm run test && npm run build`
Expected: green.

- [ ] **Step 5: Commit**

```bash
git add frontend/
git commit -m "feat: athlete, active-workout and rest-timer stores"
```

---

### Task 4: Phase-4 primitives (BkTabs, BkSelect, BkHeatmap, BkChart) + date helpers

**Files:**
- Create: `frontend/src/lib/BkTabs.vue`, `frontend/src/lib/BkSelect.vue`, `frontend/src/lib/BkHeatmap.vue`, `frontend/src/lib/BkChart.vue`, `frontend/src/utils/dates.ts`
- Modify: `frontend/package.json` (+ `"uplot": "^1.6.32"`)
- Test: `frontend/src/lib/__tests__/primitives4.spec.ts`, `frontend/src/utils/__tests__/dates.spec.ts`

**Interfaces:**
- `BkTabs` props `{modelValue: string, tabs: {value: string, label: string}[]}`, emits `update:modelValue`; `role="tablist"`/`role="tab"`/`aria-selected`; ArrowLeft/ArrowRight move selection; aurora underline on active.
- `BkSelect` props `{label: string, modelValue: string, options: {value: string, label: string}[]}`, emits `update:modelValue`; native `<select>` styled like BkField.
- `BkHeatmap` props `{data: {date: string, count: number}[], year: number}` — 53×7 CSS grid (columns = ISO weeks), cell intensity = `opacity` steps (0.15/0.4/0.7/1) on an aurora cell, `title` tooltip `date: count`, container enters with `bk-fade`. Exposes `cellsFor(year, data)` pure helper (exported from the SFC's `<script>` or a sibling `heatmap.ts` — sibling file `frontend/src/lib/heatmap.ts` preferred for testability): returns `{date, count, week, day}[]` for every day of the year.
- `BkChart` props `{points: {date: string, value: number}[], color?: 'aurora' | 'ember' | 'ink', suffix?: string}` — uPlot line chart; resolves stroke via `getComputedStyle` on the `--bk-accent-aurora`/`--bk-accent-ember`/`--bk-ink` var (no raw hex); ResizeObserver-driven width; imports `uplot/dist/uPlot.min.css` (node_modules — outside guard scope).
- `utils/dates.ts`: `isoDate(d: Date) -> 'YYYY-MM-DD'` (local, no TZ shift), `monthLabel(year, month, locale) -> 'agosto 2026'` (Intl), `weekdayHeaders(locale) -> ['L','M',...]` (Intl narrow, Monday-first), `monthGrid(year, month) -> {date: string, inMonth: boolean}[]` (Monday-first, 6 rows max, includes leading/trailing days), `todayIso()`.

- [ ] **Step 1: Write the failing tests**

`frontend/src/utils/__tests__/dates.spec.ts`:

```typescript
import { describe, expect, it } from 'vitest'

import { isoDate, monthGrid, monthLabel, weekdayHeaders } from '../dates'

describe('dates', () => {
  it('isoDate has no timezone shift', () => {
    expect(isoDate(new Date(2026, 7, 5))).toBe('2026-08-05')
    expect(isoDate(new Date(2026, 0, 1))).toBe('2026-01-01')
  })

  it('monthGrid starts monday and covers the whole month', () => {
    const grid = monthGrid(2026, 8) // agosto 2026: sábado 1
    expect(grid[0].date).toBe('2026-07-27') // lunes previo
    expect(grid.some((c) => c.date === '2026-08-01' && c.inMonth)).toBe(true)
    expect(grid.some((c) => c.date === '2026-08-31' && c.inMonth)).toBe(true)
    expect(grid.length % 7).toBe(0)
  })

  it('locale-aware labels', () => {
    expect(monthLabel(2026, 8, 'es')).toMatch(/agosto/i)
    expect(weekdayHeaders('es')).toHaveLength(7)
  })
})
```

`frontend/src/lib/__tests__/primitives4.spec.ts`:

```typescript
import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'

import BkTabs from '../BkTabs.vue'
import { cellsFor } from '../heatmap'

describe('BkTabs', () => {
  const tabs = [
    { value: 'a', label: 'A' },
    { value: 'b', label: 'B' },
  ]

  it('selects by click and arrows', async () => {
    const wrapper = mount(BkTabs, { props: { modelValue: 'a', tabs } })
    await wrapper.findAll('[role="tab"]')[1].trigger('click')
    expect(wrapper.emitted('update:modelValue')!.at(-1)).toEqual(['b'])
    await wrapper.find('[role="tablist"]').trigger('keydown', { key: 'ArrowRight' })
    expect(wrapper.emitted('update:modelValue')!.at(-1)).toEqual(['b'])
  })

  it('marks aria-selected', () => {
    const wrapper = mount(BkTabs, { props: { modelValue: 'b', tabs } })
    expect(wrapper.findAll('[role="tab"]')[1].attributes('aria-selected')).toBe('true')
  })
})

describe('heatmap cells', () => {
  it('covers the full year with week/day coordinates', () => {
    const cells = cellsFor(2026, [{ date: '2026-08-05', count: 2 }])
    expect(cells).toHaveLength(365)
    const hit = cells.find((c) => c.date === '2026-08-05')!
    expect(hit.count).toBe(2)
    expect(hit.day).toBeGreaterThanOrEqual(0)
    expect(hit.day).toBeLessThan(7)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd frontend && npm run test`
Expected: FAIL — modules missing.

- [ ] **Step 3: Implement**

`frontend/src/utils/dates.ts`:

```typescript
export function isoDate(d: Date): string {
  // construcción manual: toISOString desplazaría el día según la zona horaria
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export const todayIso = () => isoDate(new Date())

export function monthLabel(year: number, month: number, locale: string): string {
  return new Intl.DateTimeFormat(locale, { month: 'long', year: 'numeric' }).format(
    new Date(year, month - 1, 1),
  )
}

export function weekdayHeaders(locale: string): string[] {
  const monday = new Date(2026, 0, 5) // un lunes cualquiera
  return Array.from({ length: 7 }, (_, i) =>
    new Intl.DateTimeFormat(locale, { weekday: 'narrow' }).format(
      new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + i),
    ),
  )
}

export function monthGrid(year: number, month: number): { date: string; inMonth: boolean }[] {
  const first = new Date(year, month - 1, 1)
  const start = new Date(first)
  start.setDate(first.getDate() - ((first.getDay() + 6) % 7)) // retroceder al lunes
  const cells: { date: string; inMonth: boolean }[] = []
  const cursor = new Date(start)
  do {
    cells.push({ date: isoDate(cursor), inMonth: cursor.getMonth() === month - 1 })
    cursor.setDate(cursor.getDate() + 1)
  } while (cursor.getMonth() === month - 1 || cells.length % 7 !== 0)
  return cells
}
```

`frontend/src/lib/heatmap.ts`:

```typescript
export interface HeatCell {
  date: string
  count: number
  week: number
  day: number
}

import { isoDate } from '@/utils/dates'

export function cellsFor(year: number, data: { date: string; count: number }[]): HeatCell[] {
  const byDate = new Map(data.map((d) => [d.date, d.count]))
  const cells: HeatCell[] = []
  const jan1 = new Date(year, 0, 1)
  const offset = (jan1.getDay() + 6) % 7 // columnas ancladas a lunes
  for (let i = 0; ; i++) {
    const d = new Date(year, 0, 1 + i)
    if (d.getFullYear() !== year) break
    cells.push({
      date: isoDate(d),
      count: byDate.get(isoDate(d)) ?? 0,
      week: Math.floor((i + offset) / 7),
      day: (i + offset) % 7,
    })
  }
  return cells
}
```

`BkTabs.vue`, `BkSelect.vue`, `BkHeatmap.vue`, `BkChart.vue` — complete lean SFCs following the Interfaces block; representative core of each:

```vue
<!-- BkTabs.vue -->
<script setup lang="ts">
const props = defineProps<{ modelValue: string; tabs: { value: string; label: string }[] }>()
const emit = defineEmits<{ 'update:modelValue': [value: string] }>()

function move(delta: number) {
  const index = props.tabs.findIndex((t) => t.value === props.modelValue)
  const next = props.tabs[(index + delta + props.tabs.length) % props.tabs.length]
  emit('update:modelValue', next.value)
}
</script>

<template>
  <div
    role="tablist"
    class="flex gap-1 border-b border-line"
    tabindex="0"
    @keydown.arrow-right.prevent="move(1)"
    @keydown.arrow-left.prevent="move(-1)"
  >
    <button
      v-for="tab in tabs"
      :key="tab.value"
      role="tab"
      type="button"
      :aria-selected="tab.value === modelValue ? 'true' : 'false'"
      class="bk-press px-4 py-2 font-display uppercase tracking-wide text-sm border-b-2 -mb-px"
      :class="tab.value === modelValue
        ? 'text-aurora border-aurora'
        : 'text-ink-faint border-transparent hover:text-ink'"
      @click="$emit('update:modelValue', tab.value)"
    >
      {{ tab.label }}
    </button>
  </div>
</template>
```

```vue
<!-- BkChart.vue (núcleo) -->
<script setup lang="ts">
import 'uplot/dist/uPlot.min.css'

import uPlot from 'uplot'
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'

const props = withDefaults(
  defineProps<{ points: { date: string; value: number }[]; color?: 'aurora' | 'ember' | 'ink'; suffix?: string }>(),
  { color: 'aurora', suffix: '' },
)

const host = ref<HTMLElement | null>(null)
let chart: uPlot | null = null
let observer: ResizeObserver | null = null

const cssVar = (name: string) =>
  getComputedStyle(document.documentElement).getPropertyValue(name).trim()

function build() {
  if (!host.value) return
  chart?.destroy()
  const stroke = cssVar(
    props.color === 'aurora' ? '--bk-accent-aurora' : props.color === 'ember' ? '--bk-accent-ember' : '--bk-ink',
  )
  chart = new uPlot(
    {
      width: host.value.clientWidth,
      height: 220,
      axes: [
        { stroke: cssVar('--bk-ink-faint'), grid: { stroke: cssVar('--bk-line') } },
        { stroke: cssVar('--bk-ink-faint'), grid: { stroke: cssVar('--bk-line') } },
      ],
      series: [{}, { stroke, width: 2, points: { show: true, size: 5 } }],
      legend: { show: false },
    },
    [
      props.points.map((p) => new Date(p.date).getTime() / 1000),
      props.points.map((p) => p.value),
    ],
    host.value,
  )
}

onMounted(() => {
  build()
  observer = new ResizeObserver(() => chart?.setSize({ width: host.value!.clientWidth, height: 220 }))
  if (host.value) observer.observe(host.value)
})
watch(() => props.points, build, { deep: true })
watch(() => props.color, build)
onBeforeUnmount(() => {
  observer?.disconnect()
  chart?.destroy()
})
</script>

<template>
  <div ref="host" class="bk-metric text-sm" />
</template>
```

`BkSelect.vue` mirrors `BkField.vue`'s label/error layout around a native `<select class="w-full rounded-sm border border-line bg-stone px-3 py-2.5 text-ink focus:border-aurora">`. `BkHeatmap.vue` renders `cellsFor` into `grid-flow-col` CSS grid (`grid-template-rows: repeat(7, 1fr)` via a scoped style USING tokens or Tailwind `grid-rows-7`), each cell `w-2.5 h-2.5 rounded-xs bg-aurora` with `:style="{ opacity: cell.count ? levels[Math.min(cell.count, 3)] : 0.08 }"` and `:title="cell.date + ': ' + cell.count"`, wrapped in `<Transition name="bk-fade" appear>` with horizontal scroll on mobile (`overflow-x-auto`).

- [ ] **Step 4: Install, run tests, build**

```bash
cd frontend
npm install --no-audit --no-fund
npm run test
npm run build
```

Expected: green (uplot in lockfile; guard untouched by node_modules CSS).

- [ ] **Step 5: Commit**

```bash
git add frontend/
git commit -m "feat: tabs, select, heatmap and uplot chart primitives"
```

---

### Task 5: Shell chrome (desktop nav, global timer pill, athlete banner)

**Files:**
- Create: `frontend/src/components/shell/TimerPill.vue`, `frontend/src/components/shell/AthleteBanner.vue`
- Modify: `frontend/src/views/ShellView.vue`, `frontend/src/i18n/es.ts`, `frontend/src/i18n/en.ts`
- Test: `frontend/src/components/shell/__tests__/TimerPill.spec.ts`, extend `frontend/src/views/__tests__/ShellView.spec.ts`

**Interfaces:**
- `TimerPill`: renders nothing when `!restTimer.active`; otherwise a fixed pill (`bottom-16 sm:bottom-4`, centered, `z-(--bk-z-timer)`, `.bk-slab` + aurora border) with `BkRing :value="progress"` (size 28) + mono `remaining` formatted `m:ss`; click → `router.push({ name: 'workout' })`; enters with `bk-pop`.
- `AthleteBanner`: visible when `athlete.isViewing`; aurora-bordered bar under the header: eye rune + `$t('athlete.viewing', { name })` + close button calling `athlete.clear()`.
- `ShellView`: desktop top nav — the existing header gains a `hidden sm:flex` row of the same 5 RouterLinks (text + small rune, aurora active state); mobile bottom bar unchanged (`sm:hidden` stays). `TimerPill` and `AthleteBanner` mounted inside ShellView (pill therefore visible on every tab, satisfying "timer siempre visible" — the workout view itself included).
- i18n additions (both languages): `athlete.viewing` ("Viendo a {name}" / "Viewing {name}"), `athlete.stop` ("Dejar de ver" / "Stop viewing"), `timer.rest` ("Descanso" / "Rest").

- [ ] **Step 1: Write the failing tests**

`frontend/src/components/shell/__tests__/TimerPill.spec.ts`:

```typescript
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { createI18nInstance } from '@/i18n'
import { useRestTimerStore } from '@/stores/restTimer'
import TimerPill from '../TimerPill.vue'

const push = vi.fn()
vi.mock('vue-router', () => ({ useRouter: () => ({ push }) }))

describe('TimerPill', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.useFakeTimers()
    vi.setSystemTime(0)
  })

  function build() {
    return mount(TimerPill, { global: { plugins: [createI18nInstance()] } })
  }

  it('hidden while inactive, shows m:ss while resting', async () => {
    const wrapper = build()
    expect(wrapper.find('[data-testid="timer-pill"]').exists()).toBe(false)
    useRestTimerStore().start(90)
    await wrapper.vm.$nextTick()
    expect(wrapper.find('[data-testid="timer-pill"]').text()).toContain('1:30')
  })

  it('click navigates to the workout tab', async () => {
    useRestTimerStore().start(60)
    const wrapper = build()
    await wrapper.vm.$nextTick()
    await wrapper.find('[data-testid="timer-pill"]').trigger('click')
    expect(push).toHaveBeenCalledWith({ name: 'workout' })
  })
})
```

Extend `ShellView.spec.ts`: assert the header now contains a `hidden sm:flex` nav with 5 links and that `TimerPill`/`AthleteBanner` are rendered (stubbed children fine).

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd frontend && npm run test`
Expected: FAIL.

- [ ] **Step 3: Implement**

`frontend/src/components/shell/TimerPill.vue`:

```vue
<script setup lang="ts">
import { computed } from 'vue'
import { useRouter } from 'vue-router'

import BkRing from '@/lib/BkRing.vue'
import { useRestTimerStore } from '@/stores/restTimer'

const timer = useRestTimerStore()
const router = useRouter()

const label = computed(() => {
  const m = Math.floor(timer.remaining / 60)
  const s = String(timer.remaining % 60).padStart(2, '0')
  return `${m}:${s}`
})
</script>

<template>
  <Transition name="bk-pop">
    <button
      v-if="timer.active"
      data-testid="timer-pill"
      type="button"
      class="bk-press bk-slab fixed bottom-16 sm:bottom-4 left-1/2 -translate-x-1/2 z-(--bk-z-timer) flex items-center gap-2 px-4 py-2 border-aurora text-aurora"
      :aria-label="$t('timer.rest')"
      @click="router.push({ name: 'workout' })"
    >
      <BkRing :value="timer.progress" :size="28" :stroke="3" />
      <span class="bk-metric text-lg">{{ label }}</span>
    </button>
  </Transition>
</template>
```

`frontend/src/components/shell/AthleteBanner.vue`:

```vue
<script setup lang="ts">
import BkRune from '@/lib/BkRune.vue'
import { useAthleteStore } from '@/stores/athlete'

const athlete = useAthleteStore()
</script>

<template>
  <Transition name="bk-rise">
    <div
      v-if="athlete.isViewing"
      class="flex items-center justify-between gap-2 px-4 py-2 border-b border-aurora bg-stone text-sm"
    >
      <span class="flex items-center gap-2 text-aurora">
        <BkRune name="shoulders" :size="16" />
        {{ $t('athlete.viewing', { name: athlete.viewing!.username }) }}
      </span>
      <button type="button" class="bk-press text-ink-muted hover:text-ink" @click="athlete.clear()">
        {{ $t('athlete.stop') }}
      </button>
    </div>
  </Transition>
</template>
```

`ShellView.vue` header block gains, after the wordmark:

```vue
      <nav class="hidden sm:flex items-center gap-1 ml-8" :aria-label="$t('app.nav.label')">
        <RouterLink
          v-for="item in items"
          :key="item.name"
          :to="{ name: item.name }"
          class="bk-press flex items-center gap-1.5 px-3 py-1.5 rounded-sm text-sm uppercase tracking-wide text-ink-faint hover:text-ink"
          active-class="text-aurora"
        >
          <BkRune :name="item.rune" :size="14" />
          {{ $t(item.label) }}
        </RouterLink>
      </nav>
```

and `<AthleteBanner />` directly under the header + `<TimerPill />` before the closing root div. Remove nothing else.

- [ ] **Step 4: Run tests, build**

Run: `cd frontend && npm run test && npm run build`
Expected: green.

- [ ] **Step 5: Commit**

```bash
git add frontend/
git commit -m "feat: desktop nav, global rest-timer pill and athlete banner"
```

---

### Task 6: Perfil view — settings, password, sharing, logout

**Files:**
- Create: `frontend/src/components/profile/SettingsCard.vue`, `frontend/src/components/profile/PasswordCard.vue`, `frontend/src/components/profile/SharingCard.vue`
- Modify: `frontend/src/views/ProfileView.vue` (replaces PlaceholderView usage for the `profile` route — route now points at ProfileView), `frontend/src/router/index.ts`, i18n files
- Test: `frontend/src/components/profile/__tests__/SettingsCard.spec.ts`, `frontend/src/components/profile/__tests__/SharingCard.spec.ts`

**Interfaces:**
- `ProfileView`: BkTabs `perfil | rutinas (Task 8) | admin (Task 7, only when auth.user.is_admin)`; `perfil` tab stacks SettingsCard, PasswordCard, SharingCard, and a ghost logout BkButton (calls `auth.logout()` then `router.push login`).
- `SettingsCard`: BkSelect for locale (es/en), units (kg/lb), timezone (`Intl.supportedValuesOf('timeZone')`, current value first); each change → `updateSettings({...})` + on locale also `useLocale` persist path (`applyLocale` first for instant feedback); success toast `common.saved` (add key), errors → `toastApiError`.
- `PasswordCard`: current + new password BkFields, submit → `POST /auth/password` via a new `changePassword(current, next)` added to `api/auth.ts`; 403 `wrong_password` shown inline on the current field; success clears form + toast.
- `SharingCard`: two lists from `getSharing()` — "given" with revoke buttons (confirm via BkSheet), "received" with a "ver" BkButton per user calling `athlete.view(user)` + `router.push({name:'today'})`; grant form (username BkField + BkButton) → `grantSharing`, 404/409 slugs inline.
- i18n namespace `profile.*` (title, settings labels, password labels, sharing headings/actions, logout) in BOTH languages; `common.saved`.

- [ ] **Step 1: Write the failing tests**

`SettingsCard.spec.ts` (mock `@/api/auth` `updateSettings`): mount with pinia+i18n, change units select to `lb`, assert `updateSettings` called with `{units: 'lb'}` and a toast pushed. `SharingCard.spec.ts` (mock `@/api/domain`): renders given/received from `getSharing` mock; clicking "ver" on a received user sets `useAthleteStore().viewing` and navigates. Write them concretely following the TimerPill spec's mocking pattern (router mocked with `push`).

- [ ] **Step 2: Run tests to verify they fail** — `npm run test` FAILs on missing components.

- [ ] **Step 3: Implement** the three cards + ProfileView per Interfaces; add `changePassword` to `api/auth.ts`:

```typescript
export const changePassword = (current_password: string, new_password: string) =>
  api<void>('/auth/password', { method: 'POST', body: { current_password, new_password } })
```

Representative structure (SettingsCard):

```vue
<script setup lang="ts">
import { ref } from 'vue'

import { updateSettings } from '@/api/auth'
import { toastApiError } from '@/utils/apiErrors'
import { applyLocale } from '@/i18n'
import BkCard from '@/lib/BkCard.vue'
import BkSelect from '@/lib/BkSelect.vue'
import { useAuthStore } from '@/stores/auth'
import { useToastStore } from '@/stores/toast'

const { t } = useI18n()
const auth = useAuthStore()
const toast = useToastStore()

const locale = ref(auth.user!.locale)
const units = ref(auth.user!.units)
const timezone = ref(auth.user!.timezone)
const timezones = Intl.supportedValuesOf('timeZone')

async function save(partial: Parameters<typeof updateSettings>[0]) {
  try {
    auth.user = await updateSettings(partial)
    if (partial.locale) applyLocale(partial.locale)
    toast.push('info', t('common.saved'))
  } catch (error) {
    toastApiError(error)
  }
}
</script>
```

(The implementer writes the full SFCs — templates compose BkCard/BkSelect/BkField/BkButton per the Interfaces block, all copy via `$t`.)

- [ ] **Step 4: Run tests, build** — green; manually confirm no raw copy (grep for `>` literals is the reviewer's job; just use `$t` everywhere).

- [ ] **Step 5: Commit**

```bash
git add frontend/
git commit -m "feat: profile view with settings, password, sharing and logout"
```

---

### Task 7: Admin panel (users + invites)

**Files:**
- Create: `frontend/src/components/profile/AdminCard.vue`
- Modify: `frontend/src/views/ProfileView.vue` (admin tab), i18n files
- Test: `frontend/src/components/profile/__tests__/AdminCard.spec.ts`

**Interfaces:**
- `AdminCard` (rendered only when `auth.user.is_admin`): users table (username, admin rune badge, delete with BkSheet confirm; create form username+password+is_admin toggle → `adminCreateUser`; password reset via `adminUpdateUser(id, {password})` prompt-in-sheet); invites section — "generar invitación" BkButton → `adminCreateInvite()`, showing the one-time token in a `.bk-slab` mono block with a copy-to-clipboard button (`navigator.clipboard.writeText` guarded) and the i18n warning `admin.tokenOnce`; pending/used invites list from `adminListInvites` with delete.
- Self-protection mirrors the API: no delete/demote controls on your own row (the backend 409s anyway; hide the buttons).
- i18n namespace `admin.*` in BOTH languages.

- [ ] **Step 1: failing test** — `AdminCard.spec.ts`: mock domain; assert own row hides delete; assert invite creation renders the returned token and the once-warning.
- [ ] **Step 2: verify FAIL** — `npm run test`.
- [ ] **Step 3: implement** AdminCard + wire the tab (tab list computed: admin tab only for admins).
- [ ] **Step 4: tests + build green.**
- [ ] **Step 5: Commit** `feat: admin panel with user management and invites`

---

### Task 8: Rutinas editor

**Files:**
- Create: `frontend/src/components/routines/RoutineList.vue`, `frontend/src/components/routines/RoutineEditorSheet.vue`
- Modify: `frontend/src/views/ProfileView.vue` (rutinas tab), i18n files
- Test: `frontend/src/components/routines/__tests__/routineEditor.spec.ts`

**Interfaces:**
- `RoutineList`: cards per routine (rune + name + exercise count + edit/delete); "nueva rutina" BkButton opens the editor sheet empty.
- `RoutineEditorSheet` (BkSheet): name/description BkFields, rune picker (the 7 muscle-group runes + berserk as selectable `rune` value, aurora highlight on selected), exercise rows (exercise name resolved via catalog by locale — helper `exerciseName(e, locale)` = `locale === 'es' ? e.name_es : e.name_en`, exported from `components/routines/exerciseName.ts` for reuse), per-row BkStepper for target_sets, optional target_reps stepper, rest_seconds BkSelect (30/60/90/120/180 s), remove + up/down reorder buttons (arrays reordered locally, positions from list order); add-exercise picker (BkField search filtering `listExercises({q})` results, grouped by primary muscle rune); save = `createRoutine`/`updateRoutine` then `replaceRoutineExercises` with the ordered list; errors → toastApiError.
- i18n namespace `routines.*` both languages.

- [ ] **Step 1: failing test** — `routineEditor.spec.ts`: `exerciseName` locale resolution; editor emits a save payload whose items carry list order (mount editor with two exercises, move one up, save, assert `replaceRoutineExercises` called with swapped ids). Mock domain.
- [ ] **Step 2: verify FAIL.**
- [ ] **Step 3: implement** both components + tab wiring.
- [ ] **Step 4: tests + build green.**
- [ ] **Step 5: Commit** `feat: routine editor with exercise picker and reorder`

---

### Task 9: Hoy view

**Files:**
- Create: `frontend/src/components/today/StreakCard.vue`, `frontend/src/components/today/TodaySessionCard.vue`, `frontend/src/components/today/WeekSummaryCard.vue`, `frontend/src/components/today/RecentPrs.vue`
- Modify: `frontend/src/views/TodayView.vue` (replaces placeholder; route update), i18n files
- Test: `frontend/src/components/today/__tests__/today.spec.ts`

**Interfaces:**
- `TodayView` fetches on mount (all with `athlete.userId` threading): `getStreak`, `getMonth(currentYear, currentMonth)` (today's sessions filtered client-side), `getDistribution(1)`, `listWorkouts({from_date: monday, to_date: today})`, `getRecords()` (slice 5). Layout: StreakCard, TodaySessionCard, WeekSummaryCard, RecentPrs in a `.bk-stagger` column.
- `StreakCard`: streak weeks big mono number + `streak` rune, **ember tone when weeks >= 1** (achievement semantics), ink-faint at 0; label `today.streakWeeks` (pluralized with vue-i18n `{n}`).
- `TodaySessionCard`: today's `scheduled` entries (status dots: planned=aurora ring, done=aurora solid, skipped=ink-faint); when viewing self and a planned session exists → "empezar" primary BkButton `router.push workout` with `?session=<id>` query; when no session → ghost button to calendar; hidden CTA in athlete mode.
- `WeekSummaryCard`: días entrenados (count of week workouts), series efectivas (sum from distribution), grupos tocados (distribution keys as muscle runes row).
- `RecentPrs`: last 5 records — kind label (`progress.kinds.max_weight|est_1rm|max_volume`), exercise name via catalog lookup, `formatWeight` for weight kinds / plain for volume, achieved_at date; ember accents.
- i18n namespace `today.*` + `progress.kinds.*` both languages.

- [ ] **Step 1: Write the failing test** (fully — this pins the fetch threading pattern every view reuses)

`frontend/src/components/today/__tests__/today.spec.ts`:

```typescript
import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/api/domain', () => ({
  getStreak: vi.fn(async () => ({ weeks: 3 })),
  getMonth: vi.fn(async () => ({ scheduled: [], workouts: [] })),
  getDistribution: vi.fn(async () => []),
  listWorkouts: vi.fn(async () => []),
  getRecords: vi.fn(async () => []),
  listExercises: vi.fn(async () => []),
  listMuscleGroups: vi.fn(async () => []),
}))
vi.mock('vue-router', () => ({ useRouter: () => ({ push: vi.fn() }) }))

import * as domain from '@/api/domain'
import { createI18nInstance } from '@/i18n'
import { useAthleteStore } from '@/stores/athlete'
import TodayView from '@/views/TodayView.vue'

describe('TodayView', () => {
  beforeEach(() => setActivePinia(createPinia()))

  it('threads athlete user_id through every read', async () => {
    useAthleteStore().view({ id: 7, username: 'freyja', is_admin: false, locale: 'es', units: 'kg', timezone: 'UTC' })
    mount(TodayView, { global: { plugins: [createI18nInstance()] } })
    await flushPromises()
    expect(vi.mocked(domain.getStreak)).toHaveBeenCalledWith(7)
    expect(vi.mocked(domain.getRecords)).toHaveBeenCalledWith({ userId: 7 })
  })

  it('renders the streak in ember when alive', async () => {
    const wrapper = mount(TodayView, { global: { plugins: [createI18nInstance()] } })
    await flushPromises()
    expect(wrapper.find('[data-testid="streak-card"]').classes().join(' ')).toContain('text-ember')
    expect(wrapper.text()).toContain('3')
  })
})
```

- [ ] **Step 2: verify FAIL.** `npm run test`
- [ ] **Step 3: implement** the four cards + TodayView per Interfaces (route: replace PlaceholderView with TodayView for `today`). All fetches in a single `load()` (Promise.all) wrapped in try/`toastApiError`.
- [ ] **Step 4: tests + build green.**
- [ ] **Step 5: Commit** `feat: today view with streak, session, summary and prs`

---

### Task 10: Calendario view

**Files:**
- Create: `frontend/src/components/calendar/MonthGrid.vue`, `frontend/src/components/calendar/ScheduleSheet.vue`
- Modify: `frontend/src/views/CalendarView.vue`, router (real view), i18n files
- Test: `frontend/src/components/calendar/__tests__/calendar.spec.ts`

**Interfaces:**
- `CalendarView`: month state (`{year, month}`, defaults today; prev/next buttons + `monthLabel`), loads `getMonth(year, month, athlete.userId)`; below the grid, BkHeatmap fed by `getHeatmap(year, athlete.userId)`; day tap → ScheduleSheet for that date (self only; read-only day summary in athlete mode).
- `MonthGrid`: `monthGrid()` cells 7-col grid, `weekdayHeaders`; per-day markers — scheduled dots (planned aurora ring / done aurora solid / skipped ink-faint, from `scheduled`) and up to 3 muscle-group runes (12px) from `workouts[].muscle_group_ids` resolved via a `groupRune(muscleGroupId)` helper (`components/calendar/groupRune.ts`: map slug→RuneName over the 7 seed slugs fetched from `listMuscleGroups`, fallback `core`); today outlined aurora; emits `select(date)`.
- `ScheduleSheet`: for the tapped date — list that day's sessions with actions (skip → `updateSchedule(id, {status:'skipped'})`, replan date/time, delete) and a create form (time optional, routine BkSelect from `listRoutines`, note) → `schedule(...)`; done sessions show their workout link (navigates to a read-only… out of scope: just show `calendar.done`). All mutations refresh the month; errors → toastApiError.
- i18n namespace `calendar.*` both languages.

- [ ] **Step 1: failing test** — concrete: `groupRune` mapping test (7 slugs → 7 runes, unknown → 'core'); MonthGrid renders dots per status (mount with fixture `CalendarMonthOut`, assert `[data-status="planned"]` etc. counts); ScheduleSheet skip action calls `updateSchedule` with `{status:'skipped'}` (mock domain).
- [ ] **Step 2: verify FAIL.**
- [ ] **Step 3: implement** per Interfaces.
- [ ] **Step 4: tests + build green.**
- [ ] **Step 5: Commit** `feat: calendar view with month grid, scheduling and heatmap`

---

### Task 11: Entreno view (live logging)

**Files:**
- Create: `frontend/src/components/workout/WorkoutExerciseCard.vue`, `frontend/src/components/workout/SetForm.vue`, `frontend/src/components/workout/AddExerciseSheet.vue`, `frontend/src/components/workout/FinishSummary.vue`
- Modify: `frontend/src/views/WorkoutView.vue`, router, i18n files
- Test: `frontend/src/components/workout/__tests__/setForm.spec.ts`, `frontend/src/components/workout/__tests__/workoutFlow.spec.ts`

**Interfaces:**
- `WorkoutView` states: (a) no active workout → start panel: "entreno libre" BkButton (`start({})`), routine list buttons (`start({routine_id})`), and if `?session=` query present start from it (`start({scheduled_session_id})`); resumes via `activeWorkout.resume()` on mount (surviving reloads). (b) active → header (date, elapsed `bk-metric` from `started_at` ticked each second, finish button), exercise cards, "añadir ejercicio" opens AddExerciseSheet. (c) after finish → FinishSummary.
- `WorkoutExerciseCard`: exercise name (locale helper from Task 8), primary-group rune, sets list (`set_number`, values per measurement via `formatWeight`/reps/duration, warmup marked ink-faint, delete per set), inline `SetForm` for the next set, remove-exercise + up/down reorder (calls `activeWorkout.reorder` with the full id list).
- `SetForm` props `{measurement}`: strength → BkStepper weight (step 2.5, suffix from units) + BkStepper reps; bodyweight → reps + optional weight; timed → duration stepper (step 15, suffix s); cardio → duration (step 60) + optional distance (step 100, suffix m); warmup toggle; RPE BkSelect (—/6..10); emits `submit(SetIn)`. Emits value defaults persist between sets (last values kept per card).
- On `logSet` resolution: `restTimer.start(restSeconds)` where restSeconds = the routine's `rest_seconds` for that exercise if the workout came from a routine (lookup via `listRoutines` match on `workout.routine_id`) else 90 default — helper `restFor(workout, routines, exerciseId)` in `components/workout/rest.ts`, tested.
- `FinishSummary` (full-screen `.bk-slab` panel): duration, sets/volume totals computed from the finished `WorkoutOut`, records earned during the session (accumulated by view from each `SetLogOut.new_records`), feeling selector (1-5 runes → `updateWorkout(id, {feeling})`), note field, "cerrar" → back to today.
- i18n namespace `workout.*` both languages.

- [ ] **Step 1: Write the failing tests** (SetForm fully; flow test concrete)

`setForm.spec.ts`:

```typescript
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it } from 'vitest'

import { createI18nInstance } from '@/i18n'
import SetForm from '../SetForm.vue'

function build(measurement: string) {
  setActivePinia(createPinia())
  return mount(SetForm, {
    props: { measurement },
    global: { plugins: [createI18nInstance()] },
  })
}

describe('SetForm', () => {
  beforeEach(() => setActivePinia(createPinia()))

  it('strength emits reps + weight_kg', async () => {
    const wrapper = build('strength')
    await wrapper.find('form').trigger('submit')
    const payload = wrapper.emitted('submit')![0][0] as Record<string, unknown>
    expect(payload).toMatchObject({ is_warmup: false })
    expect(payload.reps).toBeGreaterThan(0)
    expect(payload.weight_kg).toBeGreaterThan(0)
    expect(payload.duration_seconds).toBeUndefined()
  })

  it('timed emits only duration', async () => {
    const wrapper = build('timed')
    await wrapper.find('form').trigger('submit')
    const payload = wrapper.emitted('submit')![0][0] as Record<string, unknown>
    expect(payload.duration_seconds).toBeGreaterThan(0)
    expect(payload.reps).toBeUndefined()
    expect(payload.weight_kg).toBeUndefined()
  })
})
```

`workoutFlow.spec.ts` (mock domain + stores real): `restFor` picks routine rest_seconds else 90; logging a set through WorkoutExerciseCard calls `activeWorkout.logSet` and then `restTimer.start(90)` (mock domain logSet to return empty records).

- [ ] **Step 2: verify FAIL.**
- [ ] **Step 3: implement** per Interfaces — keep WorkoutView the orchestrator (<300 lines) with the four subcomponents carrying the weight.
- [ ] **Step 4: tests + build green.**
- [ ] **Step 5: Commit** `feat: live workout logging with rest timer wiring`

---

### Task 12: PR celebration overlay

**Files:**
- Create: `frontend/src/components/celebration/BkCelebration.vue`
- Modify: `frontend/src/views/WorkoutView.vue` (mount + feed from `activeWorkout.lastRecords`), `frontend/src/styles/animations.css` (ONE new keyframe `bk-ember-flash`, opacity-only, inside the existing file; reduced-motion guard already covers it), i18n files
- Test: `frontend/src/components/celebration/__tests__/celebration.spec.ts`

**Interfaces:**
- `BkCelebration` props `{records: PersonalRecordOut[], runeName: RuneName}`; teleported full-screen overlay `z-(--bk-z-timer)`: ember radial glow backdrop (`bk-ember-flash` keyframe: opacity 0→1→0.6, uses `var(--bk-ember-glow)` — NO new colors), the muscle-group rune carving in ember (`BkRune :size="96" carve tone="ember"`), `$t('workout.newRecord')` display heading, per-record line (kind label + value counted up over `--bk-dur-4` via rAF — skipped instantly under `matchMedia('(prefers-reduced-motion: reduce)')`), tap anywhere or 3s auto → emits `done`.
- WorkoutView watches `activeWorkout.lastRecords`: non-empty → show celebration with the logged exercise's primary-group rune (`groupRune` from Task 10, exported reuse), on `done` clear `lastRecords`.
- Celebration fires ONLY from live logging (`lastRecords` is only set in `logSet` — updateSet never touches it; assert that in the test).
- i18n: `workout.newRecord` + reuse `progress.kinds.*`.

- [ ] **Step 1: failing test** — mount BkCelebration with 2 records under mocked `matchMedia` reduced-motion → values render immediately (no count-up), emits `done` on click; store-level: `updateSet` leaves `lastRecords` untouched (extend activeWorkout spec).
- [ ] **Step 2: verify FAIL.**
- [ ] **Step 3: implement** (keyframe added to animations.css keeps the single-guard test green — it counts guards, not keyframes; the styles spec's banned-property check must still pass: opacity only).
- [ ] **Step 4: tests + build green.**
- [ ] **Step 5: Commit** `feat: ember pr celebration with carved rune`

---

### Task 13: Progresión view (+ body)

**Files:**
- Create: `frontend/src/components/progress/ExercisePicker.vue`, `frontend/src/components/progress/PrList.vue`, `frontend/src/components/progress/DistributionBars.vue`, `frontend/src/components/progress/BodySection.vue`
- Modify: `frontend/src/views/ProgressView.vue`, router, i18n files
- Test: `frontend/src/components/progress/__tests__/progress.spec.ts`

**Interfaces:**
- `ProgressView`: BkTabs `entrenos | cuerpo`. Entrenos tab: ExercisePicker (search over `listExercises` with athlete threading, only exercises with data prioritized — simply full catalog searchable), then BkTabs-like metric switch (peso | volumen | 1RM) feeding ONE BkChart with the chosen series key (`top_weight` / `volume` / `est_1rm`, weight kinds through `kgToDisplay`), PrList (records for the picked exercise or all), DistributionBars (`getDistribution(weeks=4)` — horizontal bars: muscle rune + name + bar `bg-aurora` width %, sets count mono). Cuerpo tab: BodySection.
- `DistributionBars`: pure props `{items: {muscle_group_id, sets}[], groups: MuscleGroupOut[]}` — bar widths relative to max; exported pure helper `barWidth(sets, max) -> string` ("62%").
- `BodySection`: entries list (date + weight + measures present), weight-over-time BkChart (aurora), upsert BkSheet (date defaults today, 6 numeric BkFields `mono`, at least one required client-side mirroring `empty_entry`), delete per entry; self only (hidden athlete mode? NO — readable: list+chart render with athlete.userId, mutations hidden when viewing).
- Weight display: `formatWeight`/`kgToDisplay` with `auth.user.units` — charts show converted values.
- i18n namespace `progress.*` (+ `body.*` labels) both languages.

- [ ] **Step 1: failing test** — concrete: `barWidth` math; ProgressView metric switch changes BkChart props (mount with mocked domain returning a 2-point series, flip metric, assert chart stub receives `est_1rm` values); BodySection hides mutation buttons in athlete mode (athlete store set → no "añadir" button).
- [ ] **Step 2: verify FAIL.**
- [ ] **Step 3: implement** per Interfaces (ProgressView orchestrates; chart data mapping in a small pure `seriesFor(points, metric, units)` helper in `components/progress/series.ts`, tested).
- [ ] **Step 4: tests + build green.**
- [ ] **Step 5: Commit** `feat: progress view with charts, prs, distribution and body`

---

### Task 14: Athlete threading sweep, i18n completeness and phase wiring

**Files:**
- Modify: any view/component found missing `athlete.userId` threading on reads; `frontend/src/i18n/{es,en}.ts` (sweep); router (final placeholder removal check)
- Test: `frontend/src/__tests__/athleteThreading.spec.ts`, existing suites

**Interfaces:**
- Contract pinned by this task: EVERY domain READ used by Hoy/Calendario/Progresión passes `athlete.userId` (undefined for self); WRITES never do (typecheck already enforces — the write functions take no userId param; the test asserts the read side).
- Athlete-mode UX rules verified: CTAs and mutation affordances hidden while viewing (start buttons, schedule create/edit, body upsert, set logging is unreachable — workout tab shows own workout always; banner visible on every tab).
- i18n: run the parity test; grep views/components for literal copy (`grep -rn ">[A-Za-zÁ-ú]" src/views src/components --include='*.vue'` — every hit must be `$t`, a bound value, or a mono numeral); fix any stragglers in BOTH languages.
- `PlaceholderView.vue` deleted; router imports all five real views.

- [ ] **Step 1: Write the threading test**

`frontend/src/__tests__/athleteThreading.spec.ts` — mount TodayView, CalendarView, ProgressView with athlete viewing id 7 (domain fully mocked as in Task 9's spec) and assert every mocked read that supports userId was called with 7 (`getStreak`, `getRecords`, `getMonth`, `getHeatmap`, `getSeries` when an exercise picked, `getDistribution`, `listBody`, `listWorkouts`). Concrete assertions per call, one `describe` per view.

- [ ] **Step 2: Run — any FAIL is a real threading bug: fix the component, not the test.**
- [ ] **Step 3: Sweep i18n + delete placeholder + router final form.**
- [ ] **Step 4: Full gates**

```bash
cd frontend
npm run build:tokens && git diff --exit-code src/styles/tokens.css
npm run guard:tokens
npm run test
npm run build
cd ../backend && uv run pytest -q
```

Expected: everything green (backend untouched: quick confirmation only).

- [ ] **Step 5: Commit**

```bash
git add frontend/
git commit -m "feat: athlete read threading, i18n sweep and phase wiring"
```

---

## Testing depth note

Tasks 1-5, 9 and 11 (plus every pure helper) carry fully verbatim test code. The remaining view tasks (6-8, 10, 12, 13) specify each test's exact target, fixture shape and assertions in prose — the implementer writes the bodies following the established mocking patterns (Task 9's spec is the canonical template: domain fully mocked, pinia fresh, i18n instance as plugin, router mocked with `push`). A test that doesn't cover its stated assertions, or a weakened assertion, is a spec violation for the task reviewer to flag.

## Phase 4 exit criteria

- All frontend gates green: token drift zero, guard clean, vitest suites (≈70+ tests expected), `npm run build`; backend suite untouched and green; CI passes.
- Manual flow (the user's full validation script, dev.sh running):
  1. Perfil → ajustes (cambia idioma y unidades, observa el efecto inmediato), crea una rutina con 2-3 ejercicios y descansos.
  2. Calendario → planifica una sesión hoy con esa rutina; heatmap visible.
  3. Hoy → racha + sesión de hoy → "empezar".
  4. Entreno → registra series (stepper), observa el timer pill en TODAS las pestañas, edita/borra una serie, añade un ejercicio suelto, PR → celebración ember con runa tallada, finalizar → resumen con sensación.
  5. Progresión → gráfica del ejercicio (peso/volumen/1RM), PRs, distribución, cuerpo (alta de peso).
  6. Perfil → comparte con otro usuario; con ese usuario: banner "viendo a", lectura de hoy/calendario/progresión, sin botones de escritura; revocar cierra el acceso.
  7. Admin → crea invitación (token una sola vez), alta de usuario.
- Desktop (≥sm): top nav funcional; móvil: bottom bar + CTA central intactos.





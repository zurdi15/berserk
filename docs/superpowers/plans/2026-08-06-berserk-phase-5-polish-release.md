# berserk Phase 5 — Polish & Release Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close every carry from the four phase reviews, wire the orphaned features (invite redemption, custom exercise/muscle-group library, discard workout, muscle tags), harden container/CI, and ship README + screenshots + release workflow so `v0.1.0` is one `git tag` away.

**Architecture:** No new subsystems. Frontend work extends existing views/components under the token discipline; backend work is confined to `dev_seed.py` + one optional-param widening in `services/workout_sets.py`; infra work touches `Dockerfile`, `ci.yml`, and a new `release.yml`.

**Tech Stack:** Existing stack (FastAPI + SQLAlchemy + uv / Vue 3.5 + TS + Vite 7 + Tailwind 4 + vitest). One-off tooling allowed for screenshots (`npx playwright`), never added as a project dependency.

## Global Constraints

- Tokens only: no raw hex, no raw `cubic-bezier`, no arbitrary px values, no invented utility names. `npm run guard:tokens` must stay clean. Theme color utilities are exactly: `void`, `stone`, `slab`, `line`, `line-strong`, `ink`, `ink-muted`, `ink-faint`, `aurora`, `aurora-deep`, `ember`, `ember-deep`, `danger` (see `frontend/src/styles/base.css` `@theme inline`).
- ember is for achievements only (sole sanctioned exception: bootstrap screen).
- Animations: entry-only, via `frontend/src/styles/animations.css` primitives and tokens; transform/opacity only.
- i18n: every user-visible string via vue-i18n, added to BOTH `es.ts` and `en.ts`. Backend error slugs live under `errors.*`. Interface voice: plain, actionable, sentence case, no apologies.
- kg canonical in stores/API; lb display-only via `@/utils/units`.
- Comments in Spanish, "why"-only. Identifiers in English.
- **HARD TEST RULES (violations = task rejected):** (1) NO conditional wrappers around assertions — never `if (el.exists())` / `if (x.length > 0)`; (2) assert visible text / rendered DOM; (3) terminal actions via real DOM `find` + `trigger`, then `toHaveBeenCalledWith(...)` — no `vm.method()` calls to drive behavior; (4) `expect(x).toBeDefined()` on querySelector results banned — use `not.toBeNull()`; (5) no `.skip/.only/.todo`; (6) reports cite each test by name AND line number.
- Gates before every commit: `cd backend && uv run pytest -q` and `cd frontend && npm run test && npm run build` (build includes vue-tsc + guard chain).
- Never touch the live dev DB at `./data` or the running dev servers.
- Every commit message ends with exactly:

```
Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01HkD1mXnsiQdj6TT1qY1v7x
```

---

### Task 1: Invite redemption page

**Files:**
- Create: `frontend/src/views/RedeemView.vue`
- Modify: `frontend/src/api/auth.ts`, `frontend/src/stores/auth.ts`, `frontend/src/router/index.ts`, `frontend/src/components/profile/AdminCard.vue` (copy full URL, not bare token), `frontend/src/i18n/es.ts`, `frontend/src/i18n/en.ts`
- Test: `frontend/src/views/__tests__/RedeemView.spec.ts`, extend `frontend/src/components/profile/__tests__/AdminCard.spec.ts`

**Interfaces:**
- Consumes: backend `POST /auth/invites/redeem` — body `{token, username, password}`, 201 → `UserOut` + session cookie; errors `invite_invalid` (410), `username_taken` (409). Both slugs already exist in `errors.*`.
- Produces: `redeemInvite(token, username, password): Promise<UserOut>` in `api/auth.ts`; `auth.redeemAccount(token, username, password)` store action; public route `{ path: '/invite/:token', name: 'invite' }`.

- [ ] **Step 1: Write the failing tests.** `RedeemView.spec.ts`: mount with a router stub providing `params: { token: 'tok123' }` (use the repo's established pattern from `LoginView`/`BootstrapView` specs — check how they inject router/i18n). Tests: (a) happy path — fill username + password via `find('input')` + `setValue`, submit the form via `find('form').trigger('submit.prevent')`, assert `redeemInvite` mock `toHaveBeenCalledWith('tok123', 'runa', 'secret123')` and router push to `{ name: 'today' }`; (b) error path — mock rejects with `ApiError` slug `invite_invalid`, assert the rendered error text (the ES message from `errors.invite_invalid`) appears in the DOM. AdminCard spec: after invite creation, assert the copy button writes `${window.location.origin}/invite/tok123` to the clipboard mock (`toHaveBeenCalledWith`).
- [ ] **Step 2: Run to verify FAIL** — `npx vitest run src/views/__tests__/RedeemView.spec.ts src/components/profile/__tests__/AdminCard.spec.ts`.
- [ ] **Step 3: Implement.**

`api/auth.ts` addition:

```ts
export const redeemInvite = (token: string, username: string, password: string) =>
  api<UserOut>('/auth/invites/redeem', { method: 'POST', body: { token, username, password } })
```

`stores/auth.ts` — mirror `bootstrapAccount` exactly (cookie already set by the response):

```ts
async function redeemAccount(token: string, username: string, password: string) {
  user.value = await authApi.redeemInvite(token, username, password)
  applyLocale(user.value.locale)
}
```

(add `redeemAccount` to the returned object). `RedeemView.vue`: copy `BootstrapView.vue`'s structure verbatim (berserk rune + `bk-slab` form + BkField/BkButton + same error-slug pattern) but: `variant="primary"` button and `tone="aurora"` rune — redemption is a normal signup, NOT the bootstrap achievement moment (ember stays bootstrap-only); reads `useRoute().params.token as string`; new i18n keys `auth.redeemTitle` (es: `Únete al clan`, en: `Join the clan`), `auth.redeemHint` (es: `Te han invitado a esta instancia. Crea tu cuenta.`, en: `You've been invited to this instance. Create your account.`). Router: add `{ path: '/invite/:token', name: 'invite', component: RedeemView }` as a top-level route and extend the guard's `isPublic` to include `'invite'` — the existing `authenticated && isPublic → today` rule then handles logged-in visitors, and the `!bootstrapped → bootstrap` rule stays ABOVE it (an unbootstrapped instance has no invites). AdminCard: where the one-time token renders, keep the mono token block but make the copy button write the full redeem URL:

```ts
const redeemUrl = (token: string) => `${window.location.origin}/invite/${token}`
```

- [ ] **Step 4: Run tests + build green** — full `npm run test && npm run build`.
- [ ] **Step 5: Commit** `feat: public invite redemption page`

---

### Task 2: Library tab — custom exercises & muscle groups

**Files:**
- Create: `frontend/src/components/library/ExerciseManager.vue`, `frontend/src/components/library/MuscleGroupManager.vue`
- Modify: `frontend/src/views/ProfileView.vue` (new tab), `frontend/src/i18n/es.ts`, `frontend/src/i18n/en.ts`
- Test: `frontend/src/components/library/__tests__/library.spec.ts`, extend `frontend/src/views/__tests__/ProfileView.spec.ts`

**Interfaces:**
- Consumes: `listExercises`, `createExercise`, `updateExercise`, `deleteExercise`, `listMuscleGroups`, `createMuscleGroup`, `deleteMuscleGroup` from `@/api/domain` (5 of these currently have zero callers). Backend semantics verified: any user creates OWN exercises (`owner_id = user.id`); `is_global` muscle groups are admin-only; deletes 409 with `exercise_in_use` / `muscle_group_in_use`; duplicate group slug 409s `slug_taken`.
- Produces: Perfil tab `library` visible to ALL users, between `routines` and `admin`. **Placement rationale:** Perfil already hosts tab-scoped management surfaces (rutinas, admin); the library is low-frequency configuration, not a daily flow, so it does not earn a nav slot.

- [ ] **Step 1: Write the failing tests.** `library.spec.ts` with mocked `@/api/domain`: (a) ExerciseManager lists only OWN exercises (mock returns one `owner_id: null` catalog row and one `owner_id: 7` custom row; assert the custom name renders and the catalog one does not); (b) create flow — fill `name_es`/`name_en` fields, pick measurement in the BkSelect, toggle a muscle-group checkbox, mark it primary, submit via DOM, assert `createExercise` `toHaveBeenCalledWith({ name_es: 'Press Arnold', name_en: 'Arnold press', measurement: 'strength', muscle_groups: [{ muscle_group_id: 1, is_primary: true }] })`; (c) delete click-through opens the confirm sheet and confirming calls `deleteExercise(12)`; (d) MuscleGroupManager: global groups render without a delete control, own groups with one; create submits `createMuscleGroup({ slug: 'antebrazo', name_es: 'Antebrazo', name_en: 'Forearm', is_global: false })`; (e) the `is_global` toggle only renders for an admin user (assert absent for non-admin, present for admin — two mounts, both asserted unconditionally). ProfileView.spec: new tab click-through renders a real ExerciseManager control (per-tab integration assertion pattern established in the C1 fix).
- [ ] **Step 2: Verify FAIL.**
- [ ] **Step 3: Implement.** ExerciseManager: own-exercises list (`exercises.filter(e => e.owner_id !== null)`), inline create/edit form in a BkSheet (`BkField` names, `BkSelect` measurement over the four `Measurement` values labeled via new `library.measurements.*` keys, muscle-group checkboxes from `listMuscleGroups` with one "primary" radio scoped to the checked set), delete via confirm BkSheet; every write path wrapped in `try/catch` + `toastApiError` (the `exercise_in_use`, `slug_taken`, `muscle_group_in_use` toasts already have slugs). MuscleGroupManager below it: list with global groups marked (`library.globalGroup`), create form slug + both names + admin-only `is_global` toggle, delete on own groups only. i18n namespace `library.*` (title, exercises, muscleGroups, newExercise, newGroup, measurements.strength/bodyweight/timed/cardio, primary, globalGroup, confirmDeleteExercise, confirmDeleteGroup) plus `profile.libraryTab` (es `Biblioteca`, en `Library`) in BOTH languages. ProfileView: insert `{ value: 'library', label: t('profile.libraryTab') }` into `baseTabs` after `routines`; sibling panel `v-if="activeTab === 'library'"` (BkTabs stays self-closing — the C1 pattern).
- [ ] **Step 4: Tests + build green.**
- [ ] **Step 5: Commit** `feat: exercise and muscle group library tab`

---

### Task 3: Workout wiring — discard workout + muscle tags; drop dead binding

**Files:**
- Modify: `frontend/src/views/WorkoutView.vue`, `frontend/src/stores/activeWorkout.ts`, `frontend/src/api/domain.ts` (remove `updateWorkoutExercise`), `frontend/src/api/__tests__/domain.spec.ts`, `frontend/src/i18n/es.ts`, `frontend/src/i18n/en.ts`
- Test: extend `frontend/src/views/__tests__/WorkoutView.spec.ts`, `frontend/src/stores/__tests__/activeWorkout.spec.ts`

**Interfaces:**
- Consumes: `deleteWorkout(id)`, `setWorkoutMuscleTags(wid, ids)` from `@/api/domain` (currently zero callers); `WorkoutOut.muscle_tag_ids`; restTimer store's existing stop/clear action (read `frontend/src/stores/restTimer.ts` first and use whatever it exposes — do not invent a name).
- Produces: `activeWorkout.discard(): Promise<void>` (calls `deleteWorkout`, resets store state, stops the rest timer); `activeWorkout.setMuscleTags(ids: number[]): Promise<void>` (calls `setWorkoutMuscleTags`, refreshes the workout). `updateWorkoutExercise` is REMOVED from `domain.ts` — no UI surfaces per-exercise notes anywhere, so the binding is dead code; the backend endpoint stays.

- [ ] **Step 1: Write the failing tests.** WorkoutView.spec: (a) discard — find the discard button by testid, click, confirm sheet appears (assert its visible title text), click the confirm button, assert `deleteWorkout` mock `toHaveBeenCalledWith(1)` and navigation to `today`; (b) muscle tags — with mocked `listMuscleGroups` returning chest/back, click the chest tag chip, assert `setWorkoutMuscleTags` `toHaveBeenCalledWith(1, [1])`, and the chip renders selected state (assert class or `aria-pressed="true"`). activeWorkout.spec: `discard()` resets `workout` to null and `lastRecords` to `[]` even when the API resolves; API failure propagates without clearing state.
- [ ] **Step 2: Verify FAIL.**
- [ ] **Step 3: Implement.** Store actions (`try` at call sites, not in the store — same convention as the existing actions). WorkoutView: ghost danger-styled `border-danger text-danger` button next to the finish action, guarded by a BkSheet confirm (`workout.discardTitle` es `¿Descartar el entreno?`, body `workout.discardHint` es `Se borra el entreno y sus series. Los récords se recalculan.` — mirror in EN), then `router.push({ name: 'today' })`; muscle-tag chip row (same visual pattern as SetForm's warmup toggle: `aria-pressed`, `border-aurora text-aurora bg-aurora/10` when active) bound to `activeWorkout.workout.muscle_tag_ids`, toggling calls `setMuscleTags` with the new full array; wrap both flows in `try/catch` + `toastApiError`. Remove `updateWorkoutExercise` + its `domain.spec.ts` case.
- [ ] **Step 4: Tests + build green.**
- [ ] **Step 5: Commit** `feat: discard workout and muscle tag editing; drop dead api binding`

---

### Task 4: Guard extensions and test debt

**Files:**
- Create: `frontend/scripts/guard-utilities.mjs`
- Modify: `frontend/scripts/guard-tokens.sh` (px→rem/em widening), `frontend/package.json` (wire new guard), `.github/workflows/ci.yml` (guard-utilities runs AFTER build), `frontend/src/i18n/__tests__/messages.spec.ts` (derive slugs from backend source), `frontend/src/components/routines/__tests__/routineEditor.spec.ts` (vm-call → DOM)
- Test: the guards ARE the tests; messages.spec + routineEditor.spec changes verified by running them.

**Interfaces:**
- Produces: `npm run guard:utilities` — fails the build when a color-utility class used in `src/` generates no CSS (the invented-class defect shipped 3× this project; Tailwind 4 silently drops unknown utilities).

- [ ] **Step 1: guard-utilities.** New `guard-utilities.mjs`: glob `src/**/*.{vue,ts}` (skip `__tests__`), regex-extract candidate color utilities `/(?:^|[\s'"`:{])((?:hover:|focus:|active:|disabled:)*(?:bg|text|border|ring|fill|stroke|divide|outline|decoration)-[a-z][a-z0-9/-]*)/g`, strip variant prefixes and opacity suffixes (`/\/\d+$/`), dedupe; read every `dist/assets/*.css`; each utility name must appear as a substring in the concatenated CSS (Tailwind escapes `:` and `/` in selectors, but the bare name substring survives — `bg-ink-subtle` would be entirely absent). Whitelist the non-token built-ins actually used: `text-center`, `text-xs|sm|lg|xl|2xl`, `border-2|b-0|t-0` etc. — build the whitelist empirically from the first run's false positives, keep it in the script with a why-comment. Exit 1 listing missing classes. Wire `"guard:utilities": "node scripts/guard-utilities.mjs"` and place it AFTER `npm run build` in `ci.yml`'s frontend job (it needs `dist/`). Verify: run against current `dist` → must pass; then temporarily add `bg-ink-subtle` to a component, rebuild, run → must fail; revert.
- [ ] **Step 2: px→rem/em widening.** In `guard-tokens.sh` change the arbitrary-value check to `check '\[[0-9.]+(px|rem|em)\]' "valor arbitrario de Tailwind (usa la escala)"`. Run it; fix any existing offenders by moving them to scale classes (grep first: `grep -rnE '\[[0-9.]+(rem|em)\]' src --include='*.vue'`). The known-legitimate `pb-[env(safe-area-inset-bottom)]` and `bottom-[calc(...)]` patterns do not match the regex — confirm they still pass.
- [ ] **Step 3: parity test derives slugs from backend.** Replace the hardcoded array in `messages.spec.ts`:

```ts
import { readFileSync, readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

// la lista de slugs vive en el código del backend: si aparece un detail nuevo
// sin clave errors.*, este test debe fallar sin que nadie recuerde ampliarlo
const backendDir = join(dirname(fileURLToPath(import.meta.url)), '../../../../backend/app')
function backendSlugs(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true, recursive: true })
    .filter((e) => e.isFile() && e.name.endsWith('.py'))
    .flatMap((e) => [...readFileSync(join(e.parentPath, e.name), 'utf8').matchAll(/detail="([a-z_]+)"/g)].map((m) => m[1]))
}
```

Assert every unique backend slug plus `generic` has an `errors.*` key. Run: must pass with the current 27 slugs (the fix-wave cross-check counted 27 distinct `detail="..."` occurrences).
- [ ] **Step 4: routineEditor.spec vm→DOM.** Convert the vm-driven terminal actions (`saveRoutine`×4, `moveExerciseUp`, `removeExercise`, `addExercise` — currently around lines 154-283) to DOM click-throughs: find the save/move/remove/add controls by their rendered text or testid, `trigger('click')`, keep the existing `toHaveBeenCalledWith` assertions. Delete the tautological `expect(wrapper).toBeTruthy()` (~line 283). If a control lacks a stable selector, ADD `data-testid` to `RoutineEditorSheet.vue` (attribute-only change).
- [ ] **Step 5: All gates green** (backend suite untouched but run it anyway); **Commit** `test: utility-class guard, backend-derived slug parity and DOM-driven editor tests`

---

### Task 5: Seed realism

**Files:**
- Modify: `backend/app/dev_seed.py`, `backend/app/services/workout_sets.py` (optional `achieved_at` param), `backend/tests/test_dev_seed.py`

**Interfaces:**
- Produces: `detect_prs(db, owner_id, exercise, wset, volume, achieved_at: datetime | None = None)` — `None` keeps today's `utcnow()` behavior, so the router call sites do NOT change.

- [ ] **Step 1: Write the failing tests** in `test_dev_seed.py`: (a) every seeded `WorkoutSet.completed_at` falls on its workout's date (± 1 day for the UTC anchor, matching the naive-UTC convention from the C2 fix); (b) `PersonalRecord.achieved_at` values span at least 4 distinct dates (today they all collapse to the seed instant); (c) freyja has scheduled sessions and body entries (> 0 each); (d) the target has a `planned` ScheduledSession dated exactly `date.today()`; (e) at least one date carries 2 workouts (heatmap density above tier 1).
- [ ] **Step 2: Verify FAIL** — `uv run pytest tests/test_dev_seed.py -v`.
- [ ] **Step 3: Implement.** (1) `workout_sets.py`: add the keyword param, use `achieved_at or utcnow()` where records are stamped. (2) `_log_set`: accept and set `completed_at` explicitly (workout's `started_at` + a few minutes per set_number, staying in naive-UTC), pass it to `detect_prs` as `achieved_at`. (3) `run()`: call `_schedule_sessions(db, rng, freyja, freyja_workouts, freyja_routines, end_date)` and `_body_entries(db, rng, freyja, weeks, end_date)`. (4) `_workout_dates`: with `rng.random() < 0.12`, append a duplicate date (second session that day) — both workouts get distinct `started_at` hours and both end, so the single-active partial index is untouched. (5) `_schedule_sessions`: `first_offset = 0` (today's planned session is deterministic, not a coin flip).
- [ ] **Step 4: Backend suite green** (`uv run pytest -q` — the detect_prs change must not break the router tests).
- [ ] **Step 5: Commit** `feat: backdated realistic dev seed for both athletes`

---

### Task 6: Type, datetime and i18n hygiene

**Files:**
- Create: `frontend/src/lib/runeResolve.ts` (moved from `components/calendar/groupRune.ts`, which is deleted)
- Modify: `frontend/src/api/domain.ts`, `frontend/src/api/auth.ts`, `frontend/src/utils/datetime.ts`, `frontend/src/components/celebration/BkCelebration.vue`, `frontend/src/i18n/es.ts`, `frontend/src/i18n/en.ts`, all importers of `groupRune` (grep `from '@/components/calendar/groupRune'` — at least WorkoutView, MonthGrid, RoutineList)
- Test: extend `frontend/src/utils/__tests__/datetime.spec.ts`; existing suites cover the rest (type changes are compile-time — `npm run build` is the test)

- [ ] **Step 1: Failing test for parseUtc date-only.** `parseUtc('2026-08-06')` must NOT be Invalid Date (today `'2026-08-06Z'` is): assert `parseUtc('2026-08-06').getUTCDate()` is 6.
- [ ] **Step 2: Verify FAIL.**
- [ ] **Step 3: Implement.**

`datetime.ts` — only datetime strings get the Z treatment:

```ts
export function parseUtc(value: string): Date {
  if (!value.includes('T')) return new Date(value) // fecha sin hora: ya es UTC-medianoche por spec
  return new Date(HAS_OFFSET.test(value) ? value : `${value}Z`)
}
```

`api/auth.ts` — tighten `UserOut`: `locale: 'es' | 'en'`, `units: 'kg' | 'lb'` (timezone stays `string`). `api/domain.ts`: delete its duplicate `UserOut` and re-export the auth one (`import type { UserOut } from './auth'` + `export type { UserOut }`); `ScheduledOut.status: 'planned' | 'done' | 'skipped'`; `updateSchedule` body `status?: 'planned' | 'skipped'` (matches the backend Literal). Chase resulting vue-tsc fallout (e.g. code comparing status to arbitrary strings). `ExerciseOut.measurement` stays the narrowed `Measurement` — add a why-comment that the backend Out is `str` and the catalog only emits these four. `BkCelebration.vue`: `import { core } from '@/tokens'` and `const COUNT_UP_MS = parseInt(core.dur[4], 10)` — delete the drift-prone comment. Move `isValidRuneName` + `primaryRune` to `src/lib/runeResolve.ts` verbatim, update all importers, delete `groupRune.ts`. i18n: delete dead keys from BOTH languages: `common.close`, `common.loading`, `common.retry`, `today.statusPlanned`, `today.statusDone`, `today.statusSkipped` (verified zero usages). KEEP `errors.timezone_invalid` / `errors.password_too_long` — currently unreachable (pydantic 422 collapses to generic) but they are real backend slugs the parity test now derives.
- [ ] **Step 4: Tests + build green** (the messages parity test from Task 4 must still pass after key deletions).
- [ ] **Step 5: Commit** `refactor: tighten api types, token-sourced count-up, rune resolver relocation`

---

### Task 7: Sheet stack, toast a11y, calendar rendering fixes

**Files:**
- Modify: `frontend/src/lib/BkSheet.vue`, `frontend/src/lib/BkToast.vue`, `frontend/src/stores/toast.ts`, `frontend/src/components/calendar/MonthGrid.vue` (duplicate keys), `frontend/src/views/CalendarView.vue` (heatmap empty state), `frontend/src/i18n/es.ts`, `frontend/src/i18n/en.ts`
- Test: extend `frontend/src/lib/__tests__/primitives2.spec.ts` (or the file currently covering BkSheet/BkToast — locate by grep), `frontend/src/components/calendar/__tests__/calendar.spec.ts`

- [ ] **Step 1: Write the failing tests.** (a) Sheet stack: mount two open BkSheets, dispatch one window `keydown` Escape, assert ONLY the later-opened one emitted `close` (and the first emits after a second Escape); (b) toast pause: `vi.useFakeTimers`, push a toast, `trigger('mouseenter')` on it, advance 5000ms, assert it still renders; `mouseleave`, advance 4000ms, assert gone; (c) toast keyboard: each toast renders a focusable dismiss button with an aria-label, clicking it dismisses; (d) MonthGrid: two same-group workouts on one day render without Vue duplicate-key warnings (spy on `console.warn`, assert not called with a `Duplicate keys` message) and show at most 3 runes; (e) CalendarView: with `getHeatmap` resolving `[]`, the heatmap section heading still renders.
- [ ] **Step 2: Verify FAIL.**
- [ ] **Step 3: Implement.** BkSheet — module-scope stack so only the topmost sheet answers Escape:

```ts
// pila de sheets abiertos a nivel de módulo: con sheets anidados, un Escape
// debe cerrar SOLO el de arriba, no toda la pila a la vez
const sheetStack: symbol[] = []
```

Each instance gets `const id = Symbol()`; the `open` watcher pushes/removes `id`; `onKey` returns early unless `sheetStack.at(-1) === id`; unmount cleanup removes it. Toast store: keep per-toast timer handles in a `Map`, add `pause(id)` (clearTimeout) and `resume(id)` (fresh 4000ms). BkToast: `@mouseenter="store.pause(toast.id)" @mouseleave="store.resume(toast.id)" @focusin="store.pause(toast.id)" @focusout="store.resume(toast.id)"`, and an explicit dismiss `<button :aria-label="$t('common.dismiss')">✕</button>` inside each toast (new key `common.dismiss`, es `Cerrar aviso` / en `Dismiss`). MonthGrid: rune `:key` becomes index-scoped (`` :key="`rune-${cell.date}-${i}`" `` via `v-for="(runeName, i) in ..."`). CalendarView: drop the `v-if="heatmapData.length > 0"` wrapper — always render the section; verify `BkHeatmap` tolerates `[]` (it builds the year grid from `year`, days default to count 0 — read `frontend/src/lib/heatmap.ts` and fix there if empty data throws).
- [ ] **Step 4: Tests + build green.**
- [ ] **Step 5: Commit** `fix: topmost-only sheet escape, pausable dismissible toasts, calendar render fixes`

---

### Task 8: Display formatting and unit ergonomics

**Files:**
- Modify: `frontend/src/utils/dates.ts` (`formatDayLabel`, `formatTimeShort`), `frontend/src/components/calendar/ScheduleSheet.vue`, `frontend/src/components/today/TodaySessionCard.vue`, `frontend/src/components/workout/SetForm.vue`, `frontend/src/components/progress/BodySection.vue`
- Test: extend `frontend/src/utils/__tests__/dates.spec.ts`, `frontend/src/components/calendar/__tests__/calendar.spec.ts`, `frontend/src/components/workout/__tests__/setForm.spec.ts`, `frontend/src/components/progress/__tests__/progress.spec.ts`

- [ ] **Step 1: Write the failing tests.** (a) `formatDayLabel('2026-08-25', 'es')` → contains `25` and `agosto` (build via `new Date(2026, 7, 25)` — LOCAL constructor, never `new Date(iso)`, so the label can't day-shift); `formatTimeShort('19:04:00')` → `'19:04'`, `formatTimeShort(null)` → `null`. (b) ScheduleSheet renders the localized header (assert `agosto` visible, not the raw ISO) and `19:30`, never `19:30:00`. (c) SetForm in lb mode: weight stepper default is 45, step is 5 (drive one increment via the real `+` button and assert emitted `weight_kg` is `displayToKg(50, 'lb')`). (d) BodySection round-trip: prefill from `weight_kg: 80` in lb mode, submit WITHOUT touching the weight field, assert `upsertBody` called with `weight_kg: 80` exactly (today it drifts to 80.02).
- [ ] **Step 2: Verify FAIL.**
- [ ] **Step 3: Implement.** `dates.ts`:

```ts
export function formatDayLabel(iso: string, locale: string): string {
  const [y, m, d] = iso.split('-').map(Number)
  return new Intl.DateTimeFormat(locale, { weekday: 'long', day: 'numeric', month: 'long' }).format(new Date(y, m - 1, d))
}

export function formatTimeShort(hms: string | null): string | null {
  return hms ? hms.slice(0, 5) : hms
}
```

ScheduleSheet header `{{ formatDayLabel(date, $i18n.locale) }}`; both time render sites through `formatTimeShort`. SetForm — constants become per-unit display-space values with a single lookup:

```ts
// paso/valores por defecto en el espacio de la unidad del usuario: 2.5 kg es
// un incremento natural, 2.5 lb no lo es (los discos son de 5 lb)
const WEIGHT_UI = {
  kg: { step: 2.5, initial: 20, max: 500 },
  lb: { step: 5, initial: 45, max: 1100 },
} as const
```

(the `weightDisplay` ref seeds from `WEIGHT_UI[props.units].initial`; stepper binds `:step/:max` from it; min stays per current behavior). BodySection — remember the prefilled canonical value and skip reconversion when untouched:

```ts
// si el usuario no tocó el campo, se reenvía el kg original: el viaje
// kg→lb(1dp)→kg(2dp) desplaza el valor aunque nadie lo haya editado
```

Store `prefill = { weight_kg, ... }` and the prefilled display strings at fill time; on save, per field: input string unchanged → send the original canonical value; changed → `displayToKg` as today.
- [ ] **Step 4: Tests + build green.**
- [ ] **Step 5: Commit** `fix: localized schedule labels, natural lb steps, drift-free body round-trip`

---

### Task 9: Latin font precache and spacing token removal

**Files:**
- Modify: `frontend/src/main.ts` (latin subset imports), `frontend/vite.config.ts` (workbox globPatterns), `frontend/src/tokens/index.ts` (remove `space`), `frontend/src/styles/tokens.css` (regenerated)
- Test: build inspection (this is build config; assert via commands, not vitest)

- [ ] **Step 1: Latin imports.** Verify the files exist first: `ls node_modules/@fontsource/chakra-petch/latin-600.css node_modules/@fontsource/chakra-petch/latin-700.css node_modules/@fontsource/jetbrains-mono/latin-400.css node_modules/@fontsource/jetbrains-mono/latin-600.css`. Switch `main.ts` to those four latin imports. `@fontsource-variable/inter` ships no per-subset CSS entry point — keep `import '@fontsource-variable/inter'` (unicode-range already gates downloads) and let the SW glob below pin its latin file offline.
- [ ] **Step 2: Precache.** In `vite.config.ts` workbox options add:

```ts
// el shell offline necesita las fuentes latin en el precache (por defecto
// workbox solo mete js/css/html); los demás subsets quedan online-only
globPatterns: ['**/*.{js,css,html,svg,png,ico}', 'assets/*-latin-[0-9w]*.woff2'],
```

(the `[0-9w]` class matches `latin-600`/`latin-400`/`latin-wght` but NOT `latin-ext-*`).
- [ ] **Step 3: Remove spacing tokens.** Delete `space` from `core` in `tokens/index.ts` (zero consumers verified — Tailwind's own scale is the spacing system; a parallel unused scale is drift waiting to happen), run `npm run build:tokens`, confirm `--bk-space-*` gone from `tokens.css`.
- [ ] **Step 4: Verify.** `npm run build` then: `grep -c 'latin' dist/sw.js` shows the latin woff2 entries in the precache manifest and NO `latin-ext`/`thai`/`vietnamese` entries (`grep -c 'thai\|vietnamese' dist/sw.js` → 0 in the precache list); dist no longer ships thai/vietnamese chakra files at all (latin-only CSS imports); `npm run test` + token drift `git diff --exit-code src/styles/tokens.css` after regen is committed.
- [ ] **Step 5: Commit** `feat: latin-only fonts with offline precache; drop unused spacing tokens`

---

### Task 10: Container hardening, CI hardening, release workflow

**Files:**
- Modify: `Dockerfile`, `.github/workflows/ci.yml`
- Create: `.github/workflows/release.yml`
- Test: `docker build` + `docker run` verification commands (no unit tests)

- [ ] **Step 1: Dockerfile non-root + proxy headers.** After the static copy:

```dockerfile
# el proceso no necesita root: correr como usuario dedicado limita el radio
# de un compromiso del contenedor; /data debe ser suyo para poder escribir la DB
RUN groupadd --system berserk && useradd --system --gid berserk --home-dir /app berserk \
  && mkdir -p /data && chown berserk:berserk /data
USER berserk
```

and extend the CMD: `alembic upgrade head && exec uvicorn app.asgi:app --host 0.0.0.0 --port 8000 --proxy-headers` (`--proxy-headers` honors `X-Forwarded-*` only from `FORWARDED_ALLOW_IPS`, default loopback — inert without a proxy, and the README documents setting `FORWARDED_ALLOW_IPS` when one exists).
- [ ] **Step 2: Verify container.** `docker build -t berserk:t .` then `docker run --rm berserk:t id -u` prints a non-zero uid, and `docker run --rm -d -p 18000:8000 berserk:t` reaches healthy (`curl -fs localhost:18000/api/v1/health`) — migrations wrote to /data as the app user. Stop the container.
- [ ] **Step 3: CI hardening.** In `ci.yml` add top-level `permissions: { contents: read }` and `concurrency: { group: ci-${{ github.ref }}, cancel-in-progress: true }`. Pin every action to a full commit SHA with a version comment — resolve each SHA at implementation time via `git ls-remote https://github.com/actions/checkout refs/tags/v4*` (same for `astral-sh/setup-uv`, `actions/setup-node`), e.g. `uses: actions/checkout@<sha> # v4.x`. Add the Task 4 `guard:utilities` step after the frontend build if not already wired.
- [ ] **Step 4: release.yml.**

```yaml
name: release
on:
  push:
    tags: ['v*']
permissions:
  contents: read
  packages: write
jobs:
  publish:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@<sha> # v4.x
      - uses: docker/setup-qemu-action@<sha> # v3.x
      - uses: docker/setup-buildx-action@<sha> # v3.x
      - uses: docker/login-action@<sha> # v3.x
        with:
          registry: ghcr.io
          username: ${{ github.actor }}
          password: ${{ secrets.GITHUB_TOKEN }}
      - uses: docker/metadata-action@<sha> # v5.x
        id: meta
        with:
          images: ghcr.io/zurdi15/berserk
          tags: |
            type=semver,pattern={{version}}
            type=raw,value=latest
      - uses: docker/build-push-action@<sha> # v6.x
        with:
          context: .
          platforms: linux/amd64,linux/arm64
          push: true
          tags: ${{ steps.meta.outputs.tags }}
          labels: ${{ steps.meta.outputs.labels }}
```

(all `<sha>` resolved the same way; the frontend build stage already runs under `--platform=$BUILDPLATFORM`, so arm64 doesn't emulate npm).
- [ ] **Step 5: Commit** `feat: non-root container, hardened ci and ghcr release workflow`

---

### Task 11: README with screenshots from an ephemeral instance

**Files:**
- Create: `README.md`, `docs/screenshots/` (desktop + mobile PNGs)
- Test: manual verification commands (image files exist, README references resolve)

**Interfaces:**
- Consumes: `dev_seed` creates `admin/admin1234` on an EMPTY instance and full synthetic history. **Never touch `./data` or the running dev servers** — the ephemeral instance uses its own `BK_DATA_DIR` and port.

- [ ] **Step 1: Ephemeral instance.** From `backend/`: `TMP=$(mktemp -d)`, `BK_DATA_DIR=$TMP uv run alembic upgrade head`, `BK_DATA_DIR=$TMP uv run python -m app.dev_seed`, build the frontend (`cd frontend && npm run build`), then serve both from one process on a free port: read `backend/app/main.py` first to see how static serving is wired (`BK_SERVE_STATIC` and the static dir path) and launch accordingly, e.g. `BK_DATA_DIR=$TMP BK_STATIC_DIR=$PWD/../frontend/dist uv run uvicorn app.asgi:app --port 8001` — use whatever env var main.py actually reads; if static pathing can't be redirected by env, fall back to `python -m http.server` for dist plus the API on 8001 with a tiny proxy note. Confirm `curl -fs localhost:8001/api/v1/health`.
- [ ] **Step 2: Screenshots.** One-off playwright (`npx -y playwright install chromium` if needed) with a throwaway script in `$TMPDIR` (not committed): log in as `admin/admin1234`, capture `today`, `calendar`, `workout` (start one from a routine, log a set so the view is alive), `progress` at 1440×900 into `docs/screenshots/desktop-{today,calendar,workout,progress}.png`, and `today` + `workout` at 390×844 into `docs/screenshots/mobile-{today,workout}.png`. Language ES (seed default). Then kill the server, `rm -rf $TMP`, and discard the started workout with the instance (it dies with the temp DB).
- [ ] **Step 3: README.** Structure: title + one-line tagline (ES flavor, EN body — the repo audience is GitHub, write the README in English); CI badge (`.github/workflows/ci.yml` on main) and release badge; screenshot grid (desktop hero + mobile pair); Features (planning calendar, per-muscle-group logging with runes, live PR detection, progress analytics, multi-user read sharing, invite-only signup, PWA, ES/EN, kg/lb); Quickstart:

```yaml
services:
  berserk:
    image: ghcr.io/zurdi15/berserk:latest
    ports: ["8000:8000"]
    volumes: ["berserk-data:/data"]
volumes:
  berserk-data:
```

plus the first-run note (first account created becomes admin), bind-mount ownership note (container runs as a non-root system uid — `chown` the host dir to that uid or use a named volume), `FORWARDED_ALLOW_IPS` note for reverse proxies; Development (`./dev.sh --seed`, ports 8000/5173); Stack one-liner. No license section (no LICENSE file exists — that decision is zurdi's).
- [ ] **Step 4: Verify** — every image referenced by README exists (`grep -o 'docs/screenshots/[a-z.-]*' README.md | xargs ls`), and the screenshots genuinely show seeded data (not empty states).
- [ ] **Step 5: Commit** `docs: readme with screenshots and deployment guide`

---

### Task 12: Final gates and v0.1.0 preparation

**Files:**
- Modify: `backend/pyproject.toml` (version `0.1.0`), `frontend/package.json` + `frontend/package-lock.json` (version `0.1.0` via `npm version 0.1.0 --no-git-tag-version`)
- Create: `CHANGELOG.md`

- [ ] **Step 1: Versions + changelog.** Set both versions to `0.1.0`. `CHANGELOG.md` with a single `## 0.1.0` section summarizing the five phases in ~8 bullets (auth+invites, training domain with PR detection, norse-futurist token design system, the five views + PWA, hardening/release).
- [ ] **Step 2: Full gates, in order:** `cd backend && uv run pytest -q` → `cd frontend && npm run test && npm run build && npm run guard:tokens && npm run guard:utilities` → token drift `npm run build:tokens && git diff --exit-code src/styles/tokens.css` → `docker build -t berserk:rc .`.
- [ ] **Step 3: Commit** `chore: v0.1.0 version bump and changelog`. **Do NOT create the git tag and do NOT push** — zurdi tags after their manual validation.

---

## Self-Review

- **Carry coverage:** every item in the memory's "Scope fase 5" list maps to a task — release block → T10/T11/T12; orphaned features → T1/T2/T3; guard/tests → T4; seed realism → T5; a11y/polish block → T6 (types, parseUtc, COUNT_UP_MS, primaryRune, dead keys), T7 (toast, sheets, MonthGrid keys, empty heatmap), T8 (ISO header, seconds, SetForm lb, body drift), T9 (fonts, spacing tokens). No task invents scope beyond the list except the AdminCard redeem-URL copy (T1), which the redeem page makes necessary to be usable.
- **Placeholder scan:** all code steps carry real code or an exact command; the two deliberate "resolve at implementation time" points (action SHAs, `BK_STATIC_DIR` env name) are verification instructions with the lookup command given, not TBDs.
- **Type consistency:** `redeemInvite`/`redeemAccount` (T1) match across api/store/view; `WEIGHT_UI` (T8) is self-contained; `detect_prs` widening (T5) is keyword-optional so router call sites compile untouched; `UserOut` unification (T6) lands before nothing depends on the duplicate (T1's redeem uses the auth-side type, which remains the canonical one).
- **Ordering:** UI tasks (1-9) precede screenshots (11); seed realism (5) precedes screenshots so they show varied PR dates; guards (4) precede the tasks whose new code they police at commit time… (they run in CI regardless); container/CI (10) precedes the README that documents its non-root uid.

Plan complete and saved.

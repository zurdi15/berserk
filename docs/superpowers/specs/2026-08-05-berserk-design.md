# berserk — self-hosted workout tracker — design

Date: 2026-08-05
Status: approved pending user review

## Overview

berserk is a self-hosted, multi-user workout tracker with a Norse-futurist-minimal
aesthetic. Mobile-first PWA, primarily used on a phone at the gym; fully responsive
for desktop. Single Docker image, SQLite storage.

### Goals

- Plan and log workouts: reusable routines plus ad-hoc sessions.
- Global calendar: schedule future sessions, track done/skipped, review history.
- Per-exercise logging adapted to exercise type (strength sets vs cardio time).
- Multi-user with explicit read-only sharing between users.
- Progression analytics: per-exercise charts, auto-detected PRs, streaks, annual
  heatmap, muscle-group distribution, body weight/measurements.
- Token-driven design system with pervasive CSS-only animations.

### Non-goals

- Nutrition tracking (explicitly excluded for now).
- Offline-first sync (online-only PWA; app shell is precached, data is not).
- Open registration (admin creates accounts / issues invites).
- Editing another user's data (sharing is read-only, always).

## Stack

Follows the owner's established conventions (turtletrips as the structural mold,
bifrost as the design-system mold):

- Backend: Python 3.13, FastAPI, SQLAlchemy 2.0, Alembic, pydantic-settings
  (env prefix `BK_`), managed with uv + lockfile.
- DB: single SQLite file (`/data/berserk.db`), WAL, `foreign_keys=ON` via event
  listener. No separate metrics DB (data volume is trivial).
- Frontend: Vue 3 Composition API + TypeScript, Vite, Pinia, vue-router,
  vue-i18n (ES + EN, per-user setting persisted in DB), Tailwind 4, uPlot for
  charts, vite-plugin-pwa. npm.
- UI components: own primitives in `src/lib/` (no PrimeVue/Vuetify).
- Auth: server-side sessions (turtletrips pattern). No JWT.
- Deploy: single multi-stage Docker image (node build of SPA -> python slim
  serving API + static files), published to `ghcr.io/zurdi15/berserk`,
  `alembic upgrade head` on start, `VOLUME /data`, healthcheck. Example compose
  in `examples/`. Eventual k8s manifest lives in ginnugagap (out of scope here).

## Repository layout

```
berserk/
├── backend/
│   ├── app/
│   │   ├── routers/        # auth, users, sharing, exercises, routines,
│   │   │                   # calendar, workouts, progress, body
│   │   ├── schemas/        # Pydantic
│   │   ├── services/       # business logic: PR detection, streaks, progression
│   │   ├── models.py
│   │   ├── auth.py         # session auth + permission dependencies
│   │   ├── db.py
│   │   └── config.py
│   ├── alembic/
│   ├── tests/
│   └── pyproject.toml
├── frontend/
│   ├── src/
│   │   ├── tokens/         # index.ts, single source of truth -> tokens.css
│   │   ├── lib/            # Bk* primitives
│   │   ├── components/     # per feature: workout/, calendar/, progress/, ...
│   │   ├── views/
│   │   ├── stores/
│   │   ├── composables/  utils/  i18n/  api/
│   │   └── styles/         # generated tokens.css + animations.css
│   └── package.json
├── Dockerfile
├── examples/docker-compose.yml
├── dev.sh                  # backend + frontend hot reload; --seed for fixtures
└── docs/
```

## Data model

### Users and access

- `users` — username, bcrypt password hash, `is_admin`, locale (es/en), units
  (kg/lb), timezone.
- `auth_sessions` — sha256 of session token, sliding expiry.
- `invites` — single-use invite tokens issued by admin, with expiry.
- `share_grants` — `owner_id -> viewer_id`. Grants the viewer read-only access
  to the owner's workouts, calendar, progression and body data. Unidirectional,
  revocable.

### Exercise catalog

- `muscle_groups` — slug + i18n name, `owner_id` NULL for global seed rows
  (chest, back, biceps, triceps, shoulders, legs, core). Users can create their
  own private groups; admin can create additional global ones. Expandable
  without migrations.
- `exercises` — name, measurement type, `owner_id` NULL for the global seed
  catalog (~60 exercises) or the creating user for custom ones.
  Measurement types:
  - `strength`: sets x reps x weight
  - `bodyweight`: sets x reps, optional added weight (e.g. weighted pull-ups)
  - `timed`: sets x duration (plank, farmer walk)
  - `cardio`: duration, optional distance (treadmill, bike, rowing)
- `exercise_muscle_groups` — m2m with `is_primary` flag. The muscle groups
  trained on a given day are derived from the exercises logged; a manual
  day-level tag remains possible for off-catalog work.

### Routines

- `routines` — per user: name, description, color/rune.
- `routine_exercises` — order, target sets, target reps, optional target
  weight, rest seconds (feeds the rest timer).

### Calendar and workouts

- `scheduled_sessions` — date, optional time, optional planned routine, status
  `planned | done | skipped`, FK to the resulting workout when completed.
- `workouts` — date, start/end time (real duration), optional source routine,
  free note, session feeling (1-5).
- `workout_exercises` — order, exercise, note.
- `workout_muscle_groups` — optional m2m for manually tagging a workout's
  muscle groups when doing off-catalog work (normally derived from exercises).
- `sets` — set number, fields per measurement type (reps, weight, duration,
  distance), `is_warmup`, optional RPE (1-10), completed-at timestamp.

All weights are stored canonically in kg; lb is a per-user display conversion
only.

### Progression and body

- `personal_records` — stored as events on set save: max weight, max session
  volume, estimated 1RM (Epley) per exercise, FK to the achieving set.
  Stored (not derived) so they can be celebrated at the moment they happen and
  listed historically.
- `body_entries` — date, body weight, optional measurements as nullable
  columns (waist, chest, arm, thigh, ...).

Streaks and the annual heatmap are computed from `workouts`, never stored.

## API and permissions

Session cookie `bk_session` (HttpOnly, SameSite=Lax, sha256-at-rest, sliding
expiry). No mutating GETs. Bootstrap: with zero users, first visit offers admin
creation.

Routers:

| Router      | Resources |
|-------------|-----------|
| `auth`      | login, logout, me, password change |
| `users`     | admin: user CRUD + invites; self: profile + settings |
| `sharing`   | grant/revoke visibility; list who sees me / whom I see |
| `exercises` | global + own custom exercises, muscle groups |
| `routines`  | routine CRUD incl. exercises |
| `calendar`  | scheduled sessions; combined month view (planned/done/skipped) |
| `workouts`  | workout CRUD; active-workout endpoint for live logging |
| `progress`  | per-exercise time series (weight/volume/est. 1RM), PRs, annual heatmap, streaks, muscle-group distribution |
| `body`      | body entries and their evolution |

Permission rules, enforced as a FastAPI dependency:

1. Every resource has an owner; the owner has full access to their own data.
2. Read-only access to another user's resources iff `share_grant(owner -> viewer)`
   exists. Viewing another user reuses the same endpoints with `?user_id=`;
   the dependency validates the grant. Writes to foreign resources are never
   allowed regardless of grants.

Error handling: JSON `{detail}` with correct status codes (401/403/404/409/422).
The frontend API client surfaces them as i18n toasts. No silent failures.
404 (not 403) for foreign resources without a grant, to avoid existence leaks.

PR detection: on set save, the PR service compares against the exercise history
and returns any new records in the same response, so the UI can celebrate
immediately without polling.

## Frontend

### Navigation and views

Floating bottom bar on mobile (5 destinations), top nav on desktop
(turtletrips pattern).

- **Today** (home): current streak, today's planned session with "start
  workout" CTA, weekly summary (days, volume, muscle groups hit), latest PRs.
- **Calendar**: month view with status dots and the day's muscle groups;
  annual GitHub-style heatmap; tap a day to inspect or plan.
- **Workout** (highlighted central CTA): live logging. Routine exercise list,
  large steppers for reps/weight (sweaty-fingers friendly), completing a set
  starts the rest timer, add/reorder exercises on the fly, notes. Finish ->
  session summary with any PRs earned.
- **Progress**: exercise picker -> weight/volume/est-1RM charts; PR history;
  weekly muscle-group distribution; body weight and measurements evolution.
- **Profile**: settings (language, units), routine CRUD, sharing management,
  admin panel (users + invites), body log.

Viewing others: switch "athlete" from Profile/Sharing or Today; read-only mode
with a clear "viewing X" banner.

### State

Pinia stores per resource over a generic resource-store base (turtletrips
pattern), plus an `activeWorkout` store that persists the in-progress workout
to the backend on every saved set — killing the browser at the gym loses
nothing; reopening restores the active workout.

### Rest timer

Lives in the store, not in a component; runs across navigation. Uses absolute
timestamps (not accumulated `setInterval` ticks) so it survives locked screens.
While active it renders as a **globally visible floating pill** (dynamic-island
style, anchored above the bottom nav) on every view: countdown ring, vibration
on finish, tap returns to the active workout.

## Design system

Infrastructure (bifrost pattern):

- `src/tokens/index.ts` is the single source of truth; `npm run build:tokens`
  generates `tokens.css`. Prefix `--bk-*`. Generated file is never hand-edited.
- Token families: color, spacing, radii, typography, durations (`--bk-dur-*`),
  easings (`--bk-ease-*`), shadows/glows, z-index.
- `npm run guard:tokens` fails the build on raw hex, raw cubic-bezier, or
  arbitrary sizes.
- Dark-first: the base theme is dark; the light theme redefines variables only.
  Never `dark:` variants.

Aesthetic direction — "Norse-futurist minimalism":

- Near-black background with subtle stone/mist texture; surfaces as carved
  slabs with thin edges.
- One cold aurora accent (electric green-cyan) + one ember accent reserved for
  PRs and streaks. Everything else desaturated: color only where it means
  something.
- Elder Futhark runes as graphic language: each muscle group has an associated
  rune, routines get a selectable rune, runic dividers, the PWA icon is a rune.
- Typography: angular display face for big numbers and titles, clean sans for
  UI, mono + `tabular-nums` for all metrics (weights, reps, timer).

Animations — pure CSS (no GSAP/framer-motion; `transform`/`opacity` only;
entry animations only; single `prefers-reduced-motion` guard in
`animations.css`):

- View transitions via Vue `<Transition>`: rise + fade, list stagger.
- PR celebration: the exercise's rune is "carved" on screen
  (SVG stroke-dashoffset), ember flash, counter rolling up to the record.
- Streak: ember/flame that grows with consecutive weeks.
- Annual heatmap: cells light up in a cascade on entry.
- Rest timer: SVG ring being consumed, pulse when done.
- Set completed: check pop + row settle.
- Microinteractions throughout: press-scale on buttons, bottom sheets with
  spring easing, shimmer skeletons.

Primitives (`src/lib/`): BkButton, BkCard, BkSheet (mobile bottom sheet),
BkStepper (the core reps/weight input), BkRing (progress ring), BkRune,
BkHeatmap, BkChart (over uPlot), BkToast, BkField, BkTabs, BkAvatar, BkEmpty.

## Testing

Backend (pytest + pytest-asyncio, in-memory SQLite with StaticPool, bcrypt
rounds=4, authenticated client + admin fixtures):

- Auth: login/logout/expiry/bootstrap.
- Permission scoping: no grant -> 404 on foreign resources; grant -> read but
  never write.
- Pure service logic: PR detection, estimated 1RM, streaks, progression
  aggregates (where the subtle bugs live).
- CRUD per router.

Frontend:

- vitest for pure utils/composables (streak rendering math, kg/lb formatting,
  timer logic with absolute timestamps).
- `vue-tsc --noEmit` typecheck.
- `guard:tokens` in CI.

Dev seed: `dev.sh --seed` creates admin + 2 users, exercise catalog, sample
routines and ~3 months of generated workouts with realistic progression, so
charts, heatmap and shared views are workable without manual data entry.

CI: pytest, vitest, vue-tsc, guard:tokens, image build; release to GHCR on tag.

## Decisions log

- Routines + logging (not ad-hoc only) — chosen by user.
- PWA online-only (no offline sync) — chosen by user.
- Admin-created accounts / invites; no open registration — chosen by user.
- Extra features in scope: progression + PRs, rest timer, body weight and
  measurements, streak + annual heatmap — chosen by user.
- i18n ES + EN, per-user — chosen by user.
- Calendar plans forward and records history — chosen by user.
- Own UI primitives, no component library — chosen by user.
- Muscle groups expandable (seed + custom + admin-global) — requested by user.
- Rest timer globally visible on every view while active — requested by user.

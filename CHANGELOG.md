# Changelog

All notable changes to this project are documented in this file.

## 0.2.0 - 2026-08-06

- Custom form primitives replacing every native picker: a filterable select, a time field, and a mini-calendar date field, all with full keyboard support, ARIA semantics, and a shared layer stack so Escape always closes the topmost surface.
- Retroactive training: log a past workout from the calendar (created already finished on that date) and edit any registered workout — sets, exercises, muscle tags, feeling, note, and the date itself — with personal records dated to the workout's day.
- Calendar day sheet overhaul: one unified card per training with full info (routine, time and duration, exercises, totals, feeling, note), the day's personal records, and scheduling restricted to today-or-future with a minimum time for today.
- Lifetime stats tab in Progress: workouts, gym and cardio hours, distance, volume lifted, sets and reps, PR count, average session length, and the longest weekly streak.
- Admin backup and restore: a consistent SQLite snapshot exported as a zip with an integrity manifest, and a validated, atomic restore that keeps the previous database as a fallback.
- Routine cards now expand to show their exercises inline, with unified icon-only actions across the app (edit, password, delete).
- Motion overhaul: numbers roll in with a count-up, chart lines draw progressively inside a fully mounted frame, the annual heatmap cascades cell by cell in a fixed 3×4 month grid, and section changes animate smoothly in the navigation bar.
- Refined chrome: berserk rune favicon, new navigation runes (Sowilo, Tyr, Dagaz), a stable aurora-styled scrollbar, placeholder-style field labels with a single focus ring, and drawers that animate in and out with proper safe-area padding.

## 0.1.0 - 2026-08-06

- Authentication with server-side sessions, first-admin bootstrap on an empty instance, and single-use invites with public redemption.
- Full training domain: a 59-exercise seeded catalog, custom exercises and muscle groups, routines, and a calendar-to-workout state machine.
- Live PR detection during logging, using an Epley 1RM estimate.
- Progress analytics: streak tracking, a training heatmap, and muscle-group distribution.
- Body tracking (weight and measurements) and read-only sharing of a training log with another user.
- A norse-futurist, token-driven design system (aurora/ember palettes, Chakra Petch display type, pure-CSS entry animations, runic iconography) with CI-enforced token and utility guards.
- Five core views (Today, Calendar, Workout, Progress, Profile) as an installable, bilingual (ES/EN) PWA, with a global rest timer, PR celebration, an athlete view-mode for shared logs, and kg/lb display.
- Hardening and release prep: a non-root container image, SHA-pinned CI workflows, a ghcr.io release workflow, and a README with screenshots and a deployment guide.

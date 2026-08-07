# Changelog

All notable changes to this project are documented in this file.

## 0.3.2 - 2026-08-07

- Your custom exercises can be made visible to everyone: other users see them with attribution and can train with them, while editing stays yours.
- Routine templates: mark a routine as visible to all, copy someone else's template (or an admin's global one) into your own list as a snapshot, and admins can promote a routine to a global template.
- The cardio countdown now survives the phone killing the tab: it resumes where it was on return, and if it finished while you were away the set logs itself with the full duration.
- README screenshots and feature list now reflect the current app.

## 0.3.1 - 2026-08-07

- Retroactive workouts can now record their real start time and duration, and editing a workout's date moves its timestamps along with it — gym-time stats reflect reality.
- Rest timer on your terms: cancel it early from the workout header, or switch off automatic rest entirely (the preference sticks).
- The aurora set signature was refined: streaks stay invisible until fired, turn the top corners at constant speed, and the side trails fade out as the light crosses the top.
- The set drawer's steppers were compacted so weight and reps always sit side by side without overlapping on narrow phones.
- The body-tracking tab gained the unified empty state, and the login screen no longer scrolls.

## 0.3.0 - 2026-08-07

- Workout flow redesigned around compact exercise cards and a bottom logging drawer: new sets prefill from your last effective set, the previous session's sets are shown line by line, "log and another" chains fast consecutive sets, and rest between sets is configurable per exercise (workout → routine → default).
- Muscle groups are now derived automatically from the workout's exercises (with backfill for existing history), a finished workout can be saved as a routine, cardio logs as its own block with a target-duration countdown that auto-logs on completion, and a stretched check rides along each workout.
- Logging a set fires an aurora signature: two light streaks race up the screen edges and meet at the top — personal records still take the ember celebration.
- Calendar: one dot per workout (colored by the viewed athlete's color), planned sessions as hollow dots, today marked by its border, icon actions to delete/skip/replan, a fixed 3×4 annual heatmap with horizontal weeks and flat brightness, "schedule session" deep-links into today's day sheet, and deleting a past workout no longer resurrects a planned session.
- Rest timer takes over the central rune with a live countdown, the button glows while a workout is in progress, and a mobile notification fires when rest ends in the background.
- The full Elder Futhark is available for routines, every rune ships as a reusable SVG asset, and muscle groups carry a dedicated rune with a unified picker in create and edit.
- Library: admins manage global exercises and the predefined catalog, muscle-group tags show everywhere exercises are listed, and creation flows live in drawers.
- Progress: a lifetime stats tab (gym hours, cardio time, distance, volume, longest streak and more) leads the reordered tabs, and the muscle distribution states exactly what it measures.
- Sharing picks users from a directory instead of a guess-the-username field, each user has a color, and empty states are unified with their action button in place.
- A reusable search-list primitive powers exercise picking, confirm/cancel swaps animate, the set drawer is centered with side-by-side steppers, and stray dash placeholders are gone.

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

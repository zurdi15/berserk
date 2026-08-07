# Changelog

All notable changes to this project are documented in this file.

## 0.8.1 - 2026-08-07

- Progress > Workouts: the exercise list now fills the screen until you pick one — then it shrinks smoothly while the chart block animates in. The pointless "All exercises" option is gone.

## 0.8.0 - 2026-08-07

- Supersets are now created where exercises are added: tick "Superset" in the add-exercise sheet and pick two — they land already linked in their block. The chain buttons between cards are gone; the block header carries the single dissolve control.
- The exercise picker list now takes up most of the screen instead of a short strip.

## 0.7.0 - 2026-08-07

- Supersets can now be created and dissolved inside the live workout: a chain toggle between cards links or splits them (closed chain = linked, in the editor too), works offline, and grouped exercises render inside one aurora-bordered block with a single "Superset A" header.
- The rest timer's cancel is a red X sitting right next to the countdown in the central button — always visible, no tap needed — and dismissing it (or the timer ending) animates the button narrowing while the rune carves itself back in.
- Pinned bars (tabs, month bar, workout chrono) now carry the same subtle grain as the page background instead of reading as a flat different color.

## 0.6.0 - 2026-08-07

- Gym offline: the live workout works without coverage — log, edit and delete sets, add or remove exercises, start from an already-seen routine and finish the workout, all applied instantly on-device and queued for sync. A shell band shows the pending count; when connectivity returns everything replays in order, exactly once (server-side idempotent dedupe), with a toast confirming the sync.
- Today, calendar, routines and every other read fall back to the last thing you saw when there is no network, and the live workout survives reloading the app offline.
- Records are still detected on sync (the celebration stays a live-only event), and destructive flows (discard) deliberately require network.

## 0.5.1 - 2026-08-07

- Your own calendar dots now paint in your user color (aurora stays only for users without a color set); the viewed athlete's color still rules in athlete mode.

## 0.5.0 - 2026-08-07

- Supersets: link exercises into A/B groups in the routine editor; grouped cards show joined in the workout with a "next up" hint, and the automatic rest fires only when the group's round closes — solo exercises rest as always.
- One scroll to rule the app: sections scroll as a normal page again (also on mobile), while tab strips, the calendar month bar and the workout chrono stay pinned on top as you scroll; the desktop scrollbar returns to the window edge.
- Mobile scrollbars are native again (appear while scrolling, fade out); the thin aurora bar stays on desktop pointers only.

## 0.4.4 - 2026-08-07

- Fixed a mobile regression from 0.4.3: every section's content box ended ~128px above the bottom bar (a leftover flow spacer double-counted the navbar reserve once all views got their own internal scroll). All sections now end with a uniform clean margin above the bar.

## 0.4.3 - 2026-08-07

- App-wide scroll model: every section pins its chrome (tab strips, headers) and scrolls its own content internally, ending cleanly above the bottom bar — and section changes always start at the top.
- The central button hosts the whole rest-timer story now: fixed height in every state (no more navbar resize), and while resting on the workout screen a tap expands it to reveal the cancel action.
- Rest seconds accept manual values besides the presets; steppers pin minus and plus to the row edges so x.5 values never shift the buttons.
- Library and admin lists load with skeleton rows instead of jumping; new routines default to Global; day-sheet user chips are uniform and show your own name and color.
- Assorted polish: "New routine" sits below the list, routine cards center their rune and actions, and the redundant auto-rest label is gone.

## 0.4.2 - 2026-08-07

- The day sheet grows per-user tabs: opening a day shows your training and, one tab per sharing user who trained that day, theirs — read-only, with their records of the day.
- Routines simplified to one "Global" check: marked global and everyone can see, use or duplicate it (ownership stays yours); duplicating works on your own routines too, and the admin-only globalize conversion is gone.
- The library splits into Exercises and Muscle groups tabs; ownership chips sit smaller on their own row, and every exercise shows its primary group as a rune-plus-name chip.
- Muscle distribution now lives in Today below the week summary; filtered records drop the redundant kind label; the shared-users legend is just the users, and the rune legend got its info icon back.

## 0.4.1 - 2026-08-07

- Fixed mobile scrolling: content no longer hides behind the bottom navigation bar.
- Your own calendar now shows ambient dots for every user who shares their log with you, each in their color, with a small legend — no need to enter their profile.
- Routines, exercises and muscle groups each render as a single unified list with creator attribution (you, global catalog, or another user), instead of split sections.
- Text buttons are one visual step more compact on phones.

## 0.4.0 - 2026-08-07

- Light theme: a nordic-day palette (pale fog surfaces, WCAG AA-tuned aurora and ember) selectable in Settings as dark, light or system, applied before first paint and re-theming the charts live.
- Athlete view mode now survives reloads: viewing a shared user's calendar keeps their workouts and their color on the dots, exactly where you left off.
- Admins can fully edit users: username, color and admin status from a unified sheet, with password reset kept deliberately separate.
- Validation errors finally speak: invalid passwords are caught inline before submitting, and any remaining validation error names the field instead of "something failed".
- Personal records can be filtered by kind (max weight, volume, estimated 1RM), a past workout can be logged from a routine with its exercises preloaded, and every user renders with their color dot across sharing and admin.
- Desktop chrome: the top bar gained the sliding section indicator, items align to its bottom edge, and the scrollbar lives at the window edge instead of hugging the centered content.
- Public routines referencing private exercises now say so instead of showing blank rows, templates explain themselves, and tab URLs carry anchors that restore the active tab on load.

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

# Changelog

All notable changes to this project are documented in this file.

## 0.1.0 - 2026-08-06

- Authentication with server-side sessions, first-admin bootstrap on an empty instance, and single-use invites with public redemption.
- Full training domain: a 59-exercise seeded catalog, custom exercises and muscle groups, routines, and a calendar-to-workout state machine.
- Live PR detection during logging, using an Epley 1RM estimate.
- Progress analytics: streak tracking, a training heatmap, and muscle-group distribution.
- Body tracking (weight and measurements) and read-only sharing of a training log with another user.
- A norse-futurist, token-driven design system (aurora/ember palettes, Chakra Petch display type, pure-CSS entry animations, runic iconography) with CI-enforced token and utility guards.
- Five core views (Today, Calendar, Workout, Progress, Profile) as an installable, bilingual (ES/EN) PWA, with a global rest timer, PR celebration, an athlete view-mode for shared logs, and kg/lb display.
- Hardening and release prep: a non-root container image, SHA-pinned CI workflows, a ghcr.io release workflow, and a README with screenshots and a deployment guide.

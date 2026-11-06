# Agenda (PWA)
iOS-style activity calendar for my dad. pt-BR UI, offline, no backend.
Installed on iPhone via Add to Home Screen, hosted on GitHub Pages.

## Stack
- Plain HTML/CSS/vanilla JS (ES modules). No frameworks, no build step.
- IndexedDB (database "DadsCalendarDB") for data; localStorage only for the theme.
- Service worker (sw.js) precaches the app for offline use.
- Relative paths only (served from /<repo-name>/; file names are case-sensitive).
- Layout: src/app.js (router, tab bar), src/ui/*View.js, src/logic/ (pure, unit tested),
  src/ui/icons.js (inline Phosphor SVGs), src/styles.css, tests/.

## How to work
- Do only what the task says. Smallest change that works; no refactors; don't touch
  unrelated files.
- Read REQUIREMENTS.md only if the task mentions an RF number.
- Don't commit or push.
- Reply in at most 5 lines: what changed, what you checked, anything uncertain.

## Verification (match effort to the change)
- Styling, spacing, copy: no tests. Don't run test suites.
- Logic change: run the related unit tests only.
- Behavior, navigation or data change: add or run one headless-browser check for that
  flow only, with seeded data.
- Never run the full test suites unless I ask; I run them before releasing.
- Output only failures plus one summary line. Screenshots only if I ask.

## UI rules
- iOS look: system font stack, iOS system colors via CSS variables (light/dark follows
  the system unless the user forces a theme), inset-grouped cards, 44px minimum tap
  targets, pressed states, no hover, inputs at 16px or larger, safe-area insets.
- All UI text in pt-BR, sentence case.
- Tabs: Calendário, Atividades, Ajustes (Resumo exists but is hidden until RF10).
- Pushed screens (back chevron) slide from the right and keep the tab bar. Sheets
  (Cancelar/Salvar) slide up and hide the tab bar. Never mix them.
- Motion: transform/opacity only, 400ms max, honor prefers-reduced-motion.
- Icons: inline SVGs from src/ui/icons.js. No emoji, no runtime icon libraries.
- Dates are local YYYY-MM-DD strings (never toISOString()).

## UX rules
- The user is not technical: at most 2 taps to log a day, a visible button for every
  action (gestures only as shortcuts), confirm destructive actions in plain pt-BR,
  autosave, clear empty states, friendly errors.
- Render a screen successfully before hiding other UI. If it fails, restore the previous
  screen, console.error, and show a friendly message. Never a blank screen.

## Data and releases
- Never rename the database. A schema change bumps the IndexedDB version with an
  onupgradeneeded migration that preserves data, plus a test that old data survives.
- Every file in the service worker precache list must exist; update the list when adding files.
- Deployable changes end with a version bump: edit src/version.js, then
  `npm run version:sync` (patch for fixes, minor for features).
- If a test you ran fails, find out whether the test is stale or the code is wrong, and say which.

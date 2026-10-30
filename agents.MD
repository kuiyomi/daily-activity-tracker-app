# Project: Dad's Calendar (PWA)

## Goal
Simple personal calendar app for iPhone (installed via Add to Home Screen).
Monthly view, daily activity checklist, muscle-group tracking for gym,
"rained today" toggle, dark/light mode.

## Stack
- Plain HTML, CSS and vanilla JavaScript (ES modules). No frameworks, no build step.
- Data in IndexedDB (or localStorage if the agent justifies it). No backend.
- manifest.webmanifest + service worker for offline use
- Hosted on GitHub Pages (static files only)

## Rules
- Read REQUIREMENTS.md before making changes
- One feature per change; explain what you changed
- Never rewrite files unrelated to the current task
- Mobile-first, designed for iPhone Safari (viewport-fit=cover, safe-area insets)
- Dark/light mode via CSS variables + prefers-color-scheme
- All UI text in Portuguese (pt-BR)
- Large text, big tap targets (min 44px)
- Dates: use local date strings (YYYY-MM-DD), avoid timezone bugs with toISOString()
- Keep date/stat logic in separate pure functions in /src/logic and add tests for them
- Include JSON export and import of all data
- Use relative paths everywhere (e.g. ./src/app.js, not /src/app.js), because
  GitHub Pages serves the site from /<repo-name>/
- Use Intl.DateTimeFormat('pt-BR') for month/weekday names; set <html lang="pt-BR">

## Structure
index.html  manifest.webmanifest  sw.js  /src (ui, logic, storage)  /tests  /icons

## Design: iOS look and feel
- Font: system font stack (-apple-system, "SF Pro Text", system-ui, sans-serif). No web fonts.
- Body text 17px; support the iOS text size setting using font: -apple-system-body
  as the base, with rem units elsewhere
- Use iOS system colors via CSS variables, for light and dark:
  - blue accent #007AFF (dark: #0A84FF), green #34C759, red #FF3B30
  - page background: light #F2F2F7, dark #000000
  - card/list background: light #FFFFFF, dark #1C1C1E
  - separators: thin 0.5px hairlines, low contrast
- Lists as "inset grouped" cards: rounded corners (10-12px), rows with
  separators, no heavy borders or shadows
- Toggles use an iOS-style switch (e.g. "Choveu"); use a segmented control
  where choosing between 2-3 options
- Primary navigation: bottom tab bar (Calendário, Atividades, Resumo) with
  safe-area padding, not buttons in the header
- Screens that open on top of others (new activity, muscle groups) appear as a
  bottom sheet or slide-in page with a back button, as in native iOS
- Large title at the top of main screens that shrinks to a standard title is nice
  but optional; don't overcomplicate
- Motion: short, subtle transitions (150-250ms); respect prefers-reduced-motion
- No hover effects (touch only). Set -webkit-tap-highlight-color: transparent,
  touch-action: manipulation, and a visible pressed state on every tappable element
- Inputs must use font-size >= 16px (otherwise iOS zooms the page on focus)
- Icons: emoji or simple inline SVG, consistent stroke width; no icon libraries

## UX rules (priority)
- The user is not technical. Every screen must be understandable without explanation.
- Opening the app on today's date should let him log the day in at most 2 taps
- Never hide important actions behind gestures (long-press, swipe) alone;
  they may exist as shortcuts, but there must always be a visible button
- Destructive actions (deleting an activity) require a confirmation that says
  what will be lost, in plain Portuguese
- Every change saves immediately; no "Save" button for simple toggles
- Show clear empty states ("Nenhuma atividade ainda. Toque em + para criar.")
- Short, friendly pt-BR labels; no technical jargon or error codes shown to the user
- Check contrast in both light and dark mode

## Release and data safety
- Releases: edit src/version.js, then run `npm run version:sync` (it also stamps sw.js).
- Never rename the IndexedDB database (DadsCalendarDB). Any schema change must bump
  the DB version with an onupgradeneeded migration that preserves existing data,
  with a test that data from the previous version survives.
- Every file in the service worker's precache list must exist on GitHub Pages
  (file names are case-sensitive there). When adding or renaming files, update the list.
- New screens and interactions must follow the motion rules (subtle, transform and
  opacity only, respecting prefers-reduced-motion).
- After every change, state how you verified it (tests run, browser checks).
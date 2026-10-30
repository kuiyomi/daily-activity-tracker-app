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
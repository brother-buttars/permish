---
id: TODO-010
title: "Deduplicate utility functions across pages"
status: completed
created: 2026-03-22
updated: 2026-04-24
priority: medium
tags:
  - refactor
  - frontend
---

# Deduplicate utility functions across pages

## Description

Several utility functions are defined identically in multiple page components:
- `parseOrgs()`, `isYM()`, `isYW()`, `orgBadgeClass()` -- 3 pages
- `computeAge()` -- 2 frontend pages + backend
- `isPastEvent()` -- 3 pages

## Acceptance criteria

- [x] `parseOrgs`, `isPastEvent` moved to `$lib/utils/`
- [x] `isYM`, `isYW`, `orgBadgeClass` moved to `$lib/utils/organizations.ts`
- [x] Frontend `computeAge` consolidated to use existing `$lib/utils/age.ts`
- [x] All pages import from shared utils instead of local definitions

## Resolution (2026-04-24)

- Most extraction was done in earlier refactors (`$lib/utils/events.ts`, `$lib/utils/organizations.ts`, `$lib/utils/age.ts`).
- Today: removed local `parseOrgs` in `routes/import-event/+page.svelte` (now uses `$lib/utils/events`).
- Today: removed duplicate `computeAge` in `lib/data/adapters/local.ts` (now imports from `$lib/utils/age`).
- Backend `computeAge` lives in `routes/form.js` and is intentionally separate (Node CommonJS, not shared with frontend).

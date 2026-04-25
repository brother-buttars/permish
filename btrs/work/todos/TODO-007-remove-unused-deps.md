---
id: TODO-007
title: "Remove unused dependencies (uuid, handlebars, tailwind-variants)"
status: completed
created: 2026-03-22
updated: 2026-04-24
priority: medium
tags:
  - chore
  - backend
  - frontend
---

# Remove unused dependencies

## Description

Several packages are listed as dependencies but never imported:
- `uuid` in backend (uses `crypto.randomUUID()` instead)
- `handlebars` in backend (no Handlebars templates exist)
- `tailwind-variants` in frontend (needs verification -- project uses `cn()` pattern)

## Acceptance criteria

- [x] `uuid` removed from backend
- [x] `handlebars` removed from backend
- [x] `tailwind-variants` verified and removed if unused from frontend

## Resolution (2026-04-24)

Verified zero imports across backend/frontend src. Removed via `pnpm remove`. Backend tests (117) + frontend tests (159) + svelte-check still green.

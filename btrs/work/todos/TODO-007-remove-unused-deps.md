---
id: TODO-007
title: "Remove unused dependencies (uuid, handlebars, tailwind-variants)"
status: pending
created: 2026-03-22
updated: 2026-03-22
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

- [ ] `uuid` removed from backend
- [ ] `handlebars` removed from backend
- [ ] `tailwind-variants` verified and removed if unused from frontend

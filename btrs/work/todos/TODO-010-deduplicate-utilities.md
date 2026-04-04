---
id: TODO-010
title: "Deduplicate utility functions across pages"
status: pending
created: 2026-03-22
updated: 2026-03-22
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

- [ ] `parseOrgs`, `isPastEvent` moved to `$lib/utils/`
- [ ] `isYM`, `isYW`, `orgBadgeClass` moved to `$lib/utils/organizations.ts`
- [ ] Frontend `computeAge` consolidated to use existing `$lib/utils/age.ts`
- [ ] All pages import from shared utils instead of local definitions

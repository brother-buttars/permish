---
id: TODO-009
title: "Replace console.error with toastError on data loading failures"
status: completed
created: 2026-03-22
updated: 2026-04-24
priority: high
tags:
  - ux
  - frontend
---

# Replace console.error with toastError on data loading failures

## Description

5+ planner pages silently log errors to console when data loading fails, leaving users with blank pages and no feedback.

## Acceptance criteria

- [x] All `console.error` catch blocks in page components also call `toastError()`
- [x] ZIP download failures show a toast

## Resolution (2026-04-24)

Added `toastError` calls alongside the existing `console.error` calls in:
- `event/[id]/+page.svelte` — toggle activity, ZIP download
- `event/[id]/submissions/+page.svelte` — load event, ZIP download
- `create/+page.svelte` — attachment upload (also imported `toastError`)
- `event/[id]/edit/+page.svelte` — attachment upload

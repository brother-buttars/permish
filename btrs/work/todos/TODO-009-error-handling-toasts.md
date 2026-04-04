---
id: TODO-009
title: "Replace console.error with toastError on data loading failures"
status: pending
created: 2026-03-22
updated: 2026-03-22
priority: high
tags:
  - ux
  - frontend
---

# Replace console.error with toastError on data loading failures

## Description

5+ planner pages silently log errors to console when data loading fails, leaving users with blank pages and no feedback.

## Acceptance criteria

- [ ] All `console.error` catch blocks in page components also call `toastError()`
- [ ] ZIP download failures show a toast

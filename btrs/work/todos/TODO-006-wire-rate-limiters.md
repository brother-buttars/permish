---
id: TODO-006
title: "Wire up submitLimiter and formLoadLimiter"
status: completed
created: 2026-03-22
updated: 2026-04-24
priority: high
tags:
  - security
  - backend
---

# Wire up submitLimiter and formLoadLimiter

## Description

`submitLimiter` and `formLoadLimiter` are defined in `rateLimiter.js` but never applied to any route. The public form submission and load endpoints have zero rate limiting.

## Acceptance criteria

- [x] `submitLimiter` applied to `POST /:id/submit` in form routes
- [x] `formLoadLimiter` applied to `GET /:id/form` in form routes

## Resolution (2026-04-24)

Already wired in commit `0096a27` ("feat: add rate limiting for public endpoints") prior to this todo being captured. Confirmed at `backend/src/routes/form.js:23` (`formLoadLimiter`) and `:58` (`submitLimiter`).

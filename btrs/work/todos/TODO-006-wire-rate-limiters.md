---
id: TODO-006
title: "Wire up submitLimiter and formLoadLimiter"
status: pending
created: 2026-03-22
updated: 2026-03-22
priority: high
tags:
  - security
  - backend
---

# Wire up submitLimiter and formLoadLimiter

## Description

`submitLimiter` and `formLoadLimiter` are defined in `rateLimiter.js` but never applied to any route. The public form submission and load endpoints have zero rate limiting.

## Acceptance criteria

- [ ] `submitLimiter` applied to `POST /:id/submit` in form routes
- [ ] `formLoadLimiter` applied to `GET /:id/form` in form routes

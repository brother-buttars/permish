---
id: TODO-005
title: "Add production JWT secret safety check"
status: pending
created: 2026-03-22
updated: 2026-03-22
priority: critical
tags:
  - security
  - backend
---

# Add production JWT secret safety check

## Description

`backend/src/config.js:5` falls back to `'dev-secret-change-me'` when `JWT_SECRET` is unset. No runtime check prevents this default from being used in production, allowing token forgery.

## Acceptance criteria

- [ ] Backend throws on startup if `NODE_ENV=production` and `JWT_SECRET` is missing or equals the default

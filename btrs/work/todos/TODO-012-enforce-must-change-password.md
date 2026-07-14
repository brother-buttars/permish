---
id: TODO-012
title: "Enforce must_change_password + random bootstrap credentials"
status: completed
created: 2026-07-14
updated: 2026-07-14
priority: critical
tags:
  - security
  - backend
---

# Enforce must_change_password + random bootstrap credentials

## Description

`server/src/db.ts:38-42` bootstraps the super admin as `jesus@permish.app / childofgod` with `must_change_password = 1`, but no middleware enforces the flag — it is only echoed to the frontend (`auth.ts:62,77`). Every API route works with the flag set, so any deployment whose operator hasn't rotated the password is fully compromisable with credentials readable from the repo. Super role exposes all children's medical data and signatures.

Found by 2026-07-14 Fable audit ([[evidence/reviews/2026-07-14-fable-full-audit]]), verified in code.

## Acceptance criteria

- [ ] Bootstrap password is randomly generated (printed once to console) or required via `ADMIN_BOOTSTRAP_PASSWORD` env — no hardcoded default
- [ ] When `must_change_password = 1`, all routes except `/auth/setup-credentials`, `/auth/me`, `/auth/logout` return 403
- [ ] `PUT /auth/setup-credentials` is restricted to users with `must_change_password = 1` (or requires the current password) and validates the email (see TODO-017)
- [ ] Tests cover the 403 gate and the setup-credentials flow

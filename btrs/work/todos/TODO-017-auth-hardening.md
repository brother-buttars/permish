---
id: TODO-017
title: "Auth hardening: setup-credentials takeover, stale JWT claims, rate-limit keys, reset-token logging"
status: completed
created: 2026-07-14
updated: 2026-07-14
priority: high
tags:
  - security
  - backend
  - auth
---

# Auth hardening

## Description

Verified server auth gaps from the 2026-07-14 Fable audit ([[evidence/reviews/2026-07-14-fable-full-audit]]):

1. **`PUT /auth/setup-credentials`** (`auth.ts:123-141`) lets any authenticated cookie rotate email+password with no current-password check, no `must_change_password` gate, no `validateEmail` — transient session compromise becomes permanent takeover. (Gate ties into TODO-012.)
2. **Stale JWT claims** — `lib/auth.ts` never re-checks the DB; demoted/deleted users keep their role up to 24h; deleted users cause FK 500s on writes.
3. **Rate-limit keys trust `x-forwarded-for`** (`rateLimit.ts:9-15`) — spoofable when the server is reached directly → unlimited login/register brute force; Map entries never evict.
4. **Password-reset tokens logged to stdout** (`auth.ts:160-172`); route unthrottled; `password_reset_tokens` rows never purged.
5. Minor: email never normalized (case/trim) at register/login; login timing oracle (skip bcrypt on unknown email); register duplicate race → 500 instead of 409.

## Acceptance criteria

- [ ] setup-credentials restricted (first-login only or current-password required) + email validated
- [ ] User row re-verified per request (or token-version claim); deleted/demoted users lose access immediately
- [ ] Rate-limit key from socket address unless behind configured trusted proxy; expired entries swept
- [ ] Reset-token logging gated off in production; forgot-password rate-limited; expired tokens purged
- [ ] Emails lowercased+trimmed at register/login/invite; dummy bcrypt compare on unknown email
- [ ] Tests for each closed hole

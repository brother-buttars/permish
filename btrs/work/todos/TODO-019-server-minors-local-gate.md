---
id: TODO-019
title: "Fable audit wave 4: cross-cutting server minors + local-mode is_active gate"
status: completed
created: 2026-07-14
updated: 2026-07-14
priority: medium
tags:
  - backend
  - security
  - offline
---

# Fable audit wave 4 — cross-cutting minors

## Description

The remaining verified findings from the 2026-07-14 Fable audit's "Minor (selected cross-cutting)" section ([[evidence/reviews/2026-07-14-fable-full-audit]]) that were never tracked in a TODO:

1. **No global `app.onError`/`notFound`** — uncaught route errors return Hono's plain-text default, breaking the `{error}` JSON contract clients parse; unknown API paths return text 404.
2. **No `X-Content-Type-Options`** (or any security headers) on API responses.
3. **Attachment upload trusts the client** — MIME allowlist checks `file.type` (client-controlled), and the whole multipart body is parsed before any size check; no magic-byte validation.
4. **Admin password reset unaudited** — `PUT /admin/users/:id/password` is the only admin mutation without an `audit.record` call.
5. **Local `getFormEvent` ignores `is_active`** — in local/hybrid mode, deactivated activities still load and accept submissions offline (server correctly 410s).

Not actioned (documented decisions):
- Styling-agent minor inventory (raw toast palette, PopoverMenu duplication, focus rings, header spacing) — the full report wasn't persisted; PopoverMenu appears 2× (under the 3× rule); toast palette matches the AlertBox precedent. Re-raise with specifics if it grates.
- Broad status-code normalization across routes — global handlers fix the error-shape contract; per-route code churn deferred.

## Acceptance criteria

- [x] Uncaught errors → 500 `{error}` JSON (logged server-side); unknown routes → 404 `{error}` JSON (`app.onError`/`app.notFound`)
- [x] `X-Content-Type-Options: nosniff` + `X-Frame-Options: DENY` + `Referrer-Policy: no-referrer` on all responses (incl. errors)
- [x] Attachment upload: Content-Length pre-check (413 before parsing) + magic-byte validation for every allowlisted type (400 on mismatch, incl. NUL-check for text/plain)
- [x] Admin password reset writes `user.password_reset` audit row
- [x] Local `getFormEvent`/`submit` throw "no longer accepting submissions" for inactive events
- [x] Server 46/46 (`hardening.test.ts`, 9 new), frontend 184/184 (1 new), svelte-check 0 errors, build + drift guards pass

## Links

- [[evidence/reviews/2026-07-14-fable-full-audit]]
- Branch: `fix/fable-audit-3`

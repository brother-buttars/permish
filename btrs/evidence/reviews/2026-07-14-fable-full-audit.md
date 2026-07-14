---
title: "Full Codebase Audit (Fable) — Consolidated"
created: 2026-07-14
updated: 2026-07-14
tags:
  - review
  - security
  - frontend
  - backend
  - styling
  - ux
  - sync
---

# Full Codebase Audit — 2026-07-14 (Fable)

Follow-up to the 2026-03-29 Opus audits ([[evidence/reviews/2026-03-29-full-code-review|full code review]], [[evidence/reviews/2026-03-29-ui-ux-audit|UI/UX audit]]), which predate the single-backend consolidation and Tauri cleanup. Four parallel auditors (styling/CSS, frontend logic & leaks, server, UX flows) grounded in `btrs/knowledge/conventions/`. All Critical findings and the top Major findings were independently re-verified in the working tree (branch `main`, clean) by the orchestrator before inclusion.

## Summary

The codebase is in good structural shape — zero Svelte 4 syntax, parameterized SQL throughout, consistent toasts/ConfirmModal, solid backup crypto, correct route mounting order. The serious problems cluster in three places the earlier audits missed: **(1) the offline/hybrid sync layer is broken in ways that silently lose or duplicate data**, **(2) several server authorization gaps expose children's PII and allow account takeover from a transient session**, and **(3) the parent-facing form can be submitted with no signatures and loses work on refresh**.

## Issue counts

| Domain | Critical | Major | Minor |
|--------|----------|-------|-------|
| Server (routes/lib/services) | 1 | 8 | ~20 |
| Frontend data layer / sync | 4 | 10 | ~10 |
| UX flows / accessibility | 0 | 17 | ~27 |
| Styling / atomic design | 0 | 12 | ~25 |

---

## Findings

### Critical (verified in code by orchestrator)

1. **Bootstrap super-admin password is never forced to rotate** — `server/src/db.ts:38-42` creates `jesus@permish.app / childofgod` with `must_change_password = 1`, but no middleware enforces the flag (grep-confirmed: it is only echoed to the frontend at `auth.ts:62,77` and cleared at `:135`). Any internet-exposed deployment whose operator hasn't rotated it is fully compromisable — super role exposes all children's medical data and signatures. **Fix:** random bootstrap password (printed once / env-provided) + server-side gate: when `must_change_password=1`, reject everything except `/auth/setup-credentials`, `/auth/me`, `/auth/logout`.

2. **Local DB `close()` discards pending writes** — `frontend/src/lib/data/local/database.ts:131-139` cancels the debounced IndexedDB persist and falls back to `persistSync()`, which writes localStorage key `permish_local_db_backup` that **nothing ever reads** (grep-confirmed single reference). The Online→Local/Hybrid migration path (`routes/account/data/+page.svelte`) can lose the entire pulled dataset while toasting success. **Fix:** `close()` must await a real `persist()`; delete the dead localStorage fallback. Related: `flush()` exists but is never called — no `pagehide`/`visibilitychange` handler anywhere, so up to 1s of writes (e.g. a just-submitted form in local mode) is lost on tab close.

3. **Hybrid create → permanent duplicates and orphaned changes** — server create routes always mint fresh ids (`events.ts:82`, verified) and ignore client ids; the local row keeps its own uuid. Next pull inserts the server copy as a second row; queued updates/deletes against the local id 404 remotely, burn 5 retries, land in "failed changes" forever. **Fix:** accept client-supplied UUIDs on create routes (include `id` in the queued payload) or map local→remote ids after create.

4. **Group mutations silently dropped by sync** — `sync/manager.ts` `replayChange()` handles only `events`/`child_profiles`/`submissions`/`users` (verified at :149-178); the `default:` case warns and returns normally, so queued `groups`/`group_members`/`group_invites` changes are marked `synced_at` without ever reaching the server. Green sync dot, permanently diverged data. **Fix:** add group cases; make unknown collections throw.

5. **`pending_changes` CHECK constraint rejects two queued operations** — generated schema allows `('create','update','delete')` (`schema.generated.ts:185`, verified) but hybrid queues `'delete-permanent'` and `'reassign'` (`hybrid.ts:83,88`). The insert throws *after* the local mutation ran: locally deleted event, sync never happens, event resurrects on next pull. **Fix:** extend the enum in `shared/schema.ts`, `bun run gen:schema`.

### Major — server & security (top items verified)

- **Group members can harvest children's PII** — `events.ts:359` `GET /:id/submissions` uses `accessibleEvent(c, id)` without `adminOnly` (verified: the member JOIN has no role clause), returning every child's name, DOB, emergency contact to any parent who joined the group via the shared invite code. Fix: `adminOnly = true`, mirroring `submissions.ts` `canAccess`.
- **`PUT /auth/setup-credentials` = session-to-permanent takeover** — verified at `auth.ts:123-141`: any authenticated cookie may rotate email+password with no current-password check, no `must_change_password` gate, no `validateEmail`. Fix: restrict to `must_change_password=1` users or require current password.
- **Stale JWT claims for up to 24h** — `lib/auth.ts` never re-checks the DB; demoted/deleted users keep their role for the token lifetime; deleted users cause FK 500s. Fix: re-verify user row (at least for super routes) or token-version claim.
- **`PUT /api/submissions/:id` has zero validation, wholesale-overwrite** — `PUT {}` → NOT NULL violation → 500; partial body NULLs omitted fields on a signed medical form; no signature size cap (submit route caps at 700KB). Fix: apply submit-route validation.
- **Public submit 500s on bad input** — `participant_dob` never validated (`computeAge('garbage')` → NaN → SQLite error → 500); `participant_signature_type` presence-checked only (CHECK violation → 500). `validateDate` exists in `lib/validate.ts` and is imported by **no route**. Fix: wire it up, validate the enum.
- **Rate-limit keys trust spoofable `x-forwarded-for`** (`rateLimit.ts:9-15`) → unlimited brute force when the server is reached directly; entries never evict → unbounded Map growth. Fix: socket address unless behind configured proxy; periodic sweep.
- **Password-reset tokens logged to stdout; route unthrottled** (`auth.ts:160-172`); token rows never purged. Fix: gate log on non-production, add limiter, purge expired.
- **Invite codes are 32 bits and `/api/groups/join` is unthrottled** — brute-forceable; success grants the PII exposure above. Fix: rate-limit + lengthen codes.

### Major — frontend data layer

- **`events.group_id` dropped in the entire local path** (adapter INSERT/UPDATE, sync columns, migration pull) → parent dashboard "Upcoming Activities" permanently empty in local/hybrid mode.
- **sql.js WASM loaded from `https://sql.js.org` CDN** — "offline-first" mode needs internet at boot; failure rejects `initRepository()` and blanks the whole app. Fix: bundle via `?url` import.
- **Pull only fetches `submissions.getMine()`** — event owners in hybrid mode see 0 submissions to their own events.
- **Hybrid never queues `auth.updateProfile`** (guardian signature/phone) — dead `users` replay case proves intent; wrap it.
- **Object-URL leak + stale-response race** in `usePdfPreview`/`useAttachmentPreview` + their two inline clones — close-while-loading orphans a PDF-sized blob per preview; no request token.
- **`attachments.getUrl()` returns `''` on first call** (local adapter) — consumers `fetch('')` → the page's own HTML rendered as a "PDF". First-time preview/download broken in local/hybrid mode.
- **`useAuthRequired` `onReady` errors unhandled** — transient load failure renders misleading empty states ("You haven't created any activities yet") on every page using it, no retry affordance. (Cross-reported by UX audit.)
- **Hybrid→online switch abandons pending changes** — `sync()` never rejects; no pending-count re-check before `setDataMode('online')`.
- **PdfViewer never `destroy()`s pdf.js documents**; `src` changes ignored; failed load shows "Loading PDF..." forever.

### Major — UX (parent money path first; top items verified)

- **Unsigned submissions validate successfully** — verified: `submissionForm.ts` defaults both signature types to `'hand'` and `validateSubmissionForm` skips signature checks when type is `'hand'`. A parent who never reaches the Signatures section submits a blank-signature medical release. Fix: require an explicit "sign on paper" choice.
- **Form progress bar invisible** — verified: `FormProgress` is `sticky top-0 z-30`, AppHeader is `sticky top-0 z-40 h-16` — the money path's wayfinding sits behind the header once scrolled. Fix: `top-16`.
- **Refresh/tab-close loses the whole parent form** — dirty guard is `beforeNavigate` only; no `beforeunload`, no draft persistence.
- **Server-side submit failure is invisible** — error summary renders at top, user is at the bottom sticky button; `scrollIntoView` only fires on client validation.
- **Invite → login redirect is dead code** — verified: invite page does `goto('/login?next=…')` but login only reads localStorage `permish_return_url`; register honors nothing. Group onboarding links are dropped.
- **`useAuthRequired` deep-link loss** — unauthenticated visits to `/event/x` land on `/dashboard` after login.
- **ListCard is keyboard-inaccessible** — plain `<div>` with `onclick`, no role/tabindex/keydown; primary navigation on dashboard/events/groups.
- **`Modal` molecule has no focus trap/restore** (PdfModal has the model implementation); mobile nav Sheet has no Escape/trap/dialog semantics.
- **GroupCombobox options select on `mousedown` only** + 150ms blur-close → keyboard users can never pick a group; no combobox ARIA.
- **Edit form (`form/[id]/edit/[submissionId]`)**: no dirty guard at all, and success always routes to the planner page `/event/[id]` even for parents.
- `window.confirm()` in `beforeNavigate` (convention violation), prefill falsely marks the form dirty, SignaturePad canvas not resize-aware (rotation → offset strokes) and mode-switch wipes a drawn signature, role-change dropdown escalates to super with no confirmation, 28px tap targets next to Delete on mobile submission cards, SignaturePad/segmented controls lack ARIA state.

### Major — styling / atomic design

- `event/[id]/submissions/+page.svelte` — five violations in one page (verified: inline header, raw `<input>` with copied atom classes, inline filter Card, hand-rolled delete/PDF modal state, third copy of the SubmissionListView pattern with drifted columns, inline empty state).
- Inline modal overlay in `event/[id]/+page.svelte:382-413` (Reassign Owner) instead of `Modal` — also flagged independently by the logic audit.
- The forbidden segmented-tab override string is inlined in **three route layouts** (`account`, `admin`, `groups/[id]`) and **four times** in `SignaturePad` (verified) — `SegmentedTabs` exists; needs an href/onchange mode.
- `groups/+page.svelte` imports `ListCard` and hand-rolls the card row anyway (verified).
- Amber warning box triplicated and diverging from `AlertBox variant="warning"` — two competing warning styles.
- Raw `<select>` recreating the `Select` atom in 4 spots, two with **no focus styles**.
- Dashboard "My Submissions" is the third hand-rolled copy of `SubmissionListView`.
- `FormField` molecule is registered but used by **zero** pages; the label+input+error triplet is inlined 22×.
- Full inventory of Minor styling items (raw palette in toasts/banners, `cn()` bypasses, missing focus-visible rings, PopoverMenu duplication, header spacing drift) in the styling agent report.

### Minor (selected cross-cutting)

- No global `app.onError`/`notFound` → uncaught errors return text, breaking the `{error}` JSON contract.
- Status-code and error-shape inconsistencies across routes; audit-log coverage inconsistent (admin password reset unaudited).
- Email never normalized (case/trim) at register/login; login timing oracle (no dummy bcrypt compare).
- Attachment upload buffers whole body pre-check; MIME allowlist trusts client `file.type`; no `X-Content-Type-Options`.
- Local `getFormEvent` ignores `is_active` — deactivated activities accept submissions offline.
- "Activity" tab on group detail is the audit log, colliding with "Activities" = events everywhere else.
- Terminology, copy-splice errors on invite page, anonymous success-page copy over-promises PDF access after login.

## Convention compliance

- [PASS] Svelte 5 runes only — zero `export let` / `$:` across 105 files.
- [PASS] No `<style>` blocks, no `@apply` outside `app.css`; dark-mode variants present everywhere.
- [PASS] Repository pattern — zero `$lib/api` imports; only sanctioned raw `fetch()`es.
- [PASS] Route mounting order in `app.ts` matches the documented constraint.
- [PASS] `crypto.randomUUID()` everywhere; no `uuid` package.
- [FAIL] Modal molecule adoption — 1 inline overlay (event/[id]), duplicated attachment-preview modal.
- [FAIL] Composable adoption — delete-confirm/PDF-preview state hand-rolled in 4 older pages.
- [FAIL] `ConfirmModal` universality — one `window.confirm()` in `form/[id]` beforeNavigate.
- [FAIL] 3× rule — segmented tabs (3 layouts + SignaturePad×4), amber warning box (3×), submission list (3×), raw selects (4×).
- [FAIL] `formatDate()` universality — `toLocaleString()` on invite page.

## Security

- [PASS] SQL injection — all queries parameterized, dynamic `IN` lists placeholder-built.
- [PASS] Cookie hygiene — HttpOnly, SameSite=Strict, secure in prod, default-secret guard.
- [FAIL] `must_change_password` unenforced (Critical #1).
- [FAIL] Ownership check on `GET /events/:id/submissions` (PII exposure).
- [FAIL] `setup-credentials` takeover path; stale JWT claims.
- [FAIL] Rate limiting — spoofable keys, unthrottled join/forgot-password, unbounded maps.
- [FAIL] Reset tokens in logs.

## Test coverage

Well covered: events CRUD, public form happy path, profiles, group create/invite basics, schema drift guard, PDF fill, data-layer adapter/sync/backup tests.
Untested (full list in server agent report): all of auth beyond register/login/me (logout, profile, setup-credentials, password, forgot/reset), all submission access-control branches, most group mutations (join, roles, regenerate-invite, last-admin guard), all admin endpoints beyond stats/delete, invite expiry/revocation branches, attachments.

## Recommendations (priority order)

1. **Ship the server security fixes** (TODO-012, TODO-015, TODO-017): enforce `must_change_password`, close the submissions-PII and setup-credentials holes, fix rate-limit keying, stop logging reset tokens.
2. **Fix or fence the hybrid mode** (TODO-014): the five sync defects mean hybrid silently loses/duplicates data today; either fix id mapping + replay coverage + CHECK enum, or disable hybrid mode in the UI until fixed.
3. **Fix local-mode durability** (TODO-013): `close()` persist, unload flush, bundle the WASM.
4. **Fix the parent form** (TODO-016): signature default, progress-bar z-index, draft persistence, submit-failure visibility, invite/deep-link redirects.
5. Burn down the atomic-design debt in the 4 legacy pages (event/[id]/submissions is the template offender) and add the missing focus/a11y basics (ListCard keyboard access, Modal focus trap).
6. Add tests for the untested auth/group/admin branches — every security fix above should land with one.

## Agent reports

Full unabridged findings are preserved in the four auditor reports (server, data-layer/leaks, UX, styling) delivered in-session on 2026-07-14; this file is the deduplicated consolidation.

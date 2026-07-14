---
title: Active Work Status
updated: 2026-07-14
---

# Active Work

## Current
_None._

## Blocked
_Nothing blocked._

## Known gaps
_None — the 2026-07-14 Fable audit is fully closed (waves 1–3)._

## Recently Completed
- **Fable audit fixes, wave 3 — Minor styling/refactor backlog (audit closed)** (2026-07-14, branch `fix/fable-audit-3`, TODO-018) — segmented tabs, warning boxes, raw selects, submission lists, and form fields all converged onto their registered components (SegmentedTabs gained nav mode; AlertBox a children snippet; SubmissionListView age/phone columns; FormField adopted at all 22 sites); SignaturePad drawing survives resize and mode switches; mobile Sheet has Escape/focus trap/dialog semantics; tap targets fixed; "Activity" tab → "History"; invite/success copy corrected. Frontend 183/183, svelte-check clean, build + drift guards pass. See [[changelog/2026-07-14]].
- **Fable audit fixes, wave 2 — major UX/a11y/leak findings** (2026-07-14, branch `fix/fable-audit-2`) — preview blob-URL leaks + races fixed and composables adopted in the 2 clone pages; local-mode attachment previews un-broken (async getUrl); pdf.js document lifecycle; misleading empty states replaced with error + retry; deep-link/invite `?next=` redirects through login/register; ListCard keyboard access; Modal focus trap/restore; combobox keyboard + ARIA; SignaturePad ARIA; admin role-change confirmation. Frontend 179/179, server 37/37, svelte-check clean. See [[changelog/2026-07-14]].
- **Fable audit fixes — TODO-012…017 all closed** (2026-07-14, branch `fix/fable-audit`) — all 5 criticals + top majors fixed: must_change_password enforcement + random bootstrap password, submissions PII authz, auth hardening (setup-credentials, DB-backed middleware, rate-limit keys, reset tokens, email normalization), hybrid sync correctness (client UUIDs, group replay, CHECK enum v7 migration, owned-submission pull), local DB durability (close()/unload persist, bundled WASM), parent-form integrity (no unsigned submissions, draft persistence, visible progress bar). Server 37/37, frontend 179/179, svelte-check clean. See [[changelog/2026-07-14]].
- **Full codebase audit — Fable pass** (2026-07-14) — 4 parallel auditors over ~22.5k LOC, findings verified in code: 5 critical (offline/hybrid data-loss cluster + unenforced bootstrap password), ~47 major across security/sync/UX/styling. Consolidated in [[evidence/reviews/2026-07-14-fable-full-audit]]; opened TODO-012…017.
- **Tauri desktop sidecar removed (build un-broken)** (2026-07-13) — The desktop/mobile app is self-contained (native SQLite via plugin-sql + client-side pdf-lib), so the dead PocketBase + Node sidecar wiring was removed rather than migrated: stripped `main.rs`, dropped `reqwest` + sidecar `externalBin`/CSP/shell permissions, deleted the `sidecars/` dir (95 MB of dead binaries). Was panicking at startup on the missing binary; now `cargo check` passes clean. See [[changelog/2026-07-13]].
- **Docs + dead-code cleanup after single-backend consolidation** (2026-07-13) — Removed obsolete PocketBase scripts/lockfile, rewrote `docs/` + 12 `docs-site/` pages + btrs living docs (code-map, conventions, project-map) to the Bun+Hono backend, fixed stale sync-layer comments. `bun test` green (17/17, schema guard passes). See [[changelog/2026-07-13]].
- **TODO backlog sweep** (2026-04-24) — Closed all 8 outstanding todos (TODO-004, 005, 006, 007, 008, 009, 010, 011). JWT default-value guard + tests, PdfModal focus trap, error toasts on 4 pages, Docker healthcheck fix, unused dep removal, utility dedup, backup script.
- **Production hardening** (2026-04-05) — Health checks, CORS fixes, Caddy HTTPS setup.
- **PocketBase migration — all 9 phases** (2026-04-04/05) — Full architecture migration: repository pattern, PocketBase adapter, Node sidecar, Docker Compose, Tauri desktop, offline-first SQLite, sync manager, encrypted backup, Capacitor mobile, data migration script. 8 commits, ~6500 lines added.
- **Medical preset pickers** (2026-04-01) — Added toggleable pill presets for allergies, dietary needs, and chronic conditions on the permission form.
- **Full code review** (2026-03-29) — 5-agent audit: security, backend, frontend, database, testing. 87 issues found (1 critical, 20 high).

---
title: Active Work Status
updated: 2026-07-13
---

# Active Work

## Current
_None._

## Blocked
_Nothing blocked._

## Known gaps
_None._

## Recently Completed
- **Tauri desktop sidecar removed (build un-broken)** (2026-07-13) — The desktop/mobile app is self-contained (native SQLite via plugin-sql + client-side pdf-lib), so the dead PocketBase + Node sidecar wiring was removed rather than migrated: stripped `main.rs`, dropped `reqwest` + sidecar `externalBin`/CSP/shell permissions, deleted the `sidecars/` dir (95 MB of dead binaries). Was panicking at startup on the missing binary; now `cargo check` passes clean. See [[changelog/2026-07-13]].
- **Docs + dead-code cleanup after single-backend consolidation** (2026-07-13) — Removed obsolete PocketBase scripts/lockfile, rewrote `docs/` + 12 `docs-site/` pages + btrs living docs (code-map, conventions, project-map) to the Bun+Hono backend, fixed stale sync-layer comments. `bun test` green (17/17, schema guard passes). See [[changelog/2026-07-13]].
- **TODO backlog sweep** (2026-04-24) — Closed all 8 outstanding todos (TODO-004, 005, 006, 007, 008, 009, 010, 011). JWT default-value guard + tests, PdfModal focus trap, error toasts on 4 pages, Docker healthcheck fix, unused dep removal, utility dedup, backup script.
- **Production hardening** (2026-04-05) — Health checks, CORS fixes, Caddy HTTPS setup.
- **PocketBase migration — all 9 phases** (2026-04-04/05) — Full architecture migration: repository pattern, PocketBase adapter, Node sidecar, Docker Compose, Tauri desktop, offline-first SQLite, sync manager, encrypted backup, Capacitor mobile, data migration script. 8 commits, ~6500 lines added.
- **Medical preset pickers** (2026-04-01) — Added toggleable pill presets for allergies, dietary needs, and chronic conditions on the permission form.
- **Full code review** (2026-03-29) — 5-agent audit: security, backend, frontend, database, testing. 87 issues found (1 critical, 20 high).

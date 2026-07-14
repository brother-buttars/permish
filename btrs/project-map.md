---
title: "Project map"
created: 2026-03-22
updated: 2026-03-22
tags:
  - architecture
  - index
---

# Project map

Overview of agent ownership and file scopes for **permish**.

## Stack summary

| Aspect | Value |
|--------|-------|
| Framework | SvelteKit 2 + Bun/Hono |
| Language | TypeScript (frontend and backend) |
| Component library | shadcn-svelte (hand-built, Svelte 5 runes) |
| Styling | Tailwind CSS v4 (oklch theme) |
| Data layer | Repository pattern with adapters (HTTP, local SQLite, hybrid) |
| Desktop | Tauri v2 (self-contained: native SQLite via @tauri-apps/plugin-sql + client-side PDF; no sidecar) |
| Mobile | Tauri v2 (iOS/Android) — native SQLite via @tauri-apps/plugin-sql |
| Offline | sql.js (WASM) + IndexedDB persistence + SyncManager |
| Test framework | bun test (server) + Vitest (frontend) |
| State management | Svelte stores (writable) |
| Package manager | pnpm |
| Monorepo | No (server/, frontend/, shared/, scripts/) |

## Agent scopes

### btrs-web-engineer
- **primary**: `frontend/src/routes/**`, `frontend/src/lib/components/*.svelte`
- **shared**: `frontend/src/lib/utils/**`, `frontend/src/lib/stores/**`, `frontend/src/lib/data/**`
- **tests**: `frontend/**/*.test.ts` (Vitest)

### btrs-ui-engineer
- **primary**: `frontend/src/lib/components/ui/**`
- **shared**: `frontend/src/lib/utils.ts`, `frontend/src/app.css`

### btrs-api-engineer
- **primary**: `server/src/routes/**`, `server/src/app.ts`, `server/src/index.ts`
- **shared**: `server/src/lib/**`, `server/src/config.ts`
- **tests**: `server/test/**`

### btrs-database-engineer
- **primary**: `server/src/db.ts`, `shared/schema.ts` (run `bun run gen:schema`)
- **shared**: `server/src/config.ts`
- **tests**: `server/test/schema.test.ts`

### btrs-qa-test-engineering
- **primary**: `server/test/**`
- **shared**: `server/src/**` (read access)

### btrs-container-ops
- **primary**: `docker-compose.yml`

### btrs-code-security
- **primary**: all source code (read access), `server/src/lib/auth.ts`, `server/src/lib/rateLimit.ts`

### btrs-documentation
- **primary**: `CLAUDE.md`, `README.md`

### btrs-desktop-engineer
- **primary**: `frontend/src-tauri/**`
- **shared**: `frontend/src/lib/utils/platform.ts`

### btrs-mobile-engineer
- **primary**: `frontend/src-tauri/**` (Tauri iOS/Android)
- **shared**: `frontend/src/lib/utils/platform.ts`

### Shared paths
- `frontend/src/lib/data/**` -- repository pattern, adapters, sync, backup
- `frontend/src/lib/utils/**` -- shared utilities
- `frontend/src/lib/stores/**` -- shared state
- `server/src/config.ts` -- environment config
- `server/src/services/**` -- email, SMS, PDF services
- `server/src/**` -- Bun + Hono server (routes, lib, services, app.ts, db.ts)
- `shared/schema.ts` -- single-source data model (run `bun run gen:schema`)
- `scripts/**` -- migration and utility scripts

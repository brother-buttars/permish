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
| Framework | SvelteKit 2 + Express 5 / PocketBase |
| Language | TypeScript (frontend) / JavaScript (backend) |
| Component library | shadcn-svelte (hand-built, Svelte 5 runes) |
| Styling | Tailwind CSS v4 (oklch theme) |
| Data layer | Repository pattern with adapters (Express, PocketBase, local SQLite, hybrid) |
| Desktop | Tauri v2 with PocketBase + Node sidecar |
| Mobile | Capacitor (iOS/Android) with @capacitor-community/sqlite |
| Offline | sql.js (WASM) + IndexedDB persistence + SyncManager |
| Test framework | Jest + supertest |
| State management | Svelte stores (writable) |
| Package manager | pnpm |
| Monorepo | No (frontend/, backend/, sidecar/, scripts/) |

## Agent scopes

### btrs-web-engineer
- **primary**: `frontend/src/routes/**`, `frontend/src/lib/components/*.svelte`
- **shared**: `frontend/src/lib/utils/**`, `frontend/src/lib/stores/**`, `frontend/src/lib/api.ts`
- **tests**: none (no frontend tests yet)

### btrs-ui-engineer
- **primary**: `frontend/src/lib/components/ui/**`
- **shared**: `frontend/src/lib/utils.ts`, `frontend/src/app.css`

### btrs-api-engineer
- **primary**: `backend/src/routes/**`, `backend/src/index.js`
- **shared**: `backend/src/middleware/**`, `backend/src/config.js`
- **tests**: `backend/tests/**`

### btrs-database-engineer
- **primary**: `backend/src/db/**`
- **shared**: `backend/src/config.js`
- **tests**: `backend/tests/db.test.js`

### btrs-qa-test-engineering
- **primary**: `backend/tests/**`
- **shared**: `backend/src/**` (read access)

### btrs-container-ops
- **primary**: `docker-compose.yml`

### btrs-code-security
- **primary**: all source code (read access), `backend/src/middleware/auth.js`, `backend/src/middleware/rateLimiter.js`

### btrs-documentation
- **primary**: `CLAUDE.md`, `README.md`

### btrs-desktop-engineer
- **primary**: `frontend/src-tauri/**`
- **shared**: `frontend/src/lib/utils/platform.ts`

### btrs-mobile-engineer
- **primary**: `frontend/capacitor.config.ts`, `frontend/src/lib/data/local/capacitor-driver.ts`
- **shared**: `frontend/src/lib/utils/platform.ts`

### Shared paths
- `frontend/src/lib/data/**` -- repository pattern, adapters, sync, backup
- `frontend/src/lib/utils/**` -- shared utilities
- `frontend/src/lib/stores/**` -- shared state
- `backend/src/config.js` -- environment config
- `backend/src/services/**` -- email, SMS, PDF services
- `sidecar/src/**` -- PDF/email/SMS sidecar for PocketBase mode
- `pb_migrations/**` -- PocketBase schema
- `scripts/**` -- migration and utility scripts

---
id: TODO-013
title: "Local DB durability: close() data loss, no unload flush, CDN WASM"
status: completed
created: 2026-07-14
updated: 2026-07-14
priority: critical
tags:
  - data-layer
  - offline
  - frontend
---

# Local DB durability: close() data loss, no unload flush, CDN WASM

## Description

Three verified defects make local/offline mode lossy ([[evidence/reviews/2026-07-14-fable-full-audit]]):

1. `SqlJsDatabase.close()` (`frontend/src/lib/data/local/database.ts:131-139`) cancels the pending debounced IndexedDB persist and calls `persistSync()`, which writes localStorage key `permish_local_db_backup` — a key **nothing ever reads**. The Online→Local/Hybrid migration (`routes/account/data/+page.svelte:70`) can lose the entire pulled dataset while toasting success.
2. `flush()` exists but is never called; there is no `pagehide`/`visibilitychange` handler, so up to 1s of writes (e.g. a just-submitted permission form in local mode) is lost on tab close.
3. sql.js WASM loads from `https://sql.js.org/dist/` — "offline-first" mode requires internet at boot; a failed fetch rejects `initRepository()` and the whole app fails to render.

## Acceptance criteria

- [ ] `close()` awaits a real IndexedDB persist; dead localStorage fallback removed
- [ ] `pagehide`/`visibilitychange` handler flushes the local DB
- [ ] WASM bundled locally (`sql.js/dist/sql-wasm.wasm?url`) instead of CDN
- [ ] `stmt.free()` moved into `finally` in `execute()`/`query()` (leak on throwing statements)

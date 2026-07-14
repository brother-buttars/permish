---
id: ADR-006
title: "Offline sync — adopt cr-sqlite CRDT merge (staged), replacing last-write-wins"
status: proposed
created: 2026-07-13
tags:
  - architecture
  - sync
  - offline
  - crsqlite
---

# Offline sync — cr-sqlite CRDT merge vs the hand-rolled last-write-wins queue

## Context

Permish must work offline on web, desktop, and mobile and sync when reconnecting.
The current hybrid sync (`frontend/src/lib/data/sync/manager.ts`) is a hand-rolled
`pending_changes` queue: each local mutation is queued, and on reconnect the queue
is replayed by calling the remote repository's **full-record** `update()`.

**The flaw:** two devices editing the same record offline **clobber** each other.
If device A renames an event and device B fixes that event's leader phone, both push
their *entire* row on reconnect — whichever syncs last wins completely, silently
discarding the other device's edit. There is no field-level merge.

## The spike (this was actually run)

`spikes/crsqlite/spike.ts` loads cr-sqlite into `bun:sqlite`, makes an `events`
table a CRR (`crsql_as_crr`), and simulates the exact clobber scenario:

1. Both devices synced: `e1 = { event_name: 'Camp', leader_phone: '111' }`.
2. Offline — A: `event_name → 'Summer Camp'`; B: `leader_phone → '999'` (same row).
3. Reconnect: exchange `crsql_changes` changesets both ways.

**Result:** both devices converge on `{ 'Summer Camp', '999' }` — **both edits
survive, no clobber.** (`bun run spike.ts` exits 0.) cr-sqlite does per-column,
causally-ordered last-writer-wins, so concurrent edits to *different* columns merge
automatically; only true same-column conflicts fall back to a deterministic winner.

This is a definitive yes to the plan's Phase 5 question.

## Integration findings (the real cost is the client, not the merge)

1. **Server (`bun:sqlite`):** works, but Bun's bundled SQLite disables extension
   loading. The spike used `Database.setCustomSQLite(<extension-enabled libsqlite3>)`
   and `db.loadExtension('crsqlite.dylib')`. Production ⇒ the server image must ship
   an extension-enabled SQLite + the `crsqlite` native lib for its platform.
2. **Sync engine rewrite:** push/pull stops replaying full-record `update()` calls
   and instead exchanges `crsql_changes` rows keyed on `db_version` / `site_id`. The
   Phase-2 `SYNC` column specs are no longer needed for sync (cr-sqlite tracks changes
   itself), though they stay useful for the initial pull.
3. **Web client (the hard part):** `sql.js` cannot load native extensions. cr-sqlite
   ships `@vlcn.io/crsqlite-wasm` — a *different* WASM SQLite build with cr-sqlite
   compiled in. Adopting it **replaces sql.js** in `local/database.ts` (different API).
4. **Tauri native (desktop + mobile):** `@tauri-apps/plugin-sql` (rusqlite) would need
   cr-sqlite loaded via its Rust crate or a custom build — non-trivial, and the ITAR-free
   but real work of shipping the native lib per target (macOS/Windows/Linux/iOS/Android).

## Options considered

- **A — Adopt cr-sqlite (recommended, staged).** Proven to fix the clobber; keeps the
  "SQLite everywhere" architecture (server `bun:sqlite` ↔ client SQLite), no new backend
  service. Cost: replace sql.js with `crsqlite-wasm` on web, wire Tauri, ship the native
  lib server-side. Merge is symmetric because the same dialect runs on both ends.
- **B — PowerSync / ElectricSQL.** Purpose-built local-first sync with server-owned
  conflict rules. Both are Postgres-oriented — adopting either means adding Postgres and
  a sync service, abandoning the single-Bun-server simplicity Phase 1 just achieved.
- **C — Keep the queue, add field-level merge.** Stopgap: attach `updated_at` per column
  or diff-and-merge on the server. Cheaper short-term but re-implements a worse version of
  what cr-sqlite gives for free, and still risks edge-case data loss.

## Decision (proposed)

**Adopt cr-sqlite (Option A), staged:**

1. **Server + web first.** Load cr-sqlite into the Bun server's SQLite; replace sql.js
   with `@vlcn.io/crsqlite-wasm` on web; rewrite `SyncManager` to exchange `crsql_changes`.
   This covers the highest-traffic surface (web) end-to-end.
2. **Tauri (desktop + mobile) second**, once the web path is proven in production.
3. **Until then**, the Phase-2 single-schema-source work already removed the queue's
   *drift* risk; the *clobber* risk remains for concurrent hybrid editors — acceptable
   short-term because concurrent offline edits of the same record are rare for this app
   (a planner editing one event on two devices at once), but must be called out.

## Consequences

- One coherent local-first data model; conflict-free merge without a new backend service.
- Build/packaging work: extension-enabled SQLite server-side, `crsqlite-wasm` on web,
  native cr-sqlite per Tauri target.
- `SyncManager`'s pull column specs stay (initial hydrate); its push/replay logic is
  replaced by changeset exchange.

## See also

- `spikes/crsqlite/` — the runnable proof (`bun run spike.ts`).
- [[decisions/ADR-003-sqlite-raw-sql]] — SQLite/raw-SQL choice this builds on.

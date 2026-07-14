# cr-sqlite spike (Phase 5)

Proves that cr-sqlite's CRDT merge fixes the "two offline devices edit the same
record" clobber that Permish's current last-write-wins queue suffers.

## Run

```bash
bun install
# Bun blocks the postinstall; fetch the prebuilt native extension manually:
bun node_modules/@vlcn.io/crsqlite/nodejs-install-helper.js   # writes dist/crsqlite.dylib
bun run spike.ts
```

Expected: `✅ MERGED cleanly — both edits survived on both devices (no clobber).`
(exit 0).

## What it shows

Two in-memory `bun:sqlite` "devices" edit **different columns of the same row**
offline, then exchange `crsql_changes` on reconnect and converge — both edits
survive. See `../../btrs/knowledge/decisions/ADR-006-offline-sync-crsqlite.md`
for the analysis, integration findings, and staged-adoption recommendation.

## Notes / gotchas surfaced

- Bun's bundled SQLite disables extension loading → `Database.setCustomSQLite()`
  must point at an extension-enabled libsqlite3 (Homebrew's works locally).
- The web client (`sql.js`) can't load native extensions — production adoption
  needs `@vlcn.io/crsqlite-wasm` instead. That, plus Tauri wiring, is the real cost.

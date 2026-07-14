# Scripts

Utility scripts for Permish.

## `gen-schema.ts` — regenerate the SQLite schema

The data model is defined once in `shared/schema.ts`. Run the generator from the
repo root to regenerate every target's DDL:

```bash
bun run gen:schema   # → bun scripts/gen-schema.ts
```

This writes:

- `server/src/schema.generated.ts` — server DDL (`bun:sqlite`), consumed by `server/src/db.ts`
- `frontend/src/lib/data/local/schema.generated.ts` — local DDL (sql.js), consumed by `local/schema.ts`
- `frontend/src/lib/data/sync/sync-columns.generated.ts` — per-collection sync column specs, consumed by `sync/manager.ts`

**Never edit the `*.generated.ts` files by hand.** A guard test
(`server/test/schema.test.ts`) fails if the committed generated files drift from
`shared/schema.ts`.

## `check-doc-drift.ts` — living-docs drift guard

Fails if the living documentation reintroduces terminology for architecture that was
consolidated away. Runs in CI (the **Docs Drift** job) and can be run locally:

```bash
bun run check:drift   # → bun scripts/check-doc-drift.ts
```

It scans docs only (not source provenance comments or dated historical records) and skips
past-tense mentions. To waive a genuine exception, put a `drift-ok` marker on the line. The
banned terms and scanned paths are the two lists at the top of the script.

## `backup.sh` — automated SQLite backup

Copies the SQLite database out of the running `server` Docker container.

```bash
# Manual run — BACKUP_DIR defaults to /var/backups/permish, retention to 30 days
./scripts/backup.sh /var/backups/permish 30

# crontab -e — daily at 3am, keep 30 days
0 3 * * * /path/to/permish/scripts/backup.sh /var/backups/permish 30 >> /var/log/permish-backup.log 2>&1
```

SQLite runs in WAL mode, so the file can be copied safely while the app is running.

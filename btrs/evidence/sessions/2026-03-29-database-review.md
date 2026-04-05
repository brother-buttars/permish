# Database Layer Review -- permish App

**Date:** 2026-03-29
**Agent:** Database Engineer
**Scope:** backend/src/db/, backend/src/routes/*.js

---

## Executive Summary

The database layer is reasonably well-structured for a small SQLite application. All queries use parameterized statements (no SQL injection risks found). WAL mode and foreign keys are properly enabled. The main areas for improvement are: missing indexes on foreign keys, an N+1 query pattern in the events listing, lack of cascading delete enforcement beyond schema declarations, and migration fragility when recreating tables.

---

## 1. SQL Injection -- PASS (No Issues Found)

Every query across all route files uses `?` placeholders with `.prepare()` and `.run()` / `.get()` / `.all()`. No string concatenation or template literals are used to build SQL with user input.

**Files reviewed:**
- `backend/src/routes/auth.js` -- all queries parameterized
- `backend/src/routes/events.js` -- all queries parameterized
- `backend/src/routes/form.js` -- all queries parameterized
- `backend/src/routes/profiles.js` -- all queries parameterized
- `backend/src/routes/submissions.js` -- all queries parameterized

**One note on schema.js migrations (LOW risk):** The `migrate()` function uses `db.exec()` with template literals for ALTER TABLE, but the column names and types come from hardcoded objects, not user input. This is safe.

---

## 2. Missing Indexes

### ISSUE 2a: No index on `events.created_by`

- **Severity:** HIGH
- **File:** `backend/src/db/schema.js`, line 175
- **Description:** Every events query filters by `created_by = ?` (listing events, checking ownership for updates/deletes/submissions). Without an index, these are full table scans. As the events table grows, every planner's dashboard load degrades.
- **Affected queries:**
  - `events.js:65` -- `SELECT * FROM events WHERE created_by = ?`
  - `events.js:66` -- `SELECT * FROM events WHERE created_by = ? AND is_active = 1`
  - `events.js:85-88` -- JOIN with `WHERE e.created_by = ?`
  - `events.js:94,101,128,136,146,170,186` -- ownership checks
- **Fix:**
```sql
CREATE INDEX IF NOT EXISTS idx_events_created_by ON events(created_by);
-- or for the common active-events query:
CREATE INDEX IF NOT EXISTS idx_events_created_by_active ON events(created_by, is_active);
```

### ISSUE 2b: No index on `submissions.event_id`

- **Severity:** HIGH
- **File:** `backend/src/db/schema.js`, line 237
- **Description:** Submissions are always queried by `event_id` (listing submissions per event, counting submissions per event). This is a foreign key column with no index.
- **Affected queries:**
  - `events.js:69` -- `SELECT COUNT(*) FROM submissions WHERE event_id = ?` (called in a loop!)
  - `events.js:138` -- `SELECT ... FROM submissions WHERE event_id = ?`
  - `events.js:85` -- JOIN on `s.event_id = e.id`
- **Fix:**
```sql
CREATE INDEX IF NOT EXISTS idx_submissions_event_id ON submissions(event_id);
```

### ISSUE 2c: No index on `submissions.submitted_by`

- **Severity:** MEDIUM
- **File:** `backend/src/db/schema.js`, line 239
- **Description:** The `/submissions/mine` endpoint queries `WHERE s.submitted_by = ?`. Parents viewing their submission history will hit a full table scan.
- **Affected queries:**
  - `submissions.js:16` -- `WHERE s.submitted_by = ?`
- **Fix:**
```sql
CREATE INDEX IF NOT EXISTS idx_submissions_submitted_by ON submissions(submitted_by);
```

### ISSUE 2d: No index on `child_profiles.user_id`

- **Severity:** MEDIUM
- **File:** `backend/src/db/schema.js`, line 209
- **Description:** Profiles are always queried by `user_id`. Every profile listing and ownership check is a full scan.
- **Affected queries:**
  - `profiles.js:11` -- `WHERE user_id = ?`
  - `profiles.js:45,77` -- `WHERE id = ? AND user_id = ?`
- **Fix:**
```sql
CREATE INDEX IF NOT EXISTS idx_child_profiles_user_id ON child_profiles(user_id);
```

### ISSUE 2e: No index on `event_attachments.event_id`

- **Severity:** MEDIUM
- **File:** `backend/src/db/schema.js`, line 197
- **Description:** Attachments are always queried by `event_id`. Both public and authenticated routes filter on this column.
- **Affected queries:**
  - `events.js:149,158,189` -- attachment queries by event_id
  - `form.js:28,37` -- public attachment listings
- **Fix:**
```sql
CREATE INDEX IF NOT EXISTS idx_event_attachments_event_id ON event_attachments(event_id);
```

### Recommended: Add all indexes in `createTables()` after the CREATE TABLE statements

```sql
CREATE INDEX IF NOT EXISTS idx_events_created_by ON events(created_by);
CREATE INDEX IF NOT EXISTS idx_submissions_event_id ON submissions(event_id);
CREATE INDEX IF NOT EXISTS idx_submissions_submitted_by ON submissions(submitted_by);
CREATE INDEX IF NOT EXISTS idx_child_profiles_user_id ON child_profiles(user_id);
CREATE INDEX IF NOT EXISTS idx_event_attachments_event_id ON event_attachments(event_id);
```

Using `IF NOT EXISTS` makes them safe to re-run.

---

## 3. N+1 Query Pattern

### ISSUE 3a: Events listing counts submissions in a loop

- **Severity:** HIGH
- **File:** `backend/src/routes/events.js`, lines 68-73
- **Description:** The `GET /` handler fetches all events, then loops through each one to count submissions with a separate query. For a planner with 50 events, this is 51 queries.
- **Current code:**
```javascript
const eventsWithCounts = events.map(event => {
  const count = db.prepare('SELECT COUNT(*) as count FROM submissions WHERE event_id = ?').get(event.id);
  ...
});
```
- **Fix:** Use a single query with LEFT JOIN and GROUP BY, or a subquery:
```sql
SELECT e.*, COALESCE(sub_counts.count, 0) AS submission_count
FROM events e
LEFT JOIN (
  SELECT event_id, COUNT(*) as count FROM submissions GROUP BY event_id
) sub_counts ON sub_counts.event_id = e.id
WHERE e.created_by = ? AND e.is_active = 1
ORDER BY e.created_at DESC
```

---

## 4. Schema Design Issues

### ISSUE 4a: CHECK constraint on NULL uses non-standard syntax

- **Severity:** LOW
- **File:** `backend/src/db/schema.js`, lines 171, 109, 266, 267
- **Description:** The CHECK constraints use `CHECK(... IN ('drawn', 'typed', 'hand', NULL))`. While SQLite tolerates this (NULL comparisons with IN always evaluate to NULL, which CHECK treats as "not false" i.e. passes), it is misleading. The column already allows NULL by default since there is no NOT NULL constraint. The `NULL` in the IN list is dead code.
- **Fix:** Remove `NULL` from the IN list for clarity:
```sql
guardian_signature_type TEXT CHECK(guardian_signature_type IN ('drawn', 'typed', 'hand'))
```

### ISSUE 4b: `submitted_at` uses `datetime('now')` but stores as TEXT

- **Severity:** LOW
- **File:** `backend/src/db/schema.js`, line 268
- **Description:** SQLite stores datetime as TEXT regardless, so this is not strictly wrong. However, the column type says `DATETIME` which is misleading. Consider documenting the expected format (ISO 8601 UTC) or just use `TEXT`.
- **Fix:** Cosmetic -- no functional impact in SQLite.

### ISSUE 4c: No `updated_at` column on submissions or events

- **Severity:** LOW
- **File:** `backend/src/db/schema.js`
- **Description:** `child_profiles` has `updated_at` but `submissions` and `events` do not. Since submissions can be edited (PUT endpoint exists), there is no audit trail of when the last edit happened.
- **Fix:**
```sql
ALTER TABLE submissions ADD COLUMN updated_at DATETIME;
ALTER TABLE events ADD COLUMN updated_at DATETIME;
```
Then set `updated_at = datetime('now')` in UPDATE queries.

### ISSUE 4d: `organizations` stored as JSON text with no validation

- **Severity:** LOW
- **File:** `backend/src/db/schema.js`, line 191
- **Description:** The `organizations` column stores a JSON array as TEXT. SQLite has JSON functions (`json_valid()`, `json_extract()`) but no CHECK constraint validates the JSON is well-formed. Invalid JSON could be stored and break the frontend.
- **Fix:** Add a CHECK constraint (SQLite 3.38+):
```sql
organizations TEXT DEFAULT '[]' CHECK(json_valid(organizations))
```

---

## 5. Data Integrity and Cascading Deletes

### ISSUE 5a: Foreign key references declared but no ON DELETE behavior for most

- **Severity:** HIGH
- **File:** `backend/src/db/schema.js`, lines 176, 197-199, 209, 237-239
- **Description:** Foreign keys are declared with `REFERENCES` but without `ON DELETE CASCADE` or `ON DELETE SET NULL`. If a user is deleted, their events, profiles, and submissions become orphaned records with dangling foreign key references. SQLite will reject the delete if `foreign_keys = ON` (which it is), but the application has no user deletion endpoint -- so this is a latent issue.

  Specific concerns:
  - `events.created_by REFERENCES users(id)` -- no ON DELETE. Deleting a user would fail.
  - `submissions.event_id REFERENCES events(id)` -- no ON DELETE. But events are soft-deleted (is_active=0), so hard delete of events would fail if submissions exist.
  - `submissions.submitted_by REFERENCES users(id)` -- no ON DELETE. Deleting a user would fail.
  - `child_profiles.user_id REFERENCES users(id)` -- no ON DELETE. Deleting a user would fail.
  - `event_attachments.event_id REFERENCES events(id)` -- no ON DELETE. Deleting an event would fail.

- **Current mitigation:** Events use soft delete (is_active=0), and there is no user delete endpoint. This means the FK constraints won't actually fire today, but it will become a problem when admin features or account deletion are added.

- **Fix:** For a future migration, consider:
  - `child_profiles.user_id ... ON DELETE CASCADE` (delete user = delete their profiles)
  - `submissions.submitted_by ... ON DELETE SET NULL` (keep submissions even if user deleted)
  - `events.created_by ... ON DELETE CASCADE` (or SET NULL + assign to admin)
  - `event_attachments.event_id ... ON DELETE CASCADE`

  Note: Changing ON DELETE behavior in SQLite requires recreating the table (the same pattern already used in migrate()).

### ISSUE 5b: Soft delete on events but hard delete on submissions/attachments

- **Severity:** MEDIUM
- **File:** `backend/src/routes/events.js:130`, `backend/src/routes/submissions.js:137`
- **Description:** Events are soft-deleted (`is_active = 0`), but submissions are hard-deleted (`DELETE FROM submissions`). This means a planner can permanently destroy a parent's submitted permission form with no recovery. Attachments are also hard-deleted.
- **Fix:** Consider adding soft delete for submissions (add `deleted_at` column) or at minimum confirm this is intentional behavior. At the very least, keep the PDF file as an archived record.

---

## 6. Migration Safety

### ISSUE 6a: Table recreation migration loses indexes and triggers

- **Severity:** MEDIUM
- **File:** `backend/src/db/schema.js`, lines 39-80, 96-116
- **Description:** The submissions and users table recreation migrations (`CREATE TABLE _new ... INSERT ... DROP ... RENAME`) will lose any indexes that were created on the original table. Since there are currently no explicit indexes (see Issue 2), this is not immediately harmful. But once indexes are added, future table recreations must recreate the indexes too.
- **Fix:** If indexes are added (as recommended), ensure any table recreation migration also recreates the indexes, or run index creation after migration in `createTables()` using `CREATE INDEX IF NOT EXISTS`.

### ISSUE 6b: Migrations are idempotent -- PASS

- **Severity:** N/A (positive finding)
- **Description:** The `migrate()` function checks column existence with `PRAGMA table_info` before ALTER TABLE, and uses savepoints to test constraints before recreating tables. The `createTables()` function uses `CREATE TABLE IF NOT EXISTS`. These are safe to re-run.

### ISSUE 6c: No migration versioning system

- **Severity:** LOW
- **File:** `backend/src/db/schema.js`
- **Description:** Migrations are embedded directly in the `migrate()` function with no version tracking. Each migration checks its own preconditions (column existence, constraint checks). This works for now but becomes unwieldy as the number of migrations grows. Eventually, dead migration code (already-applied changes) will accumulate.
- **Fix:** Consider adding a `schema_version` table:
```sql
CREATE TABLE IF NOT EXISTS schema_version (version INTEGER PRIMARY KEY);
```
Then gate migrations by version number. This is a low-priority improvement for a small app.

---

## 7. Connection Handling

### ISSUE 7a: Single global connection -- acceptable for SQLite

- **Severity:** LOW (informational)
- **File:** `backend/src/db/connection.js`
- **Description:** A single `better-sqlite3` instance is created and reused. This is actually the recommended pattern for SQLite -- better-sqlite3 is synchronous and thread-safe within a single Node.js process. Connection pooling is not needed and would be harmful.
- **WAL mode:** Enabled on line 15. This allows concurrent reads during writes.
- **Foreign keys:** Enabled on line 16. This is essential and correctly configured.

### ISSUE 7b: No graceful shutdown / close handler

- **Severity:** MEDIUM
- **File:** `backend/src/index.js`, `backend/src/db/connection.js`
- **Description:** The database connection is never explicitly closed. While SQLite/better-sqlite3 will flush WAL on process exit in most cases, an unclean shutdown could leave a `-wal` or `-shm` file that needs recovery. Adding a process signal handler would ensure clean shutdown.
- **Fix:** In `connection.js` or `index.js`:
```javascript
process.on('SIGINT', () => {
  if (db) db.close();
  process.exit(0);
});
process.on('SIGTERM', () => {
  if (db) db.close();
  process.exit(0);
});
```

---

## 8. Query Efficiency (Additional Findings)

### ISSUE 8a: Redundant SELECT after INSERT

- **Severity:** LOW
- **File:** `backend/src/routes/events.js:56`, `form.js:103`, `profiles.js:39`
- **Description:** After every INSERT, a separate SELECT is issued to return the created row. Since the data was just provided by the caller plus defaults, the response could be constructed from the input data + `id` + `datetime('now')` without a round-trip. However, this pattern is common and ensures the response matches exactly what the database stored (including defaults and triggers).
- **Fix:** Optional optimization. Could use `RETURNING *` (SQLite 3.35+) to eliminate the extra query:
```sql
INSERT INTO events (...) VALUES (...) RETURNING *
```

### ISSUE 8b: SELECT * used when only a few columns are needed

- **Severity:** LOW
- **File:** Multiple locations (events.js:56,94,101,122; form.js:57,103; submissions.js:24,39,62,103,124)
- **Description:** Several queries use `SELECT *` when the handler only uses a subset of columns. For submissions, this means transferring large signature data (base64 PNG, up to 700KB each) even when it is not needed (e.g., ownership checks in submissions.js:62 only need `event_id` and `submitted_by`).
- **Fix for submissions ownership checks:**
```sql
SELECT id, event_id, submitted_by FROM submissions WHERE id = ?
```
This is especially important for the submissions detail endpoint where the full row (with signatures) is fetched twice -- once for the auth check, once for the response.

### ISSUE 8c: Duplicate full-row fetch in submission PUT

- **Severity:** MEDIUM
- **File:** `backend/src/routes/submissions.js`, lines 61-62 and 103
- **Description:** The PUT handler fetches the full submission twice: once before the update (line 61, for auth check -- needs only `event_id` and `submitted_by`) and once after (line 103, for the response). The first fetch pulls all signature data unnecessarily.
- **Fix:** Use a targeted SELECT for the auth check:
```javascript
const submission = db.prepare('SELECT id, event_id, submitted_by FROM submissions WHERE id = ?').get(req.params.id);
```

---

## 9. Backup and Recovery

### ISSUE 9a: No backup strategy documented or implemented

- **Severity:** MEDIUM
- **File:** N/A
- **Description:** The SQLite database file lives at `${DATA_DIR}/permish.db`. There is no backup script, no scheduled copy, and no point-in-time recovery. With WAL mode, a backup should copy the main `.db` file plus any `-wal` and `-shm` files atomically.
- **Fix:** Use SQLite's built-in backup API via better-sqlite3:
```javascript
db.backup(`${config.dataDir}/permish-backup-${Date.now()}.db`);
```
Or schedule a cron job that uses `.backup()`. For Docker deployments, ensure the data volume is backed up.

### ISSUE 9b: PDF files stored on local disk with no backup

- **Severity:** MEDIUM
- **File:** `backend/src/config.js:21`
- **Description:** Generated PDFs are stored at `./pdfs/` and uploaded attachments at `./uploads/`. These paths should be on persistent volumes in Docker and included in any backup strategy. If the container is recreated without volume mounts, all PDFs and attachments are lost.
- **Fix:** Ensure Docker Compose mounts these as named volumes (check docker-compose.yml), and include them in backup procedures.

---

## 10. Security (Additional Findings)

### ISSUE 10a: Attachment download has no ownership check

- **Severity:** MEDIUM
- **File:** `backend/src/routes/form.js`, lines 42-53
- **Description:** The public attachment download endpoint (`GET /:id/attachments/:attachmentId`) only checks that the attachment exists and belongs to the event. It does not check whether the event is active. Anyone with the attachment UUID can download it, even for deactivated events.
- **Fix:** Add `is_active` check or require that the event exists and is active before serving the file.

### ISSUE 10b: Path traversal risk in attachment filename

- **Severity:** LOW
- **File:** `backend/src/routes/form.js`, line 47
- **Description:** The attachment filename comes from the database (`attachment.filename`), which was set by multer using `crypto.randomUUID() + ext`. The extension comes from the original filename. If `originalname` contained path separators, `path.extname()` would still just return the extension. The filename stored in the database is safe because multer generates it. No actual vulnerability here, but worth noting the defense is in multer's filename generation, not in the download handler.

---

## Summary Table

| # | Severity | Issue | Category |
|---|----------|-------|----------|
| 2a | HIGH | No index on `events.created_by` | Indexes |
| 2b | HIGH | No index on `submissions.event_id` | Indexes |
| 3a | HIGH | N+1 query in events listing (submission counts) | Query Efficiency |
| 5a | HIGH | Foreign keys lack ON DELETE behavior | Data Integrity |
| 2c | MEDIUM | No index on `submissions.submitted_by` | Indexes |
| 2d | MEDIUM | No index on `child_profiles.user_id` | Indexes |
| 2e | MEDIUM | No index on `event_attachments.event_id` | Indexes |
| 5b | MEDIUM | Soft delete inconsistency (events vs submissions) | Data Integrity |
| 6a | MEDIUM | Table recreation drops indexes | Migration Safety |
| 7b | MEDIUM | No graceful shutdown / db.close() | Connection Handling |
| 8c | MEDIUM | Duplicate full-row fetch with signatures in PUT | Query Efficiency |
| 9a | MEDIUM | No backup strategy | Recovery |
| 9b | MEDIUM | PDF/upload files not backed up | Recovery |
| 10a | MEDIUM | Attachment download skips is_active check | Security |
| 4a | LOW | NULL in CHECK IN-list is dead code | Schema Design |
| 4b | LOW | DATETIME column type misleading | Schema Design |
| 4c | LOW | No updated_at on submissions/events | Schema Design |
| 4d | LOW | No JSON validation on organizations column | Schema Design |
| 6c | LOW | No migration versioning system | Migration Safety |
| 7a | LOW | Single connection (fine for SQLite) | Connection Handling |
| 8a | LOW | Redundant SELECT after INSERT | Query Efficiency |
| 8b | LOW | SELECT * when subset needed | Query Efficiency |

---

## Priority Recommendations

**Do first (HIGH impact, low effort):**
1. Add indexes on all foreign key columns (5 CREATE INDEX statements in `createTables()`)
2. Fix the N+1 query in events listing with a LEFT JOIN subquery
3. Add `process.on('SIGTERM/SIGINT')` handler to close the database

**Do next (MEDIUM impact):**
4. Use targeted SELECT (not `SELECT *`) for auth/ownership checks on submissions
5. Add `is_active` check to public attachment download
6. Document and implement a backup strategy

**Do later (LOW impact, good practice):**
7. Add `updated_at` columns to submissions and events tables
8. Plan ON DELETE behavior for foreign keys before adding user account deletion
9. Consider migration versioning as the app grows

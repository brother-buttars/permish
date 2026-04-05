# Migration Scripts

## SQLite to PocketBase Migration

Standalone Node.js script that reads all records from the existing better-sqlite3
database and creates corresponding records in PocketBase collections.

### What it migrates

| SQLite Table       | PocketBase Collection | Notes                                     |
|--------------------|----------------------|-------------------------------------------|
| users              | users (auth)         | Temporary passwords; users must reset     |
| events             | events               | Preserves UUIDs and all fields            |
| event_attachments  | event_attachments    | Uploads files from disk into PocketBase   |
| child_profiles     | child_profiles       | Boolean conversion (0/1 to true/false)    |
| submissions        | submissions          | Full field mapping with boolean conversion|

Migration order respects foreign key relationships:
users -> events -> event_attachments -> child_profiles -> submissions

### Prerequisites

1. PocketBase running with collections already created (via `pb_migrations/`)
2. PocketBase superuser account created
3. Access to the existing SQLite database file
4. If migrating attachments: access to the `backend/uploads/` directory

### Install

```bash
cd scripts
npm install
```

### Dry Run (preview only)

Shows record counts without writing anything:

```bash
SQLITE_PATH=../backend/data/permish.db \
PB_URL=http://localhost:8090 \
DRY_RUN=true \
node migrate-to-pocketbase.js
```

### Execute Migration

```bash
SQLITE_PATH=../backend/data/permish.db \
PB_URL=http://localhost:8090 \
PB_ADMIN_EMAIL=admin@example.com \
PB_ADMIN_PASSWORD=your-password \
node migrate-to-pocketbase.js
```

### Execute + Send Password Reset Emails

After migration, optionally trigger PocketBase password reset emails for all
migrated users so they can set a new password:

```bash
SQLITE_PATH=../backend/data/permish.db \
PB_URL=http://localhost:8090 \
PB_ADMIN_EMAIL=admin@example.com \
PB_ADMIN_PASSWORD=your-password \
SEND_RESET_EMAILS=true \
node migrate-to-pocketbase.js
```

### Environment Variables

| Variable            | Default                      | Description                              |
|---------------------|------------------------------|------------------------------------------|
| `SQLITE_PATH`      | `./backend/data/permish.db`  | Path to existing SQLite database         |
| `PB_URL`           | `http://localhost:8090`      | PocketBase server URL                    |
| `PB_ADMIN_EMAIL`   | *(required)*                 | PocketBase superuser email               |
| `PB_ADMIN_PASSWORD`| *(required)*                 | PocketBase superuser password            |
| `UPLOADS_DIR`      | `./backend/uploads`          | Directory containing uploaded files      |
| `DRY_RUN`          | `false`                      | Set to `true` to preview without writing |
| `SEND_RESET_EMAILS`| `false`                      | Set to `true` to send reset emails       |

### Password Handling

bcrypt password hashes from the SQLite database cannot be transferred into
PocketBase. The migration script:

1. Creates each user with a random 64-character temporary password
2. Logs all migrated users who need a password reset
3. Optionally sends PocketBase password reset emails (via `SEND_RESET_EMAILS=true`)

Users will need to use the "Forgot Password" flow to set a new password after
migration.

### Re-running

The script does not delete existing PocketBase records. If you need to re-run,
either clear the PocketBase collections first or expect duplicate-ID errors for
records that already exist.

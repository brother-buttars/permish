/**
 * Local SQLite schema — mirrors the backend schema for offline-first mode.
 * Run once on first app startup; future versions will add migration logic.
 */

import type { LocalDatabase } from './database';

export const LOCAL_SCHEMA_VERSION = 1;

export const SCHEMA_DDL = `
  CREATE TABLE IF NOT EXISTS local_meta (
    key TEXT PRIMARY KEY,
    value TEXT
  );

  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    name TEXT NOT NULL,
    role TEXT NOT NULL CHECK(role IN ('super', 'planner', 'parent')),
    phone TEXT,
    address TEXT,
    city TEXT,
    state_province TEXT,
    guardian_signature TEXT,
    guardian_signature_type TEXT CHECK(guardian_signature_type IN ('drawn', 'typed', 'hand', NULL)),
    created TEXT DEFAULT (datetime('now')),
    updated TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS events (
    id TEXT PRIMARY KEY,
    created_by TEXT NOT NULL REFERENCES users(id),
    event_name TEXT NOT NULL,
    event_dates TEXT NOT NULL,
    event_start TEXT,
    event_end TEXT,
    event_description TEXT NOT NULL,
    ward TEXT NOT NULL,
    stake TEXT NOT NULL,
    leader_name TEXT NOT NULL,
    leader_phone TEXT NOT NULL,
    leader_email TEXT NOT NULL,
    notify_email TEXT,
    notify_phone TEXT,
    notify_carrier TEXT,
    organizations TEXT DEFAULT '[]',
    additional_details TEXT,
    is_active INTEGER DEFAULT 1,
    created TEXT DEFAULT (datetime('now')),
    updated TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS event_attachments (
    id TEXT PRIMARY KEY,
    event_id TEXT NOT NULL REFERENCES events(id),
    filename TEXT NOT NULL,
    original_name TEXT NOT NULL,
    mime_type TEXT NOT NULL,
    size INTEGER NOT NULL,
    display_order INTEGER DEFAULT 0,
    blob_data BLOB,
    created TEXT DEFAULT (datetime('now')),
    updated TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS child_profiles (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id),
    participant_name TEXT NOT NULL,
    participant_dob TEXT NOT NULL,
    participant_phone TEXT,
    address TEXT,
    city TEXT,
    state_province TEXT,
    emergency_contact TEXT,
    emergency_phone_primary TEXT,
    emergency_phone_secondary TEXT,
    special_diet INTEGER DEFAULT 0,
    special_diet_details TEXT,
    allergies INTEGER DEFAULT 0,
    allergies_details TEXT,
    medications TEXT,
    can_self_administer_meds INTEGER,
    chronic_illness INTEGER DEFAULT 0,
    chronic_illness_details TEXT,
    recent_surgery INTEGER DEFAULT 0,
    recent_surgery_details TEXT,
    activity_limitations TEXT,
    other_accommodations TEXT,
    youth_program TEXT,
    created TEXT DEFAULT (datetime('now')),
    updated TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS submissions (
    id TEXT PRIMARY KEY,
    event_id TEXT NOT NULL REFERENCES events(id),
    submitted_by TEXT REFERENCES users(id),
    participant_name TEXT NOT NULL,
    participant_dob TEXT NOT NULL,
    participant_age INTEGER NOT NULL,
    participant_phone TEXT,
    address TEXT,
    city TEXT,
    state_province TEXT,
    emergency_contact TEXT,
    emergency_phone_primary TEXT,
    emergency_phone_secondary TEXT,
    special_diet INTEGER DEFAULT 0,
    special_diet_details TEXT,
    allergies INTEGER DEFAULT 0,
    allergies_details TEXT,
    medications TEXT,
    can_self_administer_meds INTEGER,
    chronic_illness INTEGER DEFAULT 0,
    chronic_illness_details TEXT,
    recent_surgery INTEGER DEFAULT 0,
    recent_surgery_details TEXT,
    activity_limitations TEXT,
    other_accommodations TEXT,
    participant_signature TEXT,
    participant_signature_type TEXT NOT NULL CHECK(participant_signature_type IN ('drawn', 'typed', 'hand')),
    participant_signature_date TEXT NOT NULL,
    guardian_signature TEXT,
    guardian_signature_type TEXT CHECK(guardian_signature_type IN ('drawn', 'typed', 'hand', NULL)),
    guardian_signature_date TEXT,
    pdf_path TEXT,
    created TEXT DEFAULT (datetime('now')),
    updated TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS pending_changes (
    id TEXT PRIMARY KEY,
    collection TEXT NOT NULL,
    record_id TEXT NOT NULL,
    operation TEXT NOT NULL CHECK(operation IN ('create', 'update', 'delete')),
    payload TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    synced_at TEXT,
    retry_count INTEGER DEFAULT 0,
    last_error TEXT
  );

  CREATE INDEX IF NOT EXISTS idx_events_created_by ON events(created_by);
  CREATE INDEX IF NOT EXISTS idx_submissions_event_id ON submissions(event_id);
  CREATE INDEX IF NOT EXISTS idx_submissions_submitted_by ON submissions(submitted_by);
  CREATE INDEX IF NOT EXISTS idx_child_profiles_user_id ON child_profiles(user_id);
  CREATE INDEX IF NOT EXISTS idx_event_attachments_event_id ON event_attachments(event_id);
  CREATE INDEX IF NOT EXISTS idx_pending_unsynced ON pending_changes(synced_at) WHERE synced_at IS NULL;
`;

/**
 * Initialise the local database schema. Safe to call on every startup —
 * it only creates tables when they don't already exist.
 */
export async function initializeLocalSchema(db: LocalDatabase): Promise<void> {
  // Check if schema is already set up
  const meta = await db
    .query<{ value: string }>('SELECT value FROM local_meta WHERE key = ?', ['schema_version'])
    .catch(() => []);

  if (meta.length === 0) {
    // First run — create all tables.
    // sql.js doesn't support multiple statements in a single run(),
    // so we split on semicolons and execute each statement individually.
    const statements = SCHEMA_DDL
      .split(';')
      .map((s) => s.trim())
      .filter((s) => s.length > 0);

    for (const stmt of statements) {
      await db.execute(stmt);
    }

    await db.execute('INSERT INTO local_meta (key, value) VALUES (?, ?)', [
      'schema_version',
      String(LOCAL_SCHEMA_VERSION)
    ]);
  }
  // Future: add migration logic when LOCAL_SCHEMA_VERSION increments
}

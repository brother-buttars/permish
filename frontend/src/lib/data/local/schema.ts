/**
 * Local SQLite schema — mirrors the backend schema for offline-first mode.
 * Run once on first app startup; future versions will add migration logic.
 */

import type { LocalDatabase } from './database';

export const LOCAL_SCHEMA_VERSION = 3;

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
    group_id TEXT REFERENCES groups(id),
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

  CREATE TABLE IF NOT EXISTS groups (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    type TEXT NOT NULL CHECK(type IN ('stake', 'ward', 'custom')),
    parent_id TEXT REFERENCES groups(id),
    ward TEXT,
    stake TEXT,
    leader_name TEXT,
    leader_phone TEXT,
    leader_email TEXT,
    invite_code TEXT UNIQUE,
    created TEXT DEFAULT (datetime('now')),
    updated TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS group_members (
    id TEXT PRIMARY KEY,
    group_id TEXT NOT NULL REFERENCES groups(id),
    user_id TEXT NOT NULL REFERENCES users(id),
    role TEXT NOT NULL CHECK(role IN ('admin', 'member')) DEFAULT 'member',
    joined_at TEXT DEFAULT (datetime('now')),
    UNIQUE(group_id, user_id)
  );

  CREATE INDEX IF NOT EXISTS idx_events_created_by ON events(created_by);
  CREATE INDEX IF NOT EXISTS idx_submissions_event_id ON submissions(event_id);
  CREATE INDEX IF NOT EXISTS idx_submissions_submitted_by ON submissions(submitted_by);
  CREATE INDEX IF NOT EXISTS idx_child_profiles_user_id ON child_profiles(user_id);
  CREATE INDEX IF NOT EXISTS idx_event_attachments_event_id ON event_attachments(event_id);
  CREATE INDEX IF NOT EXISTS idx_pending_unsynced ON pending_changes(synced_at) WHERE synced_at IS NULL;
  CREATE INDEX IF NOT EXISTS idx_group_members_group ON group_members(group_id);
  CREATE INDEX IF NOT EXISTS idx_group_members_user ON group_members(user_id);
  CREATE INDEX IF NOT EXISTS idx_groups_parent ON groups(parent_id);
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
  } else {
    const currentVersion = parseInt(meta[0].value, 10);

    // Migration: v1 -> v2 — add groups, group_members tables and group_id on events
    if (currentVersion < 2) {
      const v2Statements = [
        `CREATE TABLE IF NOT EXISTS groups (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          type TEXT NOT NULL CHECK(type IN ('stake', 'ward', 'custom')),
          parent_id TEXT REFERENCES groups(id),
          ward TEXT,
          stake TEXT,
          leader_name TEXT,
          leader_phone TEXT,
          leader_email TEXT,
          invite_code TEXT UNIQUE,
          created TEXT DEFAULT (datetime('now')),
          updated TEXT DEFAULT (datetime('now'))
        )`,
        `CREATE TABLE IF NOT EXISTS group_members (
          id TEXT PRIMARY KEY,
          group_id TEXT NOT NULL REFERENCES groups(id),
          user_id TEXT NOT NULL REFERENCES users(id),
          role TEXT NOT NULL CHECK(role IN ('admin', 'member')) DEFAULT 'member',
          joined_at TEXT DEFAULT (datetime('now')),
          UNIQUE(group_id, user_id)
        )`,
        `CREATE INDEX IF NOT EXISTS idx_group_members_group ON group_members(group_id)`,
        `CREATE INDEX IF NOT EXISTS idx_group_members_user ON group_members(user_id)`,
        `CREATE INDEX IF NOT EXISTS idx_groups_parent ON groups(parent_id)`
      ];

      for (const stmt of v2Statements) {
        await db.execute(stmt);
      }

      // Add group_id column to events if it doesn't exist
      try {
        await db.execute('ALTER TABLE events ADD COLUMN group_id TEXT REFERENCES groups(id)');
      } catch {
        // Column may already exist — ignore
      }

      await db.execute(
        'INSERT OR REPLACE INTO local_meta (key, value) VALUES (?, ?)',
        ['schema_version', '2']
      );
    }

    // Migration: v2 -> v3 — rename legacy YW class keys in events.organizations JSON
    if (currentVersion < 3) {
      const rows = await db.query<{ id: string; organizations: string }>(
        "SELECT id, organizations FROM events WHERE organizations LIKE '%beehives%' OR organizations LIKE '%mia_maids%' OR organizations LIKE '%laurels%'"
      );
      for (const row of rows) {
        let orgs: unknown;
        try { orgs = JSON.parse(row.organizations || '[]'); } catch { continue; }
        if (!Array.isArray(orgs)) continue;
        const renamed = (orgs as string[]).map((k) => {
          if (k === 'beehives') return 'builders_of_faith';
          if (k === 'mia_maids') return 'messengers_of_hope';
          if (k === 'laurels') return 'gatherers_of_light';
          return k;
        });
        await db.execute('UPDATE events SET organizations = ? WHERE id = ?', [
          JSON.stringify(renamed),
          row.id,
        ]);
      }

      await db.execute(
        'INSERT OR REPLACE INTO local_meta (key, value) VALUES (?, ?)',
        ['schema_version', '3']
      );
    }
  }
}

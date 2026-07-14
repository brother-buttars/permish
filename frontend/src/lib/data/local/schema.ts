/**
 * Local SQLite schema — mirrors the backend schema for offline-first mode.
 * Run once on first app startup; future versions will add migration logic.
 */

import type { LocalDatabase } from './database';
import { SCHEMA_DDL } from './schema.generated';
// The local SQLite schema is GENERATED from shared/schema.ts (the single source
// of truth shared with the server). Edit shared/schema.ts and run
// `bun run gen:schema`; never edit schema.generated.ts by hand.
export { SCHEMA_DDL };

export const LOCAL_SCHEMA_VERSION = 6;

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

    // Migration: v3 -> v4 — group_invites table for per-role / tokenized invites
    if (currentVersion < 4) {
      const v4Statements = [
        `CREATE TABLE IF NOT EXISTS group_invites (
          id TEXT PRIMARY KEY,
          group_id TEXT NOT NULL REFERENCES groups(id),
          code TEXT UNIQUE,
          token TEXT UNIQUE,
          role TEXT NOT NULL CHECK(role IN ('admin', 'member')) DEFAULT 'member',
          email TEXT,
          max_uses INTEGER,
          used_count INTEGER NOT NULL DEFAULT 0,
          expires_at TEXT,
          created_by TEXT REFERENCES users(id),
          created_at TEXT DEFAULT (datetime('now')),
          revoked_at TEXT,
          accepted_at TEXT,
          accepted_by TEXT REFERENCES users(id)
        )`,
        `CREATE INDEX IF NOT EXISTS idx_group_invites_group ON group_invites(group_id)`,
        `CREATE INDEX IF NOT EXISTS idx_group_invites_code ON group_invites(code)`,
        `CREATE INDEX IF NOT EXISTS idx_group_invites_token ON group_invites(token)`
      ];
      for (const stmt of v4Statements) {
        await db.execute(stmt);
      }
      const legacyGroups = await db.query<{ id: string; invite_code: string }>(
        `SELECT id, invite_code FROM groups WHERE invite_code IS NOT NULL`
      );
      for (const g of legacyGroups) {
        const exists = await db.query(
          'SELECT id FROM group_invites WHERE code = ?',
          [g.invite_code]
        );
        if (exists.length > 0) continue;
        await db.execute(
          `INSERT INTO group_invites (id, group_id, code, role, used_count) VALUES (?, ?, ?, 'member', 0)`,
          [crypto.randomUUID(), g.id, g.invite_code]
        );
      }
      await db.execute(
        'INSERT OR REPLACE INTO local_meta (key, value) VALUES (?, ?)',
        ['schema_version', '4']
      );
    }

    // Migration: v4 -> v5 — audit_log table
    if (currentVersion < 5) {
      await db.execute(`
        CREATE TABLE IF NOT EXISTS audit_log (
          id TEXT PRIMARY KEY,
          actor_id TEXT REFERENCES users(id),
          action TEXT NOT NULL,
          target_type TEXT,
          target_id TEXT,
          group_id TEXT REFERENCES groups(id),
          meta TEXT,
          created_at TEXT DEFAULT (datetime('now'))
        )
      `);
      await db.execute(`CREATE INDEX IF NOT EXISTS idx_audit_log_group ON audit_log(group_id, created_at)`);
      await db.execute(
        'INSERT OR REPLACE INTO local_meta (key, value) VALUES (?, ?)',
        ['schema_version', '5']
      );
    }

    // Migration: v5 -> v6 — rebuild users.role CHECK to allow ('super', 'user')
    // (the v1 schema used the old 'super' | 'planner' | 'parent' values, and any
    // existing local database still has that constraint baked in)
    if (currentVersion < 6) {
      await db.execute(`
        CREATE TABLE IF NOT EXISTS users_migrated (
          id TEXT PRIMARY KEY,
          email TEXT UNIQUE NOT NULL,
          password_hash TEXT NOT NULL,
          name TEXT NOT NULL,
          role TEXT NOT NULL CHECK(role IN ('super', 'user')),
          phone TEXT,
          address TEXT,
          city TEXT,
          state_province TEXT,
          guardian_signature TEXT,
          guardian_signature_type TEXT CHECK(guardian_signature_type IN ('drawn', 'typed', 'hand', NULL)),
          created TEXT DEFAULT (datetime('now')),
          updated TEXT DEFAULT (datetime('now'))
        )
      `);
      await db.execute(`
        INSERT INTO users_migrated (id, email, password_hash, name, role, phone, address, city, state_province, guardian_signature, guardian_signature_type, created, updated)
        SELECT id, email, password_hash, name,
          CASE WHEN role = 'super' THEN 'super' ELSE 'user' END,
          phone, address, city, state_province, guardian_signature, guardian_signature_type, created, updated
        FROM users
      `);
      await db.execute('DROP TABLE users');
      await db.execute('ALTER TABLE users_migrated RENAME TO users');
      await db.execute(
        'INSERT OR REPLACE INTO local_meta (key, value) VALUES (?, ?)',
        ['schema_version', '6']
      );
    }
  }
}

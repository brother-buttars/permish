import { Database } from 'bun:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import bcrypt from 'bcryptjs';
import { config } from './config.ts';
import { SERVER_SCHEMA_DDL } from './schema.generated.ts';

// The schema is GENERATED from shared/schema.ts (the single source of truth for
// both this server and the frontend local store). Edit shared/schema.ts and run
// `bun run gen:schema` — never edit schema.generated.ts by hand.
const SCHEMA = SERVER_SCHEMA_DDL;

export type DB = Database;

export function createDb(path: string = config.dbPath): DB {
  if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
  const db = new Database(path);
  db.exec('PRAGMA journal_mode = WAL;');
  db.exec('PRAGMA foreign_keys = ON;');
  db.exec(SCHEMA);
  return db;
}

/**
 * Ensure a default super admin exists on a fresh database — mirrors
 * backend/src/db/schema.js `bootstrapSuperAdmin`.
 */
export async function bootstrapSuperAdmin(db: DB): Promise<void> {
  const existing = db
    .query<{ id: string }, []>("SELECT id FROM users WHERE email = 'jesus@permish.app'")
    .get();
  if (existing) return;

  const anySuper = db.query<{ id: string }, []>("SELECT id FROM users WHERE role = 'super'").get();
  if (anySuper) return;

  const id = crypto.randomUUID();
  const password_hash = await bcrypt.hash('childofgod', 10);
  db.query(
    'INSERT INTO users (id, email, password_hash, name, role, must_change_password) VALUES (?, ?, ?, ?, ?, ?)'
  ).run(id, 'jesus@permish.app', password_hash, 'Admin', 'super', 1);
  console.log('Default super admin created: jesus@permish.app / childofgod (must change on first login)');
}

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
 * Ensure a super admin exists on a fresh database. The bootstrap password comes
 * from ADMIN_BOOTSTRAP_PASSWORD, or is randomly generated and printed exactly once.
 * The account cannot use the API beyond credential setup until it rotates its
 * credentials (enforced by the auth middleware via must_change_password).
 */
export async function bootstrapSuperAdmin(
  db: DB,
  opts: { password?: string; mustChange?: boolean } = {}
): Promise<void> {
  const existing = db
    .query<{ id: string }, []>("SELECT id FROM users WHERE email = 'jesus@permish.app'")
    .get();
  if (existing) return;

  const anySuper = db.query<{ id: string }, []>("SELECT id FROM users WHERE role = 'super'").get();
  if (anySuper) return;

  const fromEnv = config.adminBootstrapPassword;
  const generated = !opts.password && !fromEnv;
  const password =
    opts.password ||
    fromEnv ||
    Buffer.from(crypto.getRandomValues(new Uint8Array(12))).toString('base64url');
  const mustChange = opts.mustChange ?? true;

  const id = crypto.randomUUID();
  const password_hash = await bcrypt.hash(password, 10);
  db.query(
    'INSERT INTO users (id, email, password_hash, name, role, must_change_password) VALUES (?, ?, ?, ?, ?, ?)'
  ).run(id, 'jesus@permish.app', password_hash, 'Admin', 'super', mustChange ? 1 : 0);
  if (generated) {
    console.log(`Super admin created: jesus@permish.app / ${password} — shown once; credentials must be changed on first login`);
  } else {
    console.log('Super admin created: jesus@permish.app (password from configuration; must change on first login)');
  }
}

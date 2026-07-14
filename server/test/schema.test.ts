import { describe, it, expect } from 'bun:test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { Database } from 'bun:sqlite';
import { buildSchemaDdl } from '../../shared/schema.ts';
import { SERVER_SCHEMA_DDL } from '../src/schema.generated.ts';

// Guards the single-schema-source invariant: the committed generated files must
// match what shared/schema.ts produces, and the generated DDL must build a real DB.

describe('generated schema', () => {
  it('server/src/schema.generated.ts is up to date with shared/schema.ts', () => {
    expect(SERVER_SCHEMA_DDL.trim()).toBe(buildSchemaDdl('server').trim());
  });

  it("frontend local schema.generated.ts is up to date (run 'bun run gen:schema' if this fails)", () => {
    const localPath = fileURLToPath(new URL('../../frontend/src/lib/data/local/schema.generated.ts', import.meta.url));
    const committed = readFileSync(localPath, 'utf8');
    expect(committed).toContain(buildSchemaDdl('local'));
  });

  it('the generated server DDL builds a valid database with the expected tables', () => {
    const db = new Database(':memory:');
    db.exec(SERVER_SCHEMA_DDL);
    const tables = db
      .query<{ name: string }, []>("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
      .all()
      .map((r) => r.name);
    for (const t of ['users', 'events', 'submissions', 'child_profiles', 'groups', 'group_members', 'group_invites', 'audit_log', 'password_reset_tokens', 'event_attachments']) {
      expect(tables).toContain(t);
    }
    // Server-only column present; local-only tables absent.
    const userCols = db.query<{ name: string }, []>("SELECT name FROM pragma_table_info('users')").all().map((r) => r.name);
    expect(userCols).toContain('must_change_password');
    expect(userCols).toContain('created_at');
    expect(tables).not.toContain('pending_changes');
    expect(tables).not.toContain('local_meta');
  });

  it('the generated local DDL builds a valid database with the local-only tables', () => {
    const db = new Database(':memory:');
    db.exec(buildSchemaDdl('local'));
    const tables = db
      .query<{ name: string }, []>("SELECT name FROM sqlite_master WHERE type='table'")
      .all()
      .map((r) => r.name);
    expect(tables).toContain('pending_changes');
    expect(tables).toContain('local_meta');
    // Local users use created/updated, not must_change_password.
    const userCols = db.query<{ name: string }, []>("SELECT name FROM pragma_table_info('users')").all().map((r) => r.name);
    expect(userCols).toContain('created');
    expect(userCols).toContain('updated');
    expect(userCols).not.toContain('must_change_password');
  });
});

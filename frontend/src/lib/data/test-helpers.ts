/**
 * Shared test utilities for the data layer tests.
 * Creates an in-memory sql.js database that conforms to LocalDatabase.
 */

import initSqlJs from 'sql.js';
import type { LocalDatabase } from './local/database';

/**
 * Create a fresh in-memory LocalDatabase backed by sql.js.
 * Does NOT use IndexedDB — safe for Node/vitest.
 */
export async function createTestDatabase(): Promise<TestDatabase> {
  const SQL = await initSqlJs();
  const sqlDb = new SQL.Database();

  const db: TestDatabase = {
    _sqlDb: sqlDb,

    async execute(sql: string, params?: unknown[]): Promise<{ rowsAffected: number }> {
      sqlDb.run(sql, params as any[]);
      return { rowsAffected: sqlDb.getRowsModified() };
    },

    async query<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<T[]> {
      const stmt = sqlDb.prepare(sql);
      if (params) stmt.bind(params as any[]);
      const results: T[] = [];
      while (stmt.step()) {
        results.push(stmt.getAsObject() as T);
      }
      stmt.free();
      return results;
    },

    close(): void {
      sqlDb.close();
    },

    exportDatabase(): Uint8Array {
      return sqlDb.export();
    },

    async importDatabase(data: Uint8Array): Promise<void> {
      const SQL2 = await initSqlJs();
      // Close old, open new from data
      sqlDb.close();
      const newDb = new SQL2.Database(data);
      // Replace inner reference — we mutate _sqlDb so callers using
      // captured references still work.  The execute/query closures
      // reference `sqlDb` by value though, so we also need to patch.
      (db as any)._sqlDb = newDb;
      // Patch the closures by re-assigning the impl
      patchClosures(db, newDb);
    }
  };

  return db;
}

/** Internal: re-wire closures after importDatabase replaces the inner db. */
function patchClosures(db: TestDatabase, sqlDb: any): void {
  db.execute = async (sql: string, params?: unknown[]) => {
    sqlDb.run(sql, params as any[]);
    return { rowsAffected: sqlDb.getRowsModified() };
  };
  db.query = async <T = Record<string, unknown>>(sql: string, params?: unknown[]) => {
    const stmt = sqlDb.prepare(sql);
    if (params) stmt.bind(params as any[]);
    const results: T[] = [];
    while (stmt.step()) results.push(stmt.getAsObject() as T);
    stmt.free();
    return results;
  };
  db.close = () => sqlDb.close();
  db.exportDatabase = () => sqlDb.export();
}

export interface TestDatabase extends LocalDatabase {
  _sqlDb: any;
  exportDatabase(): Uint8Array;
  importDatabase(data: Uint8Array): Promise<void>;
}

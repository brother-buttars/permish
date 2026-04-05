import Database from '@tauri-apps/plugin-sql';
import type { LocalDatabase } from './database';

/**
 * Tauri SQL plugin driver for native SQLite on desktop and mobile.
 * Uses @tauri-apps/plugin-sql which wraps rusqlite (desktop) or
 * platform-native SQLite (iOS/Android).
 */
export class TauriDatabase implements LocalDatabase {
  private db: Database;

  private constructor(db: Database) {
    this.db = db;
  }

  static async create(path = 'sqlite:permish.db'): Promise<TauriDatabase> {
    const db = await Database.load(path);

    // Enable WAL mode for better concurrent read performance
    await db.execute('PRAGMA journal_mode=WAL;');

    return new TauriDatabase(db);
  }

  async execute(sql: string, params?: unknown[]): Promise<{ rowsAffected: number }> {
    const result = await this.db.execute(sql, params as any[]);
    return { rowsAffected: result.rowsAffected };
  }

  async query<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<T[]> {
    return this.db.select<T[]>(sql, params as any[]);
  }

  close(): void {
    this.db.close();
  }

  /**
   * Export database as raw bytes.
   * Tauri SQL plugin doesn't expose raw export, so we serialize all tables as JSON.
   */
  async exportDatabase(): Promise<Uint8Array> {
    const tables = await this.query<{ name: string }>(
      "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name != 'local_meta'"
    );

    const dump: Record<string, any[]> = {};
    for (const { name } of tables) {
      dump[name] = await this.query(`SELECT * FROM ${name}`);
    }

    const encoder = new TextEncoder();
    return encoder.encode(JSON.stringify(dump));
  }

  async importDatabase(data: Uint8Array): Promise<void> {
    const decoder = new TextDecoder();
    const dump: Record<string, any[]> = JSON.parse(decoder.decode(data));

    // Clear existing data and re-insert
    for (const [table, rows] of Object.entries(dump)) {
      await this.db.execute(`DELETE FROM ${table}`);
      for (const row of rows) {
        const cols = Object.keys(row);
        const placeholders = cols.map(() => '?').join(', ');
        await this.db.execute(
          `INSERT INTO ${table} (${cols.join(', ')}) VALUES (${placeholders})`,
          cols.map(c => row[c])
        );
      }
    }
  }
}

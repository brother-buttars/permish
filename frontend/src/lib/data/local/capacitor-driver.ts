import { CapacitorSQLite, SQLiteConnection } from '@capacitor-community/sqlite';
import type { LocalDatabase } from './database';

export class CapacitorDatabase implements LocalDatabase {
  private connection: SQLiteConnection;
  private dbName: string;

  private constructor(connection: SQLiteConnection, dbName: string) {
    this.connection = connection;
    this.dbName = dbName;
  }

  static async create(dbName = 'permish'): Promise<CapacitorDatabase> {
    const sqlite = new SQLiteConnection(CapacitorSQLite);

    // Check connection consistency
    const retCC = await sqlite.checkConnectionsConsistency();
    const isConn = (await sqlite.isConnection(dbName, false)).result;

    let db;
    if (retCC.result && isConn) {
      db = await sqlite.retrieveConnection(dbName, false);
    } else {
      db = await sqlite.createConnection(dbName, false, 'no-encryption', 1, false);
    }

    await db.open();

    // Enable WAL mode for better concurrent read performance
    await db.execute('PRAGMA journal_mode=WAL;');

    return new CapacitorDatabase(sqlite, dbName);
  }

  async execute(sql: string, params?: unknown[]): Promise<{ rowsAffected: number }> {
    const db = await this.connection.retrieveConnection(this.dbName, false);
    const result = await db.run(sql, params as any[]);
    return { rowsAffected: result.changes?.changes || 0 };
  }

  async query<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<T[]> {
    const db = await this.connection.retrieveConnection(this.dbName, false);
    const result = await db.query(sql, params as any[]);
    return (result.values || []) as T[];
  }

  close(): void {
    this.connection.closeConnection(this.dbName, false);
  }

  // For backup support
  async exportDatabase(): Promise<Uint8Array> {
    const db = await this.connection.retrieveConnection(this.dbName, false);
    // Export as JSON (Capacitor SQLite's export format)
    const exported = await db.exportToJson('full');
    const encoder = new TextEncoder();
    return encoder.encode(JSON.stringify(exported.export));
  }

  async importDatabase(data: Uint8Array): Promise<void> {
    const decoder = new TextDecoder();
    const json = JSON.parse(decoder.decode(data));
    const db = await this.connection.retrieveConnection(this.dbName, false);
    await db.importFromJson(JSON.stringify(json));
  }
}

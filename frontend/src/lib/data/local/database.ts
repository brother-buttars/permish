/**
 * Platform-agnostic interface for local SQLite operations,
 * plus a sql.js-backed implementation that persists to IndexedDB.
 */

import initSqlJs, { type Database } from 'sql.js';

// ---------------------------------------------------------------------------
// Interface
// ---------------------------------------------------------------------------

export interface LocalDatabase {
  execute(sql: string, params?: unknown[]): Promise<{ rowsAffected: number }>;
  query<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<T[]>;
  close(): void;
}

// ---------------------------------------------------------------------------
// IndexedDB helpers
// ---------------------------------------------------------------------------

const IDB_NAME = 'permish';
const IDB_VERSION = 1;
const IDB_STORE = 'db';
const IDB_KEY = 'sqlite';

function openIDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(IDB_NAME, IDB_VERSION);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(IDB_STORE)) {
        request.result.createObjectStore(IDB_STORE);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function loadFromIndexedDB(): Promise<Uint8Array | null> {
  try {
    const idb = await openIDB();
    return new Promise((resolve, reject) => {
      const tx = idb.transaction(IDB_STORE, 'readonly');
      const req = tx.objectStore(IDB_STORE).get(IDB_KEY);
      req.onsuccess = () => {
        idb.close();
        resolve(req.result ? new Uint8Array(req.result) : null);
      };
      req.onerror = () => {
        idb.close();
        reject(req.error);
      };
    });
  } catch {
    return null;
  }
}

async function saveToIndexedDB(data: Uint8Array): Promise<void> {
  const idb = await openIDB();
  return new Promise((resolve, reject) => {
    const tx = idb.transaction(IDB_STORE, 'readwrite');
    tx.objectStore(IDB_STORE).put(data, IDB_KEY);
    tx.oncomplete = () => {
      idb.close();
      resolve();
    };
    tx.onerror = () => {
      idb.close();
      reject(tx.error);
    };
  });
}

// ---------------------------------------------------------------------------
// sql.js implementation
// ---------------------------------------------------------------------------

export class SqlJsDatabase implements LocalDatabase {
  private db: Database;
  private persistTimer: ReturnType<typeof setTimeout> | null = null;

  private constructor(db: Database) {
    this.db = db;
  }

  /**
   * Initialise a new SqlJsDatabase, loading any previously-persisted data
   * from IndexedDB.
   */
  static async create(): Promise<SqlJsDatabase> {
    const SQL = await initSqlJs({
      // sql.js needs the WASM binary — pull from CDN
      locateFile: (file: string) => `https://sql.js.org/dist/${file}`
    });

    const savedData = await loadFromIndexedDB();
    const db = savedData ? new SQL.Database(savedData) : new SQL.Database();

    // Enable WAL-like behaviour (journal_mode MEMORY) and foreign keys
    db.run('PRAGMA journal_mode = MEMORY');
    db.run('PRAGMA foreign_keys = ON');

    return new SqlJsDatabase(db);
  }

  async execute(sql: string, params?: unknown[]): Promise<{ rowsAffected: number }> {
    this.db.run(sql, params as any[]);
    const rowsAffected = this.db.getRowsModified();
    this.schedulePersist();
    return { rowsAffected };
  }

  async query<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<T[]> {
    const stmt = this.db.prepare(sql);
    if (params) stmt.bind(params as any[]);

    const results: T[] = [];
    while (stmt.step()) {
      results.push(stmt.getAsObject() as T);
    }
    stmt.free();
    return results;
  }

  close(): void {
    // Flush any pending persist before closing
    if (this.persistTimer) {
      clearTimeout(this.persistTimer);
      this.persistTimer = null;
    }
    this.persistSync();
    this.db.close();
  }

  /** Force an immediate persist (useful before page unload). */
  async flush(): Promise<void> {
    if (this.persistTimer) {
      clearTimeout(this.persistTimer);
      this.persistTimer = null;
    }
    await this.persist();
  }

  // -------------------------------------------------------------------------
  // Persistence (debounced writes to IndexedDB)
  // -------------------------------------------------------------------------

  private schedulePersist(): void {
    if (this.persistTimer) clearTimeout(this.persistTimer);
    this.persistTimer = setTimeout(() => {
      this.persistTimer = null;
      this.persist().catch((err) =>
        console.error('[SqlJsDatabase] persist failed:', err)
      );
    }, 1000);
  }

  private async persist(): Promise<void> {
    const data = this.db.export();
    await saveToIndexedDB(data);
  }

  /** Synchronous fallback used only in close(). */
  private persistSync(): void {
    try {
      const data = this.db.export();
      // Best-effort synchronous persist via localStorage as a fallback
      // (IndexedDB is async-only). The async persist() should have already
      // saved the latest state in most cases.
      localStorage.setItem('permish_local_db_backup', JSON.stringify(Array.from(data)));
    } catch {
      // Ignore — this is a best-effort fallback
    }
  }
}

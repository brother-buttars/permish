/**
 * Platform-agnostic interface for local SQLite operations,
 * plus a sql.js-backed implementation that persists to IndexedDB.
 */

import initSqlJs, { type Database } from 'sql.js';
// Bundle the WASM binary with the app — "offline-first" must not depend on a
// CDN being reachable at boot.
import sqlWasmUrl from 'sql.js/dist/sql-wasm.wasm?url';

function loadSqlJs() {
	return initSqlJs({ locateFile: () => sqlWasmUrl });
}

// ---------------------------------------------------------------------------
// Interface
// ---------------------------------------------------------------------------

export interface LocalDatabase {
  execute(sql: string, params?: unknown[]): Promise<{ rowsAffected: number }>;
  query<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<T[]>;
  close(): void | Promise<void>;
  /** Persist any buffered writes immediately (sql.js specific). */
  flush?(): Promise<void>;
  /** Export the raw database bytes (sql.js specific). */
  exportDatabase?(): Uint8Array | Promise<Uint8Array>;
  /** Replace the live database with raw bytes and persist (sql.js specific). */
  importDatabase?(data: Uint8Array): Promise<void>;
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
  private dirty = false;
  private removeUnloadHandlers: (() => void) | null = null;

  private constructor(db: Database) {
    this.db = db;
    this.registerUnloadFlush();
  }

  /**
   * Initialise a new SqlJsDatabase, loading any previously-persisted data
   * from IndexedDB.
   */
  static async create(): Promise<SqlJsDatabase> {
    const SQL = await loadSqlJs();

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
    this.dirty = true;
    this.schedulePersist();
    return { rowsAffected };
  }

  async query<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<T[]> {
    const stmt = this.db.prepare(sql);
    try {
      if (params) stmt.bind(params as any[]);
      const results: T[] = [];
      while (stmt.step()) {
        results.push(stmt.getAsObject() as T);
      }
      return results;
    } finally {
      stmt.free();
    }
  }

  async close(): Promise<void> {
    // Persist buffered writes for real before tearing down — the debounced
    // timer may not have fired yet, and its data lives only in WASM memory.
    await this.flush();
    this.removeUnloadHandlers?.();
    this.removeUnloadHandlers = null;
    this.db.close();
  }

  /** Export the raw database as a Uint8Array (for backup). */
  exportDatabase(): Uint8Array {
    return this.db.export();
  }

  /** Replace the live database with raw bytes and persist to IndexedDB. */
  async importDatabase(data: Uint8Array): Promise<void> {
    const SQL = await loadSqlJs();
    this.db.close();
    this.db = new SQL.Database(data);
    this.dirty = true;
    await this.flush();
  }

  /** Force an immediate persist (used by close() and page unload). */
  async flush(): Promise<void> {
    if (this.persistTimer) {
      clearTimeout(this.persistTimer);
      this.persistTimer = null;
    }
    if (!this.dirty) return;
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
    this.dirty = false;
    await saveToIndexedDB(data);
  }

  /**
   * The debounce means up to 1s of writes exist only in WASM memory — flush
   * when the page is being hidden or unloaded so a parent who submits a form
   * and immediately closes the tab does not lose it. IndexedDB transactions
   * started during pagehide are allowed to complete by the browser.
   */
  private registerUnloadFlush(): void {
    if (typeof window === 'undefined') return;
    const onHide = (e: Event) => {
      if (e.type === 'pagehide' || document.visibilityState === 'hidden') {
        this.flush().catch((err) => console.error('[SqlJsDatabase] unload flush failed:', err));
      }
    };
    window.addEventListener('pagehide', onHide);
    document.addEventListener('visibilitychange', onHide);
    this.removeUnloadHandlers = () => {
      window.removeEventListener('pagehide', onHide);
      document.removeEventListener('visibilitychange', onHide);
    };
  }
}

import type { DataRepository } from './repository';
import type { SyncManager } from './sync/manager';
import type { BackupManager } from './backup/manager';

let repo: DataRepository | null = null;
let syncManager: SyncManager | null = null;
let backupManager: BackupManager | null = null;

export type DataMode = 'online' | 'local' | 'hybrid';

export function getDataMode(): DataMode {
  if (typeof window === 'undefined') return 'online';
  return (localStorage.getItem('permish_data_mode') as DataMode) || 'online';
}

/** Returns true if the user has explicitly chosen a data mode (completed setup). */
export function hasCompletedSetup(): boolean {
  if (typeof window === 'undefined') return true;
  return localStorage.getItem('permish_data_mode') !== null;
}

export function setDataMode(mode: DataMode): void {
  localStorage.setItem('permish_data_mode', mode);
}

export async function initRepository(): Promise<DataRepository> {
  const mode = getDataMode();

  // online — direct HTTP to the Permish server (Bun + Hono). The default.
  if (mode === 'online') {
    const { createHttpRepository } = await import('./adapters/http');
    repo = createHttpRepository();
    return repo;
  }

  // local — fully offline, in-device SQLite. No server, no sync.
  if (mode === 'local') {
    const { createPlatformDatabase } = await import('./local/platform-database');
    const { initializeLocalSchema } = await import('./local/schema');
    const { createLocalRepository } = await import('./adapters/local');

    const db = await createPlatformDatabase();
    await initializeLocalSchema(db);
    repo = createLocalRepository(db);

    const { BackupManager: BackupManagerClass } = await import('./backup/manager');
    backupManager = new BackupManagerClass(db);
    return repo;
  }

  // hybrid — local SQLite for reads/writes, background sync to the HTTP server.
  const { createPlatformDatabase } = await import('./local/platform-database');
  const { initializeLocalSchema } = await import('./local/schema');
  const { createLocalRepository } = await import('./adapters/local');
  const { createHttpRepository } = await import('./adapters/http');
  const { SyncManager: SyncManagerClass } = await import('./sync/manager');
  const { createHybridRepository } = await import('./sync/hybrid');

  const db = await createPlatformDatabase();
  await initializeLocalSchema(db);
  const local = createLocalRepository(db);
  const remote = createHttpRepository();
  syncManager = new SyncManagerClass(db, remote);
  repo = createHybridRepository(local, db, syncManager);
  syncManager.start();

  const { BackupManager: BackupManagerClass } = await import('./backup/manager');
  backupManager = new BackupManagerClass(db);
  return repo;
}

export function getRepository(): DataRepository {
  if (!repo) {
    throw new Error('Repository not initialized. Call initRepository() first.');
  }
  return repo;
}

export function getSyncManager(): SyncManager | null {
  return syncManager;
}

/**
 * Returns the BackupManager when running in local or hybrid mode.
 * Returns null in online-only mode (no local database to back up).
 */
export function getBackupManager(): BackupManager | null {
  return backupManager;
}

// Re-export types for convenience
export type { DataRepository } from './repository';
export type * from './types';

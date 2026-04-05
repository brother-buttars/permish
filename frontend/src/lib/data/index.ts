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

export function setDataMode(mode: DataMode): void {
  localStorage.setItem('permish_data_mode', mode);
}

export async function initRepository(): Promise<DataRepository> {
  const backend = import.meta.env.PUBLIC_BACKEND || 'express';
  const mode = getDataMode();

  // Express backend ignores data mode — always online
  if (backend === 'express') {
    const { createExpressRepository } = await import('./adapters/express');
    repo = createExpressRepository();
    return repo;
  }

  // PocketBase backend supports all three modes
  if (mode === 'local') {
    const { SqlJsDatabase } = await import('./local/database');
    const { initializeLocalSchema } = await import('./local/schema');
    const { createLocalRepository } = await import('./adapters/local');

    const db = await SqlJsDatabase.create();
    await initializeLocalSchema(db);
    repo = createLocalRepository(db);

    const { BackupManager: BackupManagerClass } = await import('./backup/manager');
    backupManager = new BackupManagerClass(db);
  } else if (mode === 'hybrid') {
    const { SqlJsDatabase } = await import('./local/database');
    const { initializeLocalSchema } = await import('./local/schema');
    const { createLocalRepository } = await import('./adapters/local');
    const { createPocketBaseRepository } = await import('./adapters/pocketbase');
    const { SyncManager: SyncManagerClass } = await import('./sync/manager');
    const { createHybridRepository } = await import('./sync/hybrid');

    const db = await SqlJsDatabase.create();
    await initializeLocalSchema(db);
    const local = createLocalRepository(db);
    const remote = createPocketBaseRepository();
    syncManager = new SyncManagerClass(db, remote);
    repo = createHybridRepository(local, db, syncManager);

    // Start background sync
    syncManager.start();

    const { BackupManager: BackupManagerClass } = await import('./backup/manager');
    backupManager = new BackupManagerClass(db);
  } else {
    // online mode — direct PocketBase
    const { createPocketBaseRepository } = await import('./adapters/pocketbase');
    repo = createPocketBaseRepository();
  }

  return repo!;
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

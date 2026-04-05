import { getPlatform } from '$lib/utils/platform';
import type { LocalDatabase } from './database';

/**
 * Creates the appropriate LocalDatabase implementation for the current platform.
 * - Tauri (desktop + mobile): @tauri-apps/plugin-sql (native SQLite via rusqlite)
 * - Web browser: sql.js (WebAssembly SQLite with IndexedDB persistence)
 */
export async function createPlatformDatabase(): Promise<LocalDatabase> {
  const platform = getPlatform();

  if (platform === 'tauri') {
    const { TauriDatabase } = await import('./tauri-driver');
    return TauriDatabase.create();
  }

  const { SqlJsDatabase } = await import('./database');
  return SqlJsDatabase.create();
}

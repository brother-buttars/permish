import { getPlatform } from '$lib/utils/platform';
import type { LocalDatabase } from './database';

/**
 * Creates the appropriate LocalDatabase implementation for the current platform.
 * - Web/Tauri: sql.js (WebAssembly SQLite with IndexedDB persistence)
 * - iOS/Android: @capacitor-community/sqlite (native SQLite)
 */
export async function createPlatformDatabase(): Promise<LocalDatabase> {
  const platform = getPlatform();

  if (platform === 'ios' || platform === 'android') {
    const { CapacitorDatabase } = await import('./capacitor-driver');
    return CapacitorDatabase.create();
  }

  const { SqlJsDatabase } = await import('./database');
  return SqlJsDatabase.create();
}

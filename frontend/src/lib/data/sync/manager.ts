/**
 * SyncManager — reads pending_changes from local SQLite and replays them
 * to the remote Bun server (via the HTTP adapter) when online.
 */

import type { LocalDatabase } from '../local/database';
import type { DataRepository } from '../repository';
import { SYNC, type SyncField, type SyncSpec } from './sync-columns.generated';

interface PendingChange {
  id: string;
  collection: string;
  record_id: string;
  operation: 'create' | 'update' | 'delete';
  payload: string; // JSON
  created_at: string;
  synced_at: string | null;
  retry_count: number;
  last_error: string | null;
}

export type SyncStatus = 'idle' | 'syncing' | 'error' | 'offline';

/** Maximum number of retries before a change is considered permanently failed. */
const MAX_RETRIES = 5;

export class SyncManager {
  private db: LocalDatabase;
  private remote: DataRepository;
  private timer: ReturnType<typeof setInterval> | null = null;
  private _status: SyncStatus = 'idle';
  private statusCallbacks: ((status: SyncStatus) => void)[] = [];
  private syncIntervalMs: number;
  private syncing = false; // guard against concurrent syncs

  constructor(db: LocalDatabase, remote: DataRepository, intervalMs = 30_000) {
    this.db = db;
    this.remote = remote;
    this.syncIntervalMs = intervalMs;
  }

  get status(): SyncStatus {
    return this._status;
  }

  /**
   * Register a callback invoked whenever the sync status changes.
   * Returns an unsubscribe function.
   */
  onStatusChange(callback: (status: SyncStatus) => void): () => void {
    this.statusCallbacks.push(callback);
    return () => {
      this.statusCallbacks = this.statusCallbacks.filter((cb) => cb !== callback);
    };
  }

  private setStatus(status: SyncStatus): void {
    this._status = status;
    for (const cb of this.statusCallbacks) {
      try {
        cb(status);
      } catch {
        // swallow callback errors
      }
    }
  }

  /** Start the periodic sync timer and run an immediate sync. */
  start(): void {
    if (this.timer) return;
    this.timer = setInterval(() => this.sync(), this.syncIntervalMs);
    // Fire an initial sync immediately
    this.sync();
  }

  /** Stop the periodic sync timer. */
  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  /**
   * Run a full sync cycle: push local changes, then pull remote changes.
   * Safe to call while already syncing — concurrent calls are silently skipped.
   */
  async sync(): Promise<void> {
    if (this.syncing) return;

    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      this.setStatus('offline');
      return;
    }

    this.syncing = true;
    this.setStatus('syncing');

    try {
      await this.pushChanges();
      await this.pullChanges();
      this.setStatus('idle');
    } catch (err) {
      console.error('[SyncManager] sync failed:', err);
      this.setStatus('error');
    } finally {
      this.syncing = false;
    }
  }

  // ---------------------------------------------------------------------------
  // Push — replay pending_changes to the remote adapter
  // ---------------------------------------------------------------------------

  private async pushChanges(): Promise<void> {
    const pending = await this.db.query<PendingChange>(
      'SELECT * FROM pending_changes WHERE synced_at IS NULL ORDER BY created_at ASC'
    );

    for (const change of pending) {
      if (change.retry_count >= MAX_RETRIES) continue; // skip permanently failed

      try {
        const payload = JSON.parse(change.payload);
        await this.replayChange(change.collection, change.operation, change.record_id, payload);

        // Mark as synced
        await this.db.execute(
          'UPDATE pending_changes SET synced_at = datetime("now") WHERE id = ?',
          [change.id]
        );
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Unknown error';
        await this.db.execute(
          'UPDATE pending_changes SET retry_count = retry_count + 1, last_error = ? WHERE id = ?',
          [message, change.id]
        );
      }
    }
  }

  private async replayChange(
    collection: string,
    operation: string,
    recordId: string,
    payload: Record<string, unknown>
  ): Promise<void> {
    switch (collection) {
      case 'events':
        if (operation === 'create') await this.remote.events.create(payload);
        else if (operation === 'update') await this.remote.events.update(recordId, payload);
        else if (operation === 'delete') await this.remote.events.deactivate(recordId);
        break;

      case 'child_profiles':
        if (operation === 'create') await this.remote.profiles.create(payload);
        else if (operation === 'update') await this.remote.profiles.update(recordId, payload);
        else if (operation === 'delete') await this.remote.profiles.delete(recordId);
        break;

      case 'submissions':
        if (operation === 'create') {
          const eventId = payload.event_id as string;
          await this.remote.submissions.submit(eventId, payload);
        } else if (operation === 'update') {
          await this.remote.submissions.update(recordId, payload);
        } else if (operation === 'delete') {
          await this.remote.submissions.delete(recordId);
        }
        break;

      case 'users':
        if (operation === 'update') await this.remote.auth.updateProfile(payload);
        break;

      default:
        console.warn(`[SyncManager] unknown collection for sync: ${collection}`);
    }
  }

  // ---------------------------------------------------------------------------
  // Pull — fetch remote state and upsert into local SQLite
  // ---------------------------------------------------------------------------

  private async pullChanges(): Promise<void> {
    await this.pullCollection('events', SYNC.events, () => this.remote.events.list({ all: true }));
    await this.pullCollection('child_profiles', SYNC.child_profiles, () => this.remote.profiles.list());
    await this.pullCollection('submissions', SYNC.submissions, () => this.remote.submissions.getMine());

    // Update last-pull timestamp
    await this.db.execute(
      `INSERT OR REPLACE INTO local_meta (key, value) VALUES ('last_pull_at', datetime('now'))`
    );
  }

  /** Coerce a domain value to its local-column binding per the generated sync spec. */
  private bind(field: SyncField, record: Record<string, unknown>): unknown {
    const v = record[field.name];
    if (field.kind === 'bool') return v ? 1 : 0;
    if (field.kind === 'nbool') return v == null ? null : v ? 1 : 0;
    return v ?? null;
  }

  /**
   * Generic remote→local upsert driven by the generated SYNC spec. The table
   * name equals the collection key, and column lists come from shared/schema.ts,
   * so there is nothing to hand-maintain per column here.
   */
  private async pullCollection(
    table: 'events' | 'child_profiles' | 'submissions',
    spec: SyncSpec,
    fetch: () => Promise<{ id: string }[]>
  ): Promise<void> {
    try {
      const records = await fetch();
      for (const row of records) {
        const record = row as unknown as Record<string, unknown>;
        const existing = await this.db.query(`SELECT id FROM ${table} WHERE id = ?`, [row.id]);
        if (existing.length > 0) {
          if (!spec.updateOnPull) continue;
          const setFields = spec.columns.filter((c) => !spec.immutable.includes(c.name));
          const setSql = setFields.map((c) => `${c.name}=?`).join(', ');
          const values = setFields.map((c) => this.bind(c, record));
          values.push(row.id);
          await this.db.execute(
            `UPDATE ${table} SET ${setSql}, updated=datetime('now') WHERE id=?`,
            values
          );
        } else {
          const names = spec.columns.map((c) => c.name);
          const placeholders = names.map(() => '?').join(',');
          const values = spec.columns.map((c) => this.bind(c, record));
          await this.db.execute(
            `INSERT OR IGNORE INTO ${table} (${names.join(', ')}) VALUES (${placeholders})`,
            values
          );
        }
      }
    } catch (err) {
      console.warn(`[SyncManager] failed to pull ${table}:`, err);
    }
  }

  // ---------------------------------------------------------------------------
  // Public helpers for UI display
  // ---------------------------------------------------------------------------

  /** Get count of pending (unsynced) changes. */
  async getPendingCount(): Promise<number> {
    const result = await this.db.query<{ count: number }>(
      'SELECT COUNT(*) as count FROM pending_changes WHERE synced_at IS NULL'
    );
    return result[0]?.count || 0;
  }

  /** Get changes that have permanently failed (retry_count >= MAX_RETRIES). */
  async getFailedChanges(): Promise<PendingChange[]> {
    return this.db.query<PendingChange>(
      `SELECT * FROM pending_changes WHERE synced_at IS NULL AND retry_count >= ${MAX_RETRIES}`
    );
  }

  /** Reset a failed change so it will be retried on the next sync cycle. */
  async retryChange(changeId: string): Promise<void> {
    await this.db.execute(
      'UPDATE pending_changes SET retry_count = 0, last_error = NULL WHERE id = ?',
      [changeId]
    );
    await this.sync();
  }

  /** Permanently discard a failed change (it will not be synced). */
  async discardChange(changeId: string): Promise<void> {
    await this.db.execute('DELETE FROM pending_changes WHERE id = ?', [changeId]);
  }
}

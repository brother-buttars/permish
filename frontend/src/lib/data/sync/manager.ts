/**
 * SyncManager — reads pending_changes from local SQLite and replays them
 * to the remote PocketBase adapter when online.
 */

import type { LocalDatabase } from '../local/database';
import type { DataRepository } from '../repository';

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
    await this.pullEvents();
    await this.pullProfiles();
    await this.pullSubmissions();

    // Update last-pull timestamp
    await this.db.execute(
      `INSERT OR REPLACE INTO local_meta (key, value) VALUES ('last_pull_at', datetime('now'))`
    );
  }

  private async pullEvents(): Promise<void> {
    try {
      const events = await this.remote.events.list({ all: true });
      for (const event of events) {
        const existing = await this.db.query('SELECT id FROM events WHERE id = ?', [event.id]);
        if (existing.length > 0) {
          await this.db.execute(
            `UPDATE events SET event_name=?, event_dates=?, event_start=?, event_end=?,
             event_description=?, ward=?, stake=?, leader_name=?, leader_phone=?,
             leader_email=?, notify_email=?, notify_phone=?, notify_carrier=?,
             organizations=?, additional_details=?, is_active=?, updated=datetime('now')
             WHERE id=?`,
            [
              event.event_name, event.event_dates, event.event_start || null,
              event.event_end || null, event.event_description, event.ward, event.stake,
              event.leader_name, event.leader_phone, event.leader_email,
              event.notify_email || null, event.notify_phone || null,
              event.notify_carrier || null, event.organizations,
              event.additional_details || null, event.is_active ? 1 : 0, event.id
            ]
          );
        } else {
          await this.db.execute(
            `INSERT OR IGNORE INTO events (id, created_by, event_name, event_dates, event_start,
             event_end, event_description, ward, stake, leader_name, leader_phone, leader_email,
             notify_email, notify_phone, notify_carrier, organizations, additional_details, is_active)
             VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
            [
              event.id, event.created_by, event.event_name, event.event_dates,
              event.event_start || null, event.event_end || null, event.event_description,
              event.ward, event.stake, event.leader_name, event.leader_phone,
              event.leader_email, event.notify_email || null, event.notify_phone || null,
              event.notify_carrier || null, event.organizations,
              event.additional_details || null, event.is_active ? 1 : 0
            ]
          );
        }
      }
    } catch (err) {
      console.warn('[SyncManager] failed to pull events:', err);
    }
  }

  private async pullProfiles(): Promise<void> {
    try {
      const profiles = await this.remote.profiles.list();
      for (const profile of profiles) {
        const existing = await this.db.query('SELECT id FROM child_profiles WHERE id = ?', [
          profile.id
        ]);
        if (existing.length > 0) {
          await this.db.execute(
            `UPDATE child_profiles SET participant_name=?, participant_dob=?, participant_phone=?,
             address=?, city=?, state_province=?, emergency_contact=?, emergency_phone_primary=?,
             emergency_phone_secondary=?, special_diet=?, special_diet_details=?, allergies=?,
             allergies_details=?, medications=?, can_self_administer_meds=?, chronic_illness=?,
             chronic_illness_details=?, recent_surgery=?, recent_surgery_details=?,
             activity_limitations=?, other_accommodations=?, youth_program=?, updated=datetime('now')
             WHERE id=?`,
            [
              profile.participant_name, profile.participant_dob,
              profile.participant_phone || null, profile.address || null,
              profile.city || null, profile.state_province || null,
              profile.emergency_contact || null, profile.emergency_phone_primary || null,
              profile.emergency_phone_secondary || null,
              profile.special_diet ? 1 : 0, profile.special_diet_details || null,
              profile.allergies ? 1 : 0, profile.allergies_details || null,
              profile.medications || null,
              profile.can_self_administer_meds == null ? null : (profile.can_self_administer_meds ? 1 : 0),
              profile.chronic_illness ? 1 : 0, profile.chronic_illness_details || null,
              profile.recent_surgery ? 1 : 0, profile.recent_surgery_details || null,
              profile.activity_limitations || null, profile.other_accommodations || null,
              profile.youth_program || null, profile.id
            ]
          );
        } else {
          await this.db.execute(
            `INSERT OR IGNORE INTO child_profiles (id, user_id, participant_name, participant_dob,
             participant_phone, address, city, state_province, emergency_contact,
             emergency_phone_primary, emergency_phone_secondary, special_diet, special_diet_details,
             allergies, allergies_details, medications, can_self_administer_meds, chronic_illness,
             chronic_illness_details, recent_surgery, recent_surgery_details, activity_limitations,
             other_accommodations, youth_program) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
            [
              profile.id, profile.user_id, profile.participant_name, profile.participant_dob,
              profile.participant_phone || null, profile.address || null,
              profile.city || null, profile.state_province || null,
              profile.emergency_contact || null, profile.emergency_phone_primary || null,
              profile.emergency_phone_secondary || null,
              profile.special_diet ? 1 : 0, profile.special_diet_details || null,
              profile.allergies ? 1 : 0, profile.allergies_details || null,
              profile.medications || null,
              profile.can_self_administer_meds == null ? null : (profile.can_self_administer_meds ? 1 : 0),
              profile.chronic_illness ? 1 : 0, profile.chronic_illness_details || null,
              profile.recent_surgery ? 1 : 0, profile.recent_surgery_details || null,
              profile.activity_limitations || null, profile.other_accommodations || null,
              profile.youth_program || null
            ]
          );
        }
      }
    } catch (err) {
      console.warn('[SyncManager] failed to pull profiles:', err);
    }
  }

  private async pullSubmissions(): Promise<void> {
    try {
      const submissions = await this.remote.submissions.getMine();
      for (const sub of submissions) {
        const existing = await this.db.query('SELECT id FROM submissions WHERE id = ?', [sub.id]);
        if (existing.length === 0) {
          await this.db.execute(
            `INSERT OR IGNORE INTO submissions (id, event_id, submitted_by, participant_name,
             participant_dob, participant_age, participant_phone, address, city, state_province,
             emergency_contact, emergency_phone_primary, emergency_phone_secondary,
             special_diet, special_diet_details, allergies, allergies_details,
             medications, can_self_administer_meds, chronic_illness, chronic_illness_details,
             recent_surgery, recent_surgery_details, activity_limitations, other_accommodations,
             participant_signature, participant_signature_type, participant_signature_date,
             guardian_signature, guardian_signature_type, guardian_signature_date, pdf_path)
             VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
            [
              sub.id, sub.event_id, sub.submitted_by || null, sub.participant_name,
              sub.participant_dob, sub.participant_age, sub.participant_phone || null,
              sub.address || null, sub.city || null, sub.state_province || null,
              sub.emergency_contact || null, sub.emergency_phone_primary || null,
              sub.emergency_phone_secondary || null,
              sub.special_diet ? 1 : 0, sub.special_diet_details || null,
              sub.allergies ? 1 : 0, sub.allergies_details || null,
              sub.medications || null,
              sub.can_self_administer_meds == null ? null : (sub.can_self_administer_meds ? 1 : 0),
              sub.chronic_illness ? 1 : 0, sub.chronic_illness_details || null,
              sub.recent_surgery ? 1 : 0, sub.recent_surgery_details || null,
              sub.activity_limitations || null, sub.other_accommodations || null,
              sub.participant_signature || null, sub.participant_signature_type,
              sub.participant_signature_date, sub.guardian_signature || null,
              sub.guardian_signature_type || null, sub.guardian_signature_date || null,
              sub.pdf_path || null
            ]
          );
        }
      }
    } catch (err) {
      console.warn('[SyncManager] failed to pull submissions:', err);
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

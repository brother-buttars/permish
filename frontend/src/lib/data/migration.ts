/**
 * Data migration utilities for switching between data modes.
 *
 * Handles pulling data from server to local DB (online → hybrid/local)
 * and pushing local data to server (local → hybrid).
 */

import type { DataRepository } from './repository';
import type { LocalDatabase } from './local/database';

export interface MigrationProgress {
  step: string;
  current: number;
  total: number;
}

type ProgressCallback = (progress: MigrationProgress) => void;

/**
 * Pull all user data from the remote server into the local database.
 * Used when switching from online → hybrid or online → local.
 */
export async function pullDataToLocal(
  remote: DataRepository,
  db: LocalDatabase,
  onProgress?: ProgressCallback
): Promise<{ events: number; profiles: number; submissions: number }> {
  let events = 0;
  let profiles = 0;
  let submissions = 0;

  // 1. Pull events
  onProgress?.({ step: 'Downloading events...', current: 0, total: 3 });
  try {
    const remoteEvents = await remote.events.list({ all: true });
    for (const event of remoteEvents) {
      await db.execute(
        `INSERT OR REPLACE INTO events (id, created_by, event_name, event_dates, event_start, event_end,
         event_description, ward, stake, leader_name, leader_phone, leader_email,
         notify_email, notify_phone, notify_carrier, organizations, additional_details, is_active)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        [event.id, event.created_by, event.event_name, event.event_dates,
         event.event_start || null, event.event_end || null,
         event.event_description, event.ward, event.stake, event.leader_name,
         event.leader_phone, event.leader_email, event.notify_email || null,
         event.notify_phone || null, event.notify_carrier || null,
         event.organizations, event.additional_details || null, event.is_active ? 1 : 0]
      );
      events++;
    }
  } catch (err) {
    console.warn('Failed to pull events:', err);
  }

  // 2. Pull profiles
  onProgress?.({ step: 'Downloading profiles...', current: 1, total: 3 });
  try {
    const remoteProfiles = await remote.profiles.list();
    for (const p of remoteProfiles) {
      await db.execute(
        `INSERT OR REPLACE INTO child_profiles (id, user_id, participant_name, participant_dob,
         participant_phone, address, city, state_province, emergency_contact,
         emergency_phone_primary, emergency_phone_secondary, special_diet, special_diet_details,
         allergies, allergies_details, medications, can_self_administer_meds, chronic_illness,
         chronic_illness_details, recent_surgery, recent_surgery_details, activity_limitations,
         other_accommodations, youth_program) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        [p.id, p.user_id, p.participant_name, p.participant_dob,
         p.participant_phone || null, p.address || null, p.city || null,
         p.state_province || null, p.emergency_contact || null,
         p.emergency_phone_primary || null, p.emergency_phone_secondary || null,
         p.special_diet ? 1 : 0, p.special_diet_details || null,
         p.allergies ? 1 : 0, p.allergies_details || null,
         p.medications || null,
         p.can_self_administer_meds == null ? null : (p.can_self_administer_meds ? 1 : 0),
         p.chronic_illness ? 1 : 0, p.chronic_illness_details || null,
         p.recent_surgery ? 1 : 0, p.recent_surgery_details || null,
         p.activity_limitations || null, p.other_accommodations || null,
         p.youth_program || null]
      );
      profiles++;
    }
  } catch (err) {
    console.warn('Failed to pull profiles:', err);
  }

  // 3. Pull submissions
  onProgress?.({ step: 'Downloading submissions...', current: 2, total: 3 });
  try {
    const remoteSubs = await remote.submissions.getMine();
    for (const s of remoteSubs) {
      await db.execute(
        `INSERT OR REPLACE INTO submissions (id, event_id, submitted_by, participant_name,
         participant_dob, participant_age, participant_phone, address, city, state_province,
         emergency_contact, emergency_phone_primary, emergency_phone_secondary,
         special_diet, special_diet_details, allergies, allergies_details,
         medications, can_self_administer_meds, chronic_illness, chronic_illness_details,
         recent_surgery, recent_surgery_details, activity_limitations, other_accommodations,
         participant_signature, participant_signature_type, participant_signature_date,
         guardian_signature, guardian_signature_type, guardian_signature_date, pdf_path)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        [s.id, s.event_id, s.submitted_by || null, s.participant_name,
         s.participant_dob, s.participant_age, s.participant_phone || null,
         s.address || null, s.city || null, s.state_province || null,
         s.emergency_contact || null, s.emergency_phone_primary || null,
         s.emergency_phone_secondary || null,
         s.special_diet ? 1 : 0, s.special_diet_details || null,
         s.allergies ? 1 : 0, s.allergies_details || null,
         s.medications || null,
         s.can_self_administer_meds == null ? null : (s.can_self_administer_meds ? 1 : 0),
         s.chronic_illness ? 1 : 0, s.chronic_illness_details || null,
         s.recent_surgery ? 1 : 0, s.recent_surgery_details || null,
         s.activity_limitations || null, s.other_accommodations || null,
         s.participant_signature || null, s.participant_signature_type,
         s.participant_signature_date, s.guardian_signature || null,
         s.guardian_signature_type || null, s.guardian_signature_date || null,
         s.pdf_path || null]
      );
      submissions++;
    }
  } catch (err) {
    console.warn('Failed to pull submissions:', err);
  }

  onProgress?.({ step: 'Done', current: 3, total: 3 });
  return { events, profiles, submissions };
}

/**
 * Push all pending local changes to the remote server.
 * Used when switching from local → hybrid, or hybrid/local → online.
 * Returns the count of successfully pushed changes.
 */
export async function pushPendingToRemote(
  db: LocalDatabase,
  remote: DataRepository,
  onProgress?: ProgressCallback
): Promise<{ pushed: number; failed: number }> {
  const pending = await db.query<{
    id: string; collection: string; record_id: string;
    operation: string; payload: string;
  }>('SELECT * FROM pending_changes WHERE synced_at IS NULL ORDER BY created_at ASC');

  let pushed = 0;
  let failed = 0;

  for (let i = 0; i < pending.length; i++) {
    const change = pending[i];
    onProgress?.({ step: `Syncing ${change.collection}...`, current: i, total: pending.length });

    try {
      const payload = JSON.parse(change.payload);
      switch (change.collection) {
        case 'events':
          if (change.operation === 'create') await remote.events.create(payload);
          else if (change.operation === 'update') await remote.events.update(change.record_id, payload);
          else if (change.operation === 'delete') await remote.events.deactivate(change.record_id);
          break;
        case 'child_profiles':
          if (change.operation === 'create') await remote.profiles.create(payload);
          else if (change.operation === 'update') await remote.profiles.update(change.record_id, payload);
          else if (change.operation === 'delete') await remote.profiles.delete(change.record_id);
          break;
        case 'submissions':
          if (change.operation === 'create') await remote.submissions.submit(payload.event_id, payload);
          else if (change.operation === 'update') await remote.submissions.update(change.record_id, payload);
          else if (change.operation === 'delete') await remote.submissions.delete(change.record_id);
          break;
      }
      await db.execute('UPDATE pending_changes SET synced_at = datetime("now") WHERE id = ?', [change.id]);
      pushed++;
    } catch (err: any) {
      console.warn(`Failed to push ${change.collection} ${change.operation}:`, err.message);
      failed++;
    }
  }

  onProgress?.({ step: 'Done', current: pending.length, total: pending.length });
  return { pushed, failed };
}

/**
 * Clear the local database (used when switching to online-only).
 */
export async function clearLocalDatabase(db: LocalDatabase): Promise<void> {
  await db.execute('DELETE FROM pending_changes');
  await db.execute('DELETE FROM submissions');
  await db.execute('DELETE FROM child_profiles');
  await db.execute('DELETE FROM event_attachments');
  await db.execute('DELETE FROM events');
  // Keep users table (has the local account) and local_meta
}

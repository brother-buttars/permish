/**
 * HybridAdapter — wraps the local adapter for all reads/writes and queues
 * mutations into pending_changes for background sync to PocketBase.
 *
 * Reads always come from local SQLite (instant, offline-capable).
 * Writes go to local SQLite first, then a pending_change row is inserted,
 * and a non-blocking sync attempt is triggered.
 */

import type {
  DataRepository,
  EventRepository,
  ProfileRepository,
  SubmissionRepository,
  AttachmentRepository
} from '../repository';
import type { LocalDatabase } from '../local/database';
import type { SyncManager } from './manager';

/**
 * Insert a pending_change row and fire-and-forget a sync attempt.
 * Extracted to avoid repetition in every mutation wrapper.
 */
async function queueChange(
  db: LocalDatabase,
  syncManager: SyncManager,
  collection: string,
  recordId: string,
  operation: 'create' | 'update' | 'delete',
  payload: Record<string, unknown> = {}
): Promise<void> {
  await db.execute(
    'INSERT INTO pending_changes (id, collection, record_id, operation, payload) VALUES (?, ?, ?, ?, ?)',
    [crypto.randomUUID(), collection, recordId, operation, JSON.stringify(payload)]
  );
  // Trigger sync attempt (non-blocking — we don't await)
  syncManager.sync().catch(() => {
    // Swallow — the periodic timer will retry
  });
}

/**
 * Create a hybrid DataRepository that reads from local SQLite and queues
 * mutations for background sync to the remote PocketBase backend.
 */
export function createHybridRepository(
  local: DataRepository,
  db: LocalDatabase,
  syncManager: SyncManager
): DataRepository {
  // -------------------------------------------------------------------------
  // Events — reads delegate to local; mutations also queue a pending_change
  // -------------------------------------------------------------------------

  const events: EventRepository = {
    // Read methods — straight pass-through to local
    list: local.events.list.bind(local.events),
    getById: local.events.getById.bind(local.events),
    getSubmissions: local.events.getSubmissions.bind(local.events),
    getAllSubmissions: local.events.getAllSubmissions.bind(local.events),

    async create(data) {
      const result = await local.events.create(data);
      await queueChange(db, syncManager, 'events', result.event.id, 'create', data);
      return result;
    },

    async update(id, data) {
      const result = await local.events.update(id, data);
      await queueChange(db, syncManager, 'events', id, 'update', data);
      return result;
    },

    async deactivate(id) {
      await local.events.deactivate(id);
      await queueChange(db, syncManager, 'events', id, 'delete');
    }
  };

  // -------------------------------------------------------------------------
  // Profiles
  // -------------------------------------------------------------------------

  const profiles: ProfileRepository = {
    list: local.profiles.list.bind(local.profiles),

    async create(data) {
      const result = await local.profiles.create(data);
      await queueChange(db, syncManager, 'child_profiles', result.id, 'create', data);
      return result;
    },

    async update(id, data) {
      const result = await local.profiles.update(id, data);
      await queueChange(db, syncManager, 'child_profiles', id, 'update', data);
      return result;
    },

    async delete(id) {
      await local.profiles.delete(id);
      await queueChange(db, syncManager, 'child_profiles', id, 'delete');
    }
  };

  // -------------------------------------------------------------------------
  // Submissions
  // -------------------------------------------------------------------------

  const submissions: SubmissionRepository = {
    // Read methods — straight pass-through to local
    getFormEvent: local.submissions.getFormEvent.bind(local.submissions),
    getMine: local.submissions.getMine.bind(local.submissions),
    getById: local.submissions.getById.bind(local.submissions),
    getPdfUrl: local.submissions.getPdfUrl.bind(local.submissions),

    async submit(eventId, data) {
      const result = await local.submissions.submit(eventId, data);
      await queueChange(db, syncManager, 'submissions', result.submission.id, 'create', {
        ...data,
        event_id: eventId
      });
      return result;
    },

    async update(id, data) {
      const result = await local.submissions.update(id, data);
      await queueChange(db, syncManager, 'submissions', id, 'update', data);
      return result;
    },

    async delete(id) {
      await local.submissions.delete(id);
      await queueChange(db, syncManager, 'submissions', id, 'delete');
    }
  };

  // -------------------------------------------------------------------------
  // Attachments — local for now, sync TODO when online file upload is designed
  // -------------------------------------------------------------------------

  const attachments: AttachmentRepository = {
    list: local.attachments.list.bind(local.attachments),
    upload: local.attachments.upload.bind(local.attachments),
    delete: local.attachments.delete.bind(local.attachments),
    getUrl: local.attachments.getUrl.bind(local.attachments)
  };

  // -------------------------------------------------------------------------
  // Assemble the hybrid DataRepository
  // -------------------------------------------------------------------------

  return {
    auth: local.auth, // Auth is always local in hybrid mode
    events,
    profiles,
    submissions,
    attachments,
    admin: local.admin // Admin is always local in hybrid mode
  };
}

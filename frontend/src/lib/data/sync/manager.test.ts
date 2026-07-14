import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createTestDatabase, type TestDatabase } from '../test-helpers';
import { initializeLocalSchema } from '../local/schema';
import { SyncManager } from './manager';
import type { DataRepository } from '../repository';

// Stub localStorage for any code that references it
vi.stubGlobal('localStorage', {
  getItem: () => null,
  setItem: () => {},
  removeItem: () => {}
});

// Ensure navigator.onLine is true by default so sync doesn't bail early
vi.stubGlobal('navigator', { onLine: true });

function createMockRemote(): DataRepository {
  return {
    auth: {
      register: vi.fn(),
      login: vi.fn(),
      logout: vi.fn(),
      getCurrentUser: vi.fn(),
      getProfile: vi.fn(),
      updateProfile: vi.fn().mockResolvedValue({}),
      changePassword: vi.fn(),
      forgotPassword: vi.fn(),
      resetPassword: vi.fn(),
      isAuthenticated: vi.fn().mockReturnValue(false)
    },
    events: {
      create: vi.fn().mockResolvedValue({ event: { id: 'r1' }, formUrl: '/form/r1' }),
      list: vi.fn().mockResolvedValue([]),
      listForMe: vi.fn().mockResolvedValue([]),
      getById: vi.fn(),
      update: vi.fn().mockResolvedValue({}),
      deactivate: vi.fn().mockResolvedValue(undefined),
      remove: vi.fn().mockResolvedValue(undefined),
      reassignOwner: vi.fn().mockResolvedValue({}),
      getSubmissions: vi.fn().mockResolvedValue([]),
      getAllSubmissions: vi.fn().mockResolvedValue([])
    },
    profiles: {
      list: vi.fn().mockResolvedValue([]),
      create: vi.fn().mockResolvedValue({ id: 'p1' }),
      update: vi.fn().mockResolvedValue({}),
      delete: vi.fn().mockResolvedValue(undefined)
    },
    submissions: {
      getFormEvent: vi.fn(),
      submit: vi.fn().mockResolvedValue({ submission: { id: 's1' } }),
      getMine: vi.fn().mockResolvedValue([]),
      getById: vi.fn(),
      update: vi.fn().mockResolvedValue({}),
      delete: vi.fn().mockResolvedValue(undefined),
      getPdfUrl: vi.fn().mockReturnValue('')
    },
    attachments: {
      list: vi.fn().mockResolvedValue([]),
      upload: vi.fn(),
      delete: vi.fn(),
      getUrl: vi.fn().mockReturnValue('')
    },
    admin: {
      getStats: vi.fn(),
      listUsers: vi.fn(),
      getUser: vi.fn(),
      createUser: vi.fn(),
      updateRole: vi.fn(),
      resetPassword: vi.fn(),
      deleteUser: vi.fn(),
      listGroupsTree: vi.fn(),
      listActivities: vi.fn(),
      listSubmissions: vi.fn(),
      listProfiles: vi.fn()
    },
    groups: {
      list: vi.fn().mockResolvedValue([]),
      getById: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      join: vi.fn(),
      invite: vi.fn(),
      updateMemberRole: vi.fn(),
      removeMember: vi.fn(),
      regenerateInvite: vi.fn(),
      listInvites: vi.fn(),
      createInvite: vi.fn(),
      revokeInvite: vi.fn(),
      previewInvite: vi.fn(),
      acceptInvite: vi.fn(),
      getAuditLog: vi.fn()
    }
  };
}

async function insertPendingChange(
  db: TestDatabase,
  overrides: Partial<{
    id: string;
    collection: string;
    record_id: string;
    operation: string;
    payload: string;
    retry_count: number;
    last_error: string | null;
    synced_at: string | null;
  }> = {}
): Promise<string> {
  const id = overrides.id ?? crypto.randomUUID();
  await db.execute(
    `INSERT INTO pending_changes (id, collection, record_id, operation, payload, retry_count, last_error, synced_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      overrides.collection ?? 'events',
      overrides.record_id ?? 'rec-1',
      overrides.operation ?? 'create',
      overrides.payload ?? '{"event_name":"Test"}',
      overrides.retry_count ?? 0,
      overrides.last_error ?? null,
      overrides.synced_at ?? null
    ]
  );
  return id;
}

describe('SyncManager', () => {
  let db: TestDatabase;
  let remote: DataRepository;
  let manager: SyncManager;

  beforeEach(async () => {
    db = await createTestDatabase();
    await initializeLocalSchema(db);
    remote = createMockRemote();
    // Use a large interval so the periodic timer does not fire during tests
    manager = new SyncManager(db, remote, 999_999);
  });

  afterEach(() => {
    manager.stop();
    try {
      db.close();
    } catch {
      // already closed
    }
  });

  describe('getPendingCount', () => {
    it('should return 0 when no pending changes', async () => {
      const count = await manager.getPendingCount();
      expect(count).toBe(0);
    });

    it('should return correct count of unsynced changes', async () => {
      await insertPendingChange(db);
      await insertPendingChange(db);
      await insertPendingChange(db, { synced_at: '2026-01-01 00:00:00' }); // already synced

      const count = await manager.getPendingCount();
      expect(count).toBe(2);
    });
  });

  describe('sync — push changes', () => {
    it('should replay event create to remote and mark as synced', async () => {
      const changeId = await insertPendingChange(db, {
        collection: 'events',
        operation: 'create',
        payload: JSON.stringify({ event_name: 'Camp' })
      });

      await manager.sync();

      // Creates carry the locally-minted id so the server keeps the same identity
      expect(remote.events.create).toHaveBeenCalledWith({ event_name: 'Camp', id: 'rec-1' });

      // Should be marked as synced
      const rows = await db.query<{ synced_at: string | null }>(
        'SELECT synced_at FROM pending_changes WHERE id = ?',
        [changeId]
      );
      expect(rows[0].synced_at).not.toBeNull();
    });

    it('should replay event update to remote', async () => {
      await insertPendingChange(db, {
        collection: 'events',
        record_id: 'evt-1',
        operation: 'update',
        payload: JSON.stringify({ event_name: 'Updated' })
      });

      await manager.sync();

      expect(remote.events.update).toHaveBeenCalledWith('evt-1', { event_name: 'Updated' });
    });

    it('should replay event delete (deactivate) to remote', async () => {
      await insertPendingChange(db, {
        collection: 'events',
        record_id: 'evt-1',
        operation: 'delete',
        payload: '{}'
      });

      await manager.sync();

      expect(remote.events.deactivate).toHaveBeenCalledWith('evt-1');
    });

    it('should replay profile operations', async () => {
      await insertPendingChange(db, {
        collection: 'child_profiles',
        record_id: 'prof-1',
        operation: 'create',
        payload: JSON.stringify({ participant_name: 'Alice' })
      });

      await manager.sync();

      expect(remote.profiles.create).toHaveBeenCalledWith({ participant_name: 'Alice', id: 'prof-1' });
    });

    it('should replay submission operations', async () => {
      await insertPendingChange(db, {
        collection: 'submissions',
        record_id: 'sub-1',
        operation: 'create',
        payload: JSON.stringify({ event_id: 'evt-1', participant_name: 'Jane' })
      });

      await manager.sync();

      expect(remote.submissions.submit).toHaveBeenCalledWith('evt-1', {
        event_id: 'evt-1',
        participant_name: 'Jane',
        id: 'sub-1'
      });
    });

    it('should replay user update to remote auth', async () => {
      await insertPendingChange(db, {
        collection: 'users',
        record_id: 'usr-1',
        operation: 'update',
        payload: JSON.stringify({ name: 'New Name' })
      });

      await manager.sync();

      expect(remote.auth.updateProfile).toHaveBeenCalledWith({ name: 'New Name' });
    });

    it('should replay group mutations instead of dropping them', async () => {
      (remote.groups.create as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 'grp-1' });
      (remote.groups.join as ReturnType<typeof vi.fn>).mockResolvedValue({ group: { id: 'grp-1' } });
      (remote.groups.removeMember as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);

      const createId = await insertPendingChange(db, {
        id: 'chg-g1',
        collection: 'groups',
        record_id: 'grp-1',
        operation: 'create',
        payload: JSON.stringify({ name: 'Oak Ward', type: 'ward' })
      });
      await insertPendingChange(db, {
        id: 'chg-g2',
        collection: 'group_members',
        record_id: 'grp-1',
        operation: 'create',
        payload: JSON.stringify({ invite_code: 'ABCDEF123456' })
      });
      await insertPendingChange(db, {
        id: 'chg-g3',
        collection: 'group_members',
        record_id: 'grp-1:usr-9',
        operation: 'delete',
        payload: '{}'
      });

      await manager.sync();

      expect(remote.groups.create).toHaveBeenCalledWith({ name: 'Oak Ward', type: 'ward', id: 'grp-1' });
      expect(remote.groups.join).toHaveBeenCalledWith('ABCDEF123456');
      expect(remote.groups.removeMember).toHaveBeenCalledWith('grp-1', 'usr-9');

      const rows = await db.query<{ synced_at: string | null }>(
        'SELECT synced_at FROM pending_changes WHERE id = ?',
        [createId]
      );
      expect(rows[0].synced_at).not.toBeNull();
    });

    it('should NOT mark unknown collections as synced', async () => {
      const changeId = await insertPendingChange(db, {
        collection: 'nonsense',
        record_id: 'x-1',
        operation: 'create',
        payload: '{}'
      });

      await manager.sync();

      const rows = await db.query<{ synced_at: string | null; retry_count: number; last_error: string | null }>(
        'SELECT synced_at, retry_count, last_error FROM pending_changes WHERE id = ?',
        [changeId]
      );
      expect(rows[0].synced_at).toBeNull();
      expect(rows[0].retry_count).toBeGreaterThan(0);
      expect(rows[0].last_error).toContain('Unknown collection');
    });

    it('accepts delete-permanent and reassign operations (extended CHECK)', async () => {
      await insertPendingChange(db, {
        id: 'chg-dp',
        collection: 'events',
        record_id: 'evt-1',
        operation: 'delete-permanent',
        payload: '{}'
      });
      await insertPendingChange(db, {
        id: 'chg-ra',
        collection: 'events',
        record_id: 'evt-2',
        operation: 'reassign',
        payload: JSON.stringify({ userId: 'usr-2' })
      });

      await manager.sync();

      expect(remote.events.remove).toHaveBeenCalledWith('evt-1');
      expect(remote.events.reassignOwner).toHaveBeenCalledWith('evt-2', 'usr-2');
    });

    it('should increment retry_count on failure', async () => {
      (remote.events.create as ReturnType<typeof vi.fn>).mockRejectedValue(
        new Error('Network error')
      );

      const changeId = await insertPendingChange(db, {
        collection: 'events',
        operation: 'create'
      });

      await manager.sync();

      const rows = await db.query<{ retry_count: number; last_error: string }>(
        'SELECT retry_count, last_error FROM pending_changes WHERE id = ?',
        [changeId]
      );
      expect(rows[0].retry_count).toBe(1);
      expect(rows[0].last_error).toBe('Network error');
    });

    it('should skip changes with retry_count >= 5', async () => {
      await insertPendingChange(db, {
        collection: 'events',
        operation: 'create',
        retry_count: 5
      });

      await manager.sync();

      // Should NOT have called remote
      expect(remote.events.create).not.toHaveBeenCalled();
    });
  });

  describe('getFailedChanges', () => {
    it('should return changes that have exceeded max retries', async () => {
      await insertPendingChange(db, { retry_count: 5, last_error: 'failed' });
      await insertPendingChange(db, { retry_count: 2 }); // not yet failed

      const failed = await manager.getFailedChanges();
      expect(failed).toHaveLength(1);
      expect(failed[0].retry_count).toBe(5);
    });
  });

  describe('discardChange', () => {
    it('should delete the pending change record', async () => {
      const id = await insertPendingChange(db);

      await manager.discardChange(id);

      const count = await manager.getPendingCount();
      expect(count).toBe(0);
    });
  });

  describe('retryChange', () => {
    it('should reset retry_count and last_error', async () => {
      const id = await insertPendingChange(db, {
        retry_count: 5,
        last_error: 'old error'
      });

      await manager.retryChange(id);

      const rows = await db.query<{ retry_count: number; last_error: string | null }>(
        'SELECT retry_count, last_error FROM pending_changes WHERE id = ?',
        [id]
      );
      expect(rows[0].retry_count).toBe(0);
      expect(rows[0].last_error).toBeNull();
    });
  });

  describe('status', () => {
    it('should start as idle', () => {
      expect(manager.status).toBe('idle');
    });

    it('should transition through syncing to idle on success', async () => {
      const statuses: string[] = [];
      manager.onStatusChange((s) => statuses.push(s));

      await manager.sync();

      expect(statuses).toContain('syncing');
      expect(statuses[statuses.length - 1]).toBe('idle');
    });

    it('should set error status when sync fails', async () => {
      // Make pull fail by making list throw
      (remote.events.list as ReturnType<typeof vi.fn>).mockRejectedValue(
        new Error('Network down')
      );
      // Also make profiles.list throw so pull fully fails
      (remote.profiles.list as ReturnType<typeof vi.fn>).mockRejectedValue(
        new Error('Network down')
      );
      (remote.submissions.getMine as ReturnType<typeof vi.fn>).mockRejectedValue(
        new Error('Network down')
      );

      // A failed pull must surface as an error — the old behavior swallowed
      // it and stamped last_pull_at, showing "Synced" after a total failure.
      await manager.sync();
      expect(manager.status).toBe('error');
    });

    it('should report offline when navigator is offline', async () => {
      // Temporarily set offline
      Object.defineProperty(navigator, 'onLine', { value: false, writable: true, configurable: true });

      await manager.sync();

      expect(manager.status).toBe('offline');

      // Restore online
      Object.defineProperty(navigator, 'onLine', { value: true, writable: true, configurable: true });
    });
  });

  describe('start / stop', () => {
    it('should start and stop without errors', () => {
      manager.start();
      manager.stop();
    });

    it('should not double-start', () => {
      manager.start();
      manager.start(); // should be a no-op
      manager.stop();
    });
  });
});

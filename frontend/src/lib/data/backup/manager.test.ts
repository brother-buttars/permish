import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createTestDatabase, type TestDatabase } from '../test-helpers';
import { initializeLocalSchema } from '../local/schema';
import { BackupManager, type BackupFile } from './manager';
import { createLocalRepository } from '../adapters/local';

// Stub localStorage for the local adapter
vi.stubGlobal('localStorage', {
  getItem: () => null,
  setItem: () => {},
  removeItem: () => {}
});

describe('BackupManager', () => {
  let db: TestDatabase;
  let backupManager: BackupManager;

  beforeEach(async () => {
    db = await createTestDatabase();
    await initializeLocalSchema(db);
    backupManager = new BackupManager(db);
  });

  afterEach(async () => {
    try {
      db.close();
    } catch {
      // already closed
    }
  });

  /** Seed some data into the database for backup tests. */
  async function seedData(): Promise<void> {
    const repo = createLocalRepository(db);
    await repo.auth.register('user@test.com', 'pass', 'Test User', 'planner');
    const { event } = await repo.events.create({
      event_name: 'Camp',
      event_dates: '2026-07-15',
      event_description: 'Fun',
      ward: 'W',
      stake: 'S',
      leader_name: 'L',
      leader_phone: '555',
      leader_email: 'l@t.com'
    });
    await repo.profiles.create({
      participant_name: 'Child',
      participant_dob: '2012-01-01',
      special_diet: false,
      allergies: false,
      chronic_illness: false,
      recent_surgery: false
    });
    await repo.submissions.submit(event.id, {
      participant_name: 'Child',
      participant_dob: '2012-01-01',
      participant_signature_type: 'typed',
      participant_signature_date: '2026-04-04'
    });
    await repo.auth.logout();
  }

  describe('createBackup — unencrypted', () => {
    it('should produce a valid backup blob with metadata', async () => {
      await seedData();

      const { blob, metadata } = await backupManager.createBackup();

      expect(blob).toBeInstanceOf(Blob);
      expect(blob.size).toBeGreaterThan(0);

      expect(metadata.version).toBe(1);
      expect(metadata.schemaVersion).toBe(3);
      expect(metadata.recordCounts.users).toBe(1);
      expect(metadata.recordCounts.events).toBe(1);
      expect(metadata.recordCounts.profiles).toBe(1);
      expect(metadata.recordCounts.submissions).toBe(1);
      expect(metadata.createdAt).toBeTruthy();
    });

    it('should produce valid JSON with correct format field', async () => {
      const { blob } = await backupManager.createBackup();
      const text = await blob.text();
      const parsed: BackupFile = JSON.parse(text);

      expect(parsed.format).toBe('permish-backup');
      expect(parsed.version).toBe(1);
      expect(parsed.encrypted).toBe(false);
      expect(parsed.checksum).toBeTruthy();
      expect(parsed.data).toBeTruthy();
      expect(parsed.salt).toBeUndefined();
      expect(parsed.iv).toBeUndefined();
    });
  });

  describe('createBackup — encrypted', () => {
    it('should produce an encrypted backup with salt and iv', async () => {
      await seedData();

      const { blob } = await backupManager.createBackup('my-secret-passphrase');
      const text = await blob.text();
      const parsed: BackupFile = JSON.parse(text);

      expect(parsed.encrypted).toBe(true);
      expect(parsed.salt).toBeTruthy();
      expect(parsed.iv).toBeTruthy();
      expect(parsed.checksum).toBeTruthy();
    });
  });

  describe('restoreBackup — unencrypted', () => {
    it('should restore data from an unencrypted backup', async () => {
      await seedData();

      const { blob } = await backupManager.createBackup();

      // Create a fresh database and restore into it
      const db2 = await createTestDatabase();
      await initializeLocalSchema(db2);
      const bm2 = new BackupManager(db2);

      const metadata = await bm2.restoreBackup(blob);
      expect(metadata.recordCounts.users).toBe(1);
      expect(metadata.recordCounts.events).toBe(1);

      // Verify data was actually restored
      const users = await db2.query<{ email: string }>('SELECT email FROM users');
      expect(users).toHaveLength(1);
      expect(users[0].email).toBe('user@test.com');

      db2.close();
    });
  });

  describe('restoreBackup — encrypted', () => {
    it('should restore with correct passphrase', async () => {
      await seedData();

      const passphrase = 'correct-horse-battery-staple';
      const { blob } = await backupManager.createBackup(passphrase);

      const db2 = await createTestDatabase();
      await initializeLocalSchema(db2);
      const bm2 = new BackupManager(db2);

      const metadata = await bm2.restoreBackup(blob, passphrase);
      expect(metadata.recordCounts.users).toBe(1);

      const users = await db2.query<{ email: string }>('SELECT email FROM users');
      expect(users).toHaveLength(1);
      expect(users[0].email).toBe('user@test.com');

      db2.close();
    });

    it('should throw with wrong passphrase', async () => {
      await seedData();

      const { blob } = await backupManager.createBackup('right-pass');

      const db2 = await createTestDatabase();
      await initializeLocalSchema(db2);
      const bm2 = new BackupManager(db2);

      await expect(bm2.restoreBackup(blob, 'wrong-pass')).rejects.toThrow(
        'Decryption failed'
      );

      db2.close();
    });

    it('should throw when passphrase is missing for encrypted backup', async () => {
      await seedData();

      const { blob } = await backupManager.createBackup('secret');

      const db2 = await createTestDatabase();
      await initializeLocalSchema(db2);
      const bm2 = new BackupManager(db2);

      await expect(bm2.restoreBackup(blob)).rejects.toThrow(
        'This backup is encrypted'
      );

      db2.close();
    });
  });

  describe('checksum validation', () => {
    it('should detect corrupted backup data', async () => {
      await seedData();

      const { blob } = await backupManager.createBackup();
      const text = await blob.text();
      const parsed: BackupFile = JSON.parse(text);

      // Corrupt the checksum
      parsed.checksum = 'aaaa' + parsed.checksum.slice(4);

      const corruptedBlob = new Blob([JSON.stringify(parsed)], { type: 'application/json' });

      const db2 = await createTestDatabase();
      await initializeLocalSchema(db2);
      const bm2 = new BackupManager(db2);

      await expect(bm2.restoreBackup(corruptedBlob)).rejects.toThrow(
        'Backup integrity check failed'
      );

      db2.close();
    });
  });

  describe('invalid backup format', () => {
    it('should reject non-permish backup files', async () => {
      const fakeBackup = new Blob([JSON.stringify({ format: 'other', version: 1 })], {
        type: 'application/json'
      });

      await expect(backupManager.restoreBackup(fakeBackup)).rejects.toThrow(
        'Invalid backup file format'
      );
    });

    it('should reject unsupported backup version', async () => {
      const fakeBackup = new Blob(
        [JSON.stringify({ format: 'permish-backup', version: 99 })],
        { type: 'application/json' }
      );

      await expect(backupManager.restoreBackup(fakeBackup)).rejects.toThrow(
        'Unsupported backup version'
      );
    });
  });
});

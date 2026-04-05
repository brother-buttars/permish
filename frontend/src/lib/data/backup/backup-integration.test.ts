/**
 * Backup integration tests — verifies that a full round-trip through
 * backup/restore preserves all data with realistic multi-entity scenarios.
 *
 * The existing manager.test.ts covers the basic backup/restore mechanics,
 * checksums, encryption, and format validation. This file focuses on:
 * - Multiple users, events, profiles, and submissions surviving restore
 * - Data field fidelity (all columns present and correct after restore)
 * - Cross-entity relationships intact after restore
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createTestDatabase, type TestDatabase } from '../test-helpers';
import { initializeLocalSchema } from '../local/schema';
import { BackupManager } from './manager';
import { createLocalRepository } from '../adapters/local';
import type { DataRepository } from '../repository';

// Stub localStorage for the local adapter
const localStorageStub: Record<string, string> = {};
vi.stubGlobal('localStorage', {
  getItem: (key: string) => localStorageStub[key] ?? null,
  setItem: (key: string, value: string) => {
    localStorageStub[key] = value;
  },
  removeItem: (key: string) => {
    delete localStorageStub[key];
  }
});

describe('Backup Integration — full round-trip with realistic data', () => {
  let db: TestDatabase;
  let repo: DataRepository;
  let backupManager: BackupManager;

  beforeEach(async () => {
    for (const key of Object.keys(localStorageStub)) {
      delete localStorageStub[key];
    }
    db = await createTestDatabase();
    await initializeLocalSchema(db);
    repo = createLocalRepository(db);
    backupManager = new BackupManager(db);
  });

  afterEach(async () => {
    try {
      await repo.auth.logout();
    } catch {
      // ignore
    }
    try {
      db.close();
    } catch {
      // already closed
    }
  });

  /** Seed a rich dataset with multiple users, events, profiles, and submissions. */
  async function seedRichData() {
    // Register first user (planner)
    const planner = await repo.auth.register(
      'planner@ward.org',
      'plannerPass',
      'John Planner',
      'planner'
    );

    // Create two events
    const { event: campEvent } = await repo.events.create({
      event_name: 'Summer Camp 2026',
      event_dates: '15-18 July 2026',
      event_description: 'Annual youth summer camp at Bear Lake',
      ward: 'Maple Ward',
      stake: 'Cedar Stake',
      leader_name: 'Bishop Smith',
      leader_phone: '801-555-0100',
      leader_email: 'bishop@ward.org',
      organizations: '["deacons","teachers","priests"]',
      additional_details: 'Bring sleeping bags and sunscreen'
    });

    const { event: hikeEvent } = await repo.events.create({
      event_name: 'Mountain Hike',
      event_dates: '3 August 2026',
      event_description: 'Day hike to Timpanogos summit',
      ward: 'Maple Ward',
      stake: 'Cedar Stake',
      leader_name: 'Bro Johnson',
      leader_phone: '801-555-0200',
      leader_email: 'johnson@ward.org'
    });

    // Create child profiles
    const profile1 = await repo.profiles.create({
      participant_name: 'Alice Planner',
      participant_dob: '2012-03-15',
      participant_phone: '801-555-1001',
      address: '123 Main St',
      city: 'Provo',
      state_province: 'UT',
      emergency_contact: 'Jane Planner',
      emergency_phone_primary: '801-555-1000',
      emergency_phone_secondary: '801-555-1002',
      special_diet: true,
      special_diet_details: 'Vegetarian',
      allergies: true,
      allergies_details: 'Peanuts, tree nuts',
      medications: 'EpiPen',
      can_self_administer_meds: false,
      chronic_illness: false,
      recent_surgery: false,
      activity_limitations: 'None',
      youth_program: 'beehives'
    });

    const profile2 = await repo.profiles.create({
      participant_name: 'Bob Planner',
      participant_dob: '2010-08-22',
      special_diet: false,
      allergies: false,
      chronic_illness: true,
      chronic_illness_details: 'Mild asthma',
      recent_surgery: false,
      youth_program: 'teachers'
    });

    // Submit forms for both children to the camp event
    await repo.submissions.submit(campEvent.id, {
      participant_name: 'Alice Planner',
      participant_dob: '2012-03-15',
      participant_phone: '801-555-1001',
      address: '123 Main St',
      city: 'Provo',
      state_province: 'UT',
      emergency_contact: 'Jane Planner',
      emergency_phone_primary: '801-555-1000',
      special_diet: true,
      special_diet_details: 'Vegetarian',
      allergies: true,
      allergies_details: 'Peanuts, tree nuts',
      medications: 'EpiPen',
      can_self_administer_meds: false,
      chronic_illness: false,
      recent_surgery: false,
      participant_signature: 'Alice Planner',
      participant_signature_type: 'typed',
      participant_signature_date: '2026-04-01',
      guardian_signature: 'John Planner',
      guardian_signature_type: 'typed',
      guardian_signature_date: '2026-04-01'
    });

    await repo.submissions.submit(campEvent.id, {
      participant_name: 'Bob Planner',
      participant_dob: '2010-08-22',
      special_diet: false,
      allergies: false,
      chronic_illness: true,
      chronic_illness_details: 'Mild asthma',
      recent_surgery: false,
      participant_signature: 'Bob Planner',
      participant_signature_type: 'typed',
      participant_signature_date: '2026-04-01'
    });

    // Submit form for one child to the hike event
    await repo.submissions.submit(hikeEvent.id, {
      participant_name: 'Bob Planner',
      participant_dob: '2010-08-22',
      participant_signature: 'Bob Planner',
      participant_signature_type: 'typed',
      participant_signature_date: '2026-04-02'
    });

    await repo.auth.logout();

    // Register a second user (parent)
    await repo.auth.register('parent@family.org', 'parentPass', 'Mary Parent', 'parent');

    await repo.profiles.create({
      participant_name: 'Charlie Parent',
      participant_dob: '2013-11-05',
      special_diet: false,
      allergies: false,
      chronic_illness: false,
      recent_surgery: true,
      recent_surgery_details: 'Appendectomy 3 months ago'
    });

    await repo.auth.logout();

    return {
      plannerId: planner.id,
      campEventId: campEvent.id,
      hikeEventId: hikeEvent.id,
      profile1Id: profile1.id,
      profile2Id: profile2.id
    };
  }

  it('should preserve all users after backup/restore', async () => {
    await seedRichData();

    const { blob, metadata } = await backupManager.createBackup();
    expect(metadata.recordCounts.users).toBe(2);

    // Restore into fresh database
    const db2 = await createTestDatabase();
    await initializeLocalSchema(db2);
    const bm2 = new BackupManager(db2);
    await bm2.restoreBackup(blob);

    const users = await db2.query<{ email: string; name: string; role: string }>(
      'SELECT email, name, role FROM users ORDER BY email'
    );
    expect(users).toHaveLength(2);
    expect(users[0].email).toBe('parent@family.org');
    expect(users[0].name).toBe('Mary Parent');
    expect(users[0].role).toBe('parent');
    expect(users[1].email).toBe('planner@ward.org');
    expect(users[1].name).toBe('John Planner');
    expect(users[1].role).toBe('planner');

    db2.close();
  });

  it('should preserve all events with full field fidelity', async () => {
    const { campEventId } = await seedRichData();

    const { blob } = await backupManager.createBackup();

    const db2 = await createTestDatabase();
    await initializeLocalSchema(db2);
    const bm2 = new BackupManager(db2);
    await bm2.restoreBackup(blob);

    const events = await db2.query<any>('SELECT * FROM events ORDER BY event_name');
    expect(events).toHaveLength(2);

    // Verify the hike event
    const hike = events[0];
    expect(hike.event_name).toBe('Mountain Hike');
    expect(hike.event_dates).toBe('3 August 2026');
    expect(hike.event_description).toBe('Day hike to Timpanogos summit');
    expect(hike.leader_name).toBe('Bro Johnson');

    // Verify the camp event has organizations and additional_details
    const camp = events[1];
    expect(camp.event_name).toBe('Summer Camp 2026');
    expect(camp.organizations).toBe('["deacons","teachers","priests"]');
    expect(camp.additional_details).toBe('Bring sleeping bags and sunscreen');
    expect(camp.ward).toBe('Maple Ward');
    expect(camp.stake).toBe('Cedar Stake');

    db2.close();
  });

  it('should preserve all profiles with medical details', async () => {
    await seedRichData();

    const { blob } = await backupManager.createBackup();

    const db2 = await createTestDatabase();
    await initializeLocalSchema(db2);
    const bm2 = new BackupManager(db2);
    await bm2.restoreBackup(blob);

    const profiles = await db2.query<any>(
      'SELECT * FROM child_profiles ORDER BY participant_name'
    );
    expect(profiles).toHaveLength(3);

    // Alice has medical details
    const alice = profiles[0];
    expect(alice.participant_name).toBe('Alice Planner');
    expect(alice.participant_dob).toBe('2012-03-15');
    expect(alice.special_diet).toBe(1); // SQLite integer
    expect(alice.special_diet_details).toBe('Vegetarian');
    expect(alice.allergies).toBe(1);
    expect(alice.allergies_details).toBe('Peanuts, tree nuts');
    expect(alice.medications).toBe('EpiPen');
    expect(alice.youth_program).toBe('beehives');

    // Bob has chronic illness
    const bob = profiles[1];
    expect(bob.participant_name).toBe('Bob Planner');
    expect(bob.chronic_illness).toBe(1);
    expect(bob.chronic_illness_details).toBe('Mild asthma');

    // Charlie has recent surgery
    const charlie = profiles[2];
    expect(charlie.participant_name).toBe('Charlie Parent');
    expect(charlie.recent_surgery).toBe(1);
    expect(charlie.recent_surgery_details).toBe('Appendectomy 3 months ago');

    db2.close();
  });

  it('should preserve all submissions with correct event associations', async () => {
    const { campEventId, hikeEventId } = await seedRichData();

    const { blob, metadata } = await backupManager.createBackup();
    expect(metadata.recordCounts.submissions).toBe(3);

    const db2 = await createTestDatabase();
    await initializeLocalSchema(db2);
    const bm2 = new BackupManager(db2);
    await bm2.restoreBackup(blob);

    // Camp should have 2 submissions
    const campSubs = await db2.query<any>(
      'SELECT * FROM submissions WHERE event_id = ? ORDER BY participant_name',
      [campEventId]
    );
    expect(campSubs).toHaveLength(2);
    expect(campSubs[0].participant_name).toBe('Alice Planner');
    expect(campSubs[0].guardian_signature).toBe('John Planner');
    expect(campSubs[0].special_diet).toBe(1);
    expect(campSubs[1].participant_name).toBe('Bob Planner');
    expect(campSubs[1].chronic_illness).toBe(1);

    // Hike should have 1 submission
    const hikeSubs = await db2.query<any>(
      'SELECT * FROM submissions WHERE event_id = ?',
      [hikeEventId]
    );
    expect(hikeSubs).toHaveLength(1);
    expect(hikeSubs[0].participant_name).toBe('Bob Planner');

    db2.close();
  });

  it('should produce correct metadata record counts for rich data', async () => {
    await seedRichData();

    const { metadata } = await backupManager.createBackup();

    expect(metadata.recordCounts.users).toBe(2);
    expect(metadata.recordCounts.events).toBe(2);
    expect(metadata.recordCounts.profiles).toBe(3);
    expect(metadata.recordCounts.submissions).toBe(3);
    expect(metadata.version).toBe(1);
    expect(metadata.schemaVersion).toBeGreaterThanOrEqual(1);
  });

  it('should preserve data through encrypted round-trip', async () => {
    await seedRichData();

    const passphrase = 'super-secret-backup-key-2026';
    const { blob } = await backupManager.createBackup(passphrase);

    const db2 = await createTestDatabase();
    await initializeLocalSchema(db2);
    const bm2 = new BackupManager(db2);
    const restoredMeta = await bm2.restoreBackup(blob, passphrase);

    expect(restoredMeta.recordCounts.users).toBe(2);
    expect(restoredMeta.recordCounts.events).toBe(2);
    expect(restoredMeta.recordCounts.profiles).toBe(3);
    expect(restoredMeta.recordCounts.submissions).toBe(3);

    // Spot check a specific user survived encryption round-trip
    const users = await db2.query<{ email: string }>('SELECT email FROM users ORDER BY email');
    expect(users[0].email).toBe('parent@family.org');
    expect(users[1].email).toBe('planner@ward.org');

    db2.close();
  });

  it('should allow restored database to be used with local adapter', async () => {
    await seedRichData();

    const { blob } = await backupManager.createBackup();

    // Restore into a fresh database
    const db2 = await createTestDatabase();
    await initializeLocalSchema(db2);
    const bm2 = new BackupManager(db2);
    await bm2.restoreBackup(blob);

    // Create a new repo on the restored database and verify it works
    const repo2 = createLocalRepository(db2);

    // Login as the planner
    const plannerUser = await repo2.auth.login('planner@ward.org', 'plannerPass');
    expect(plannerUser.name).toBe('John Planner');

    // List events — should have 2
    const eventList = await repo2.events.list();
    expect(eventList).toHaveLength(2);

    // List profiles — should have the planner's 2 profiles
    const profileList = await repo2.profiles.list();
    expect(profileList).toHaveLength(2);
    const names = profileList.map((p) => p.participant_name).sort();
    expect(names).toEqual(['Alice Planner', 'Bob Planner']);

    // Check submissions for the camp event
    const campEvent = eventList.find((e) => e.event_name === 'Summer Camp 2026')!;
    const campSubs = await repo2.events.getSubmissions(campEvent.id);
    expect(campSubs).toHaveLength(2);

    await repo2.auth.logout();
    db2.close();
  });
});

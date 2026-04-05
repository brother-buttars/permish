import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createTestDatabase, type TestDatabase } from '../test-helpers';
import { initializeLocalSchema } from '../local/schema';
import { createLocalRepository } from './local';
import type { DataRepository } from '../repository';

// The local adapter uses localStorage for session persistence.
// Provide a minimal stub so tests run in Node.
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

describe('Local SQLite Adapter', () => {
  let db: TestDatabase;
  let repo: DataRepository;

  beforeEach(async () => {
    // Clear localStorage stub
    for (const key of Object.keys(localStorageStub)) {
      delete localStorageStub[key];
    }

    db = await createTestDatabase();
    await initializeLocalSchema(db);
    repo = createLocalRepository(db);
  });

  afterEach(async () => {
    // Reset module-level currentUser by logging out
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

  // -------------------------------------------------------------------------
  // Auth
  // -------------------------------------------------------------------------

  describe('auth', () => {
    it('should register a new user', async () => {
      const user = await repo.auth.register('test@test.com', 'password123', 'Test User', 'parent');
      expect(user.email).toBe('test@test.com');
      expect(user.name).toBe('Test User');
      expect(user.role).toBe('parent');
      expect(user.id).toBeTruthy();
    });

    it('should reject duplicate email registration', async () => {
      await repo.auth.register('dup@test.com', 'pass', 'User1', 'parent');
      await expect(
        repo.auth.register('dup@test.com', 'pass', 'User2', 'parent')
      ).rejects.toThrow('Email already registered');
    });

    it('should login with correct credentials', async () => {
      await repo.auth.register('login@test.com', 'secret', 'Login User', 'planner');
      // logout to clear module-level currentUser
      await repo.auth.logout();

      const user = await repo.auth.login('login@test.com', 'secret');
      expect(user.email).toBe('login@test.com');
      expect(user.name).toBe('Login User');
      expect(user.role).toBe('planner');
    });

    it('should reject login with wrong password', async () => {
      await repo.auth.register('login@test.com', 'secret', 'User', 'parent');
      await repo.auth.logout();

      await expect(repo.auth.login('login@test.com', 'wrong')).rejects.toThrow(
        'Invalid email or password'
      );
    });

    it('should reject login with nonexistent email', async () => {
      await expect(repo.auth.login('nobody@test.com', 'pass')).rejects.toThrow(
        'Invalid email or password'
      );
    });

    it('should return current user after login', async () => {
      await repo.auth.register('cur@test.com', 'pass', 'Current', 'parent');
      const current = await repo.auth.getCurrentUser();
      expect(current).not.toBeNull();
      expect(current!.email).toBe('cur@test.com');
    });

    it('should return null after logout', async () => {
      await repo.auth.register('cur@test.com', 'pass', 'Current', 'parent');
      await repo.auth.logout();
      // getCurrentUser checks localStorage stub, which we cleared
      const current = await repo.auth.getCurrentUser();
      expect(current).toBeNull();
    });

    it('should report isAuthenticated correctly', async () => {
      expect(repo.auth.isAuthenticated()).toBe(false);
      await repo.auth.register('auth@test.com', 'pass', 'Auth', 'parent');
      expect(repo.auth.isAuthenticated()).toBe(true);
      await repo.auth.logout();
      expect(repo.auth.isAuthenticated()).toBe(false);
    });

    it('should update profile fields', async () => {
      await repo.auth.register('profile@test.com', 'pass', 'Original', 'parent');

      const updated = await repo.auth.updateProfile({
        name: 'Updated Name',
        phone: '555-1234',
        city: 'Springfield'
      });

      expect(updated.name).toBe('Updated Name');
      expect(updated.phone).toBe('555-1234');
      expect(updated.city).toBe('Springfield');
    });

    it('should change password with correct current password', async () => {
      await repo.auth.register('pw@test.com', 'oldpass', 'PW User', 'parent');

      // Should not throw
      await repo.auth.changePassword('oldpass', 'newpass');

      // Verify new password works
      await repo.auth.logout();
      const user = await repo.auth.login('pw@test.com', 'newpass');
      expect(user.email).toBe('pw@test.com');
    });

    it('should reject password change with wrong current password', async () => {
      await repo.auth.register('pw@test.com', 'correct', 'PW User', 'parent');

      await expect(repo.auth.changePassword('wrong', 'newpass')).rejects.toThrow(
        'Current password is incorrect'
      );
    });

    it('should call onAuthChange callbacks', async () => {
      const calls: (string | null)[] = [];
      const unsub = repo.auth.onAuthChange!((user) => {
        calls.push(user?.email ?? null);
      });

      await repo.auth.register('cb@test.com', 'pass', 'CB', 'parent');
      await repo.auth.logout();

      expect(calls).toEqual(['cb@test.com', null]);
      unsub();
    });

    it('should throw for forgotPassword in offline mode', async () => {
      await expect(repo.auth.forgotPassword('any@test.com')).rejects.toThrow(
        'Not available in offline mode'
      );
    });

    it('should get profile for authenticated user', async () => {
      await repo.auth.register('gp@test.com', 'pass', 'GP User', 'parent');
      const profile = await repo.auth.getProfile();
      expect(profile.email).toBe('gp@test.com');
    });

    it('should throw when getting profile without auth', async () => {
      await expect(repo.auth.getProfile()).rejects.toThrow('Not authenticated');
    });
  });

  // -------------------------------------------------------------------------
  // Events
  // -------------------------------------------------------------------------

  describe('events', () => {
    beforeEach(async () => {
      await repo.auth.register('planner@test.com', 'pass', 'Planner', 'planner');
    });

    const sampleEvent = {
      event_name: 'Youth Camp',
      event_dates: '15-17 July 2026',
      event_description: 'Annual youth camp',
      ward: 'Test Ward',
      stake: 'Test Stake',
      leader_name: 'John Leader',
      leader_phone: '555-0100',
      leader_email: 'leader@test.com'
    };

    it('should create an event', async () => {
      const { event, formUrl } = await repo.events.create(sampleEvent);
      expect(event.event_name).toBe('Youth Camp');
      expect(event.event_description).toBe('Annual youth camp');
      expect(event.ward).toBe('Test Ward');
      expect(event.id).toBeTruthy();
      expect(event.is_active).toBe(true);
      expect(formUrl).toContain(event.id);
    });

    it('should list events for the current user', async () => {
      await repo.events.create(sampleEvent);
      await repo.events.create({ ...sampleEvent, event_name: 'Hike' });

      const list = await repo.events.list();
      expect(list).toHaveLength(2);
      const names = list.map((e) => e.event_name).sort();
      expect(names).toEqual(['Hike', 'Youth Camp']);
    });

    it('should get event by id', async () => {
      const { event: created } = await repo.events.create(sampleEvent);
      const fetched = await repo.events.getById(created.id);
      expect(fetched.event_name).toBe('Youth Camp');
      expect(fetched.id).toBe(created.id);
    });

    it('should throw when event not found', async () => {
      await expect(repo.events.getById('nonexistent')).rejects.toThrow('Event not found');
    });

    it('should update event fields', async () => {
      const { event } = await repo.events.create(sampleEvent);
      const updated = await repo.events.update(event.id, {
        event_name: 'Updated Camp',
        ward: 'New Ward'
      });
      expect(updated.event_name).toBe('Updated Camp');
      expect(updated.ward).toBe('New Ward');
      // Unchanged fields preserved
      expect(updated.stake).toBe('Test Stake');
    });

    it('should deactivate an event', async () => {
      const { event } = await repo.events.create(sampleEvent);
      await repo.events.deactivate(event.id);

      const fetched = await repo.events.getById(event.id);
      expect(fetched.is_active).toBe(false);
    });

    it('should return submissions for an event', async () => {
      const { event } = await repo.events.create(sampleEvent);

      // Submit a form
      await repo.submissions.submit(event.id, {
        participant_name: 'Jane Doe',
        participant_dob: '2010-05-15',
        participant_signature_type: 'typed',
        participant_signature_date: '2026-04-04'
      });

      const subs = await repo.events.getSubmissions(event.id);
      expect(subs).toHaveLength(1);
      expect(subs[0].participant_name).toBe('Jane Doe');
    });

    it('should include submission_count in event listing', async () => {
      const { event } = await repo.events.create(sampleEvent);
      await repo.submissions.submit(event.id, {
        participant_name: 'Child 1',
        participant_dob: '2010-01-01',
        participant_signature_type: 'typed',
        participant_signature_date: '2026-04-04'
      });
      await repo.submissions.submit(event.id, {
        participant_name: 'Child 2',
        participant_dob: '2011-02-02',
        participant_signature_type: 'typed',
        participant_signature_date: '2026-04-04'
      });

      const list = await repo.events.list();
      expect(list[0].submission_count).toBe(2);
    });

    it('should get all submissions across events for the current planner', async () => {
      const { event: e1 } = await repo.events.create(sampleEvent);
      const { event: e2 } = await repo.events.create({ ...sampleEvent, event_name: 'Hike' });

      await repo.submissions.submit(e1.id, {
        participant_name: 'Child A',
        participant_dob: '2010-01-01',
        participant_signature_type: 'typed',
        participant_signature_date: '2026-04-04'
      });
      await repo.submissions.submit(e2.id, {
        participant_name: 'Child B',
        participant_dob: '2011-02-02',
        participant_signature_type: 'typed',
        participant_signature_date: '2026-04-04'
      });

      const allSubs = await repo.events.getAllSubmissions();
      expect(allSubs).toHaveLength(2);
      // AllSubmission has event_name
      expect(allSubs.map((s) => s.event_name).sort()).toEqual(['Hike', 'Youth Camp']);
    });
  });

  // -------------------------------------------------------------------------
  // Profiles
  // -------------------------------------------------------------------------

  describe('profiles', () => {
    beforeEach(async () => {
      await repo.auth.register('parent@test.com', 'pass', 'Parent', 'parent');
    });

    const sampleProfile = {
      participant_name: 'Alice Smith',
      participant_dob: '2012-03-20',
      participant_phone: '555-CHILD',
      address: '123 Main St',
      city: 'Springfield',
      state_province: 'IL',
      emergency_contact: 'Bob Smith',
      emergency_phone_primary: '555-0001',
      allergies: true,
      allergies_details: 'Peanuts',
      special_diet: false,
      chronic_illness: false,
      recent_surgery: false
    };

    it('should create a profile', async () => {
      const profile = await repo.profiles.create(sampleProfile);
      expect(profile.id).toBeTruthy();
      expect(profile.participant_name).toBe('Alice Smith');
      expect(profile.participant_dob).toBe('2012-03-20');
      expect(profile.allergies).toBe(true);
      expect(profile.allergies_details).toBe('Peanuts');
      expect(profile.special_diet).toBe(false);
    });

    it('should list profiles for current user', async () => {
      await repo.profiles.create(sampleProfile);
      await repo.profiles.create({
        ...sampleProfile,
        participant_name: 'Bob Smith Jr'
      });

      const list = await repo.profiles.list();
      expect(list).toHaveLength(2);
      // Ordered by participant_name
      expect(list[0].participant_name).toBe('Alice Smith');
      expect(list[1].participant_name).toBe('Bob Smith Jr');
    });

    it('should not return profiles from another user', async () => {
      await repo.profiles.create(sampleProfile);

      // Register and login as a different user
      await repo.auth.logout();
      await repo.auth.register('other@test.com', 'pass', 'Other', 'parent');

      const list = await repo.profiles.list();
      expect(list).toHaveLength(0);
    });

    it('should update profile fields', async () => {
      const profile = await repo.profiles.create(sampleProfile);
      const updated = await repo.profiles.update(profile.id, {
        participant_name: 'Alice J. Smith',
        city: 'Shelbyville'
      });

      expect(updated.participant_name).toBe('Alice J. Smith');
      expect(updated.city).toBe('Shelbyville');
      // Unchanged fields preserved
      expect(updated.participant_dob).toBe('2012-03-20');
    });

    it('should update boolean fields correctly', async () => {
      const profile = await repo.profiles.create(sampleProfile);
      const updated = await repo.profiles.update(profile.id, {
        allergies: false,
        chronic_illness: true,
        chronic_illness_details: 'Asthma'
      });

      expect(updated.allergies).toBe(false);
      expect(updated.chronic_illness).toBe(true);
      expect(updated.chronic_illness_details).toBe('Asthma');
    });

    it('should delete a profile', async () => {
      const profile = await repo.profiles.create(sampleProfile);
      await repo.profiles.delete(profile.id);

      const list = await repo.profiles.list();
      expect(list).toHaveLength(0);
    });
  });

  // -------------------------------------------------------------------------
  // Submissions
  // -------------------------------------------------------------------------

  describe('submissions', () => {
    let eventId: string;

    beforeEach(async () => {
      await repo.auth.register('submitter@test.com', 'pass', 'Submitter', 'planner');
      const { event } = await repo.events.create({
        event_name: 'Test Event',
        event_dates: '1 August 2026',
        event_description: 'Test',
        ward: 'Ward',
        stake: 'Stake',
        leader_name: 'Leader',
        leader_phone: '555',
        leader_email: 'l@t.com'
      });
      eventId = event.id;
    });

    const sampleSubmission = {
      participant_name: 'Jane Doe',
      participant_dob: '2010-06-15',
      participant_phone: '555-TEEN',
      address: '456 Oak Ave',
      city: 'Mapleton',
      state_province: 'UT',
      emergency_contact: 'John Doe',
      emergency_phone_primary: '555-9999',
      special_diet: false,
      allergies: false,
      chronic_illness: false,
      recent_surgery: false,
      participant_signature: 'Jane Doe',
      participant_signature_type: 'typed',
      participant_signature_date: '2026-04-04',
      guardian_signature: 'John Doe',
      guardian_signature_type: 'typed',
      guardian_signature_date: '2026-04-04'
    };

    it('should submit a form with computed age', async () => {
      const { submission } = await repo.submissions.submit(eventId, sampleSubmission);
      expect(submission.id).toBeTruthy();
      expect(submission.participant_name).toBe('Jane Doe');
      expect(submission.event_id).toBe(eventId);
      expect(submission.participant_age).toBeGreaterThan(0);
      expect(submission.participant_signature_type).toBe('typed');
      expect(submission.guardian_signature).toBe('John Doe');
    });

    it('should get my submissions', async () => {
      await repo.submissions.submit(eventId, sampleSubmission);

      const mine = await repo.submissions.getMine();
      expect(mine).toHaveLength(1);
      expect(mine[0].participant_name).toBe('Jane Doe');
    });

    it('should get submission by id', async () => {
      const { submission } = await repo.submissions.submit(eventId, sampleSubmission);
      const fetched = await repo.submissions.getById(submission.id);
      expect(fetched.id).toBe(submission.id);
      expect(fetched.participant_name).toBe('Jane Doe');
    });

    it('should throw when submission not found', async () => {
      await expect(repo.submissions.getById('nonexistent')).rejects.toThrow(
        'Submission not found'
      );
    });

    it('should update submission fields', async () => {
      const { submission } = await repo.submissions.submit(eventId, sampleSubmission);
      const updated = await repo.submissions.update(submission.id, {
        participant_name: 'Jane M. Doe',
        city: 'Provo'
      });

      expect(updated.participant_name).toBe('Jane M. Doe');
      expect(updated.city).toBe('Provo');
      // Unchanged fields preserved
      expect(updated.address).toBe('456 Oak Ave');
    });

    it('should recompute age when DOB is updated', async () => {
      const { submission } = await repo.submissions.submit(eventId, sampleSubmission);
      const originalAge = submission.participant_age;

      // Change DOB to a much more recent date
      const updated = await repo.submissions.update(submission.id, {
        participant_dob: '2020-01-01'
      });

      expect(updated.participant_age).not.toBe(originalAge);
      expect(updated.participant_age).toBeLessThan(originalAge);
    });

    it('should delete a submission', async () => {
      const { submission } = await repo.submissions.submit(eventId, sampleSubmission);
      await repo.submissions.delete(submission.id);

      await expect(repo.submissions.getById(submission.id)).rejects.toThrow(
        'Submission not found'
      );
    });

    it('should get form event with attachments', async () => {
      const { event, attachments } = await repo.submissions.getFormEvent(eventId);
      expect(event.id).toBe(eventId);
      expect(event.event_name).toBe('Test Event');
      expect(attachments).toEqual([]);
    });

    it('should return empty string for getPdfUrl in local mode', async () => {
      const url = repo.submissions.getPdfUrl('any-id');
      expect(url).toBe('');
    });

    it('should handle boolean fields correctly', async () => {
      const { submission } = await repo.submissions.submit(eventId, {
        ...sampleSubmission,
        special_diet: true,
        special_diet_details: 'Vegetarian',
        allergies: true,
        allergies_details: 'Peanuts'
      });

      expect(submission.special_diet).toBe(true);
      expect(submission.special_diet_details).toBe('Vegetarian');
      expect(submission.allergies).toBe(true);
      expect(submission.allergies_details).toBe('Peanuts');
    });
  });

  // -------------------------------------------------------------------------
  // Admin
  // -------------------------------------------------------------------------

  describe('admin', () => {
    beforeEach(async () => {
      await repo.auth.register('admin@test.com', 'pass', 'Admin', 'super');
    });

    it('should return system stats', async () => {
      const stats = await repo.admin.getStats();
      expect(stats.userCount).toBe(1);
      expect(stats.eventCount).toBe(0);
      expect(stats.activeEventCount).toBe(0);
      expect(stats.submissionCount).toBe(0);
      expect(stats.profileCount).toBe(0);
    });

    it('should list all users', async () => {
      const users = await repo.admin.listUsers();
      expect(users).toHaveLength(1);
      expect(users[0].email).toBe('admin@test.com');
    });

    it('should get user by id', async () => {
      const users = await repo.admin.listUsers();
      const user = await repo.admin.getUser(users[0].id);
      expect(user.email).toBe('admin@test.com');
    });

    it('should create a user', async () => {
      const user = await repo.admin.createUser({
        email: 'new@test.com',
        password: 'pass',
        name: 'New User',
        role: 'parent'
      });
      expect(user.email).toBe('new@test.com');
      expect(user.role).toBe('parent');
    });

    it('should update user role', async () => {
      const user = await repo.admin.createUser({
        email: 'role@test.com',
        password: 'pass',
        name: 'Role User',
        role: 'parent'
      });
      const updated = await repo.admin.updateRole(user.id, 'planner');
      expect(updated.role).toBe('planner');
    });

    it('should reset user password', async () => {
      const user = await repo.admin.createUser({
        email: 'reset@test.com',
        password: 'oldpass',
        name: 'Reset',
        role: 'parent'
      });

      await repo.admin.resetPassword(user.id, 'newpass');

      // Verify login with new password
      await repo.auth.logout();
      const loggedIn = await repo.auth.login('reset@test.com', 'newpass');
      expect(loggedIn.email).toBe('reset@test.com');
    });

    it('should delete a user and their related data', async () => {
      const user = await repo.admin.createUser({
        email: 'del@test.com',
        password: 'pass',
        name: 'Del',
        role: 'parent'
      });

      await repo.admin.deleteUser(user.id);

      await expect(repo.admin.getUser(user.id)).rejects.toThrow('User not found');
    });
  });
});

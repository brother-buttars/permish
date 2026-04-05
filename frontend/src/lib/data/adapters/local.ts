/**
 * Local SQLite adapter — implements all repository interfaces against an
 * in-browser sql.js database for fully offline operation.
 */

import type { LocalDatabase } from '../local/database';
import type {
  AuthRepository,
  EventRepository,
  ProfileRepository,
  SubmissionRepository,
  AttachmentRepository,
  AdminRepository,
  DataRepository
} from '../repository';
import type {
  User,
  Event,
  ChildProfile,
  Submission,
  AllSubmission,
  Attachment,
  SystemStats
} from '../types';

// ---------------------------------------------------------------------------
// Module-level auth state
// ---------------------------------------------------------------------------

let currentUser: User | null = null;
let authCallbacks: ((user: User | null) => void)[] = [];

function notifyAuthChange(): void {
  for (const cb of authCallbacks) {
    try {
      cb(currentUser);
    } catch {
      // swallow callback errors
    }
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** SHA-256 password hashing (local mode only — device-level security). */
async function hashPassword(password: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(password);
  const hash = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/** Convert SQLite INTEGER (0/1) or JS boolean to boolean. */
function bool(v: unknown): boolean {
  return v === 1 || v === true;
}

/** Convert JS boolean / truthy to SQLite INTEGER. */
function intBool(v: unknown): number {
  return v ? 1 : 0;
}

function computeAge(dob: string): number {
  const birth = new Date(dob);
  const today = new Date();
  let age = today.getFullYear() - birth.getFullYear();
  const m = today.getMonth() - birth.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) age--;
  return age;
}

function now(): string {
  return new Date().toISOString().replace('T', ' ').replace('Z', '').slice(0, 19);
}

// ---------------------------------------------------------------------------
// Row mappers
// ---------------------------------------------------------------------------

function mapUser(row: any): User {
  return {
    id: row.id,
    email: row.email,
    name: row.name,
    role: row.role,
    phone: row.phone || undefined,
    address: row.address || undefined,
    city: row.city || undefined,
    state_province: row.state_province || undefined,
    guardian_signature: row.guardian_signature || undefined,
    guardian_signature_type: row.guardian_signature_type || undefined,
    created_at: row.created
  };
}

function mapEvent(row: any): Event {
  return {
    id: row.id,
    created_by: row.created_by,
    event_name: row.event_name,
    event_dates: row.event_dates,
    event_start: row.event_start || undefined,
    event_end: row.event_end || undefined,
    event_description: row.event_description,
    ward: row.ward,
    stake: row.stake,
    leader_name: row.leader_name,
    leader_phone: row.leader_phone,
    leader_email: row.leader_email,
    notify_email: row.notify_email || undefined,
    notify_phone: row.notify_phone || undefined,
    notify_carrier: row.notify_carrier || undefined,
    organizations: row.organizations || '[]',
    additional_details: row.additional_details || undefined,
    is_active: bool(row.is_active),
    created_at: row.created,
    submission_count: row.submission_count ?? 0
  };
}

function mapProfile(row: any): ChildProfile {
  return {
    id: row.id,
    user_id: row.user_id,
    participant_name: row.participant_name,
    participant_dob: row.participant_dob,
    participant_phone: row.participant_phone || undefined,
    address: row.address || undefined,
    city: row.city || undefined,
    state_province: row.state_province || undefined,
    emergency_contact: row.emergency_contact || undefined,
    emergency_phone_primary: row.emergency_phone_primary || undefined,
    emergency_phone_secondary: row.emergency_phone_secondary || undefined,
    special_diet: bool(row.special_diet),
    special_diet_details: row.special_diet_details || undefined,
    allergies: bool(row.allergies),
    allergies_details: row.allergies_details || undefined,
    medications: row.medications || undefined,
    can_self_administer_meds: row.can_self_administer_meds != null ? bool(row.can_self_administer_meds) : undefined,
    chronic_illness: bool(row.chronic_illness),
    chronic_illness_details: row.chronic_illness_details || undefined,
    recent_surgery: bool(row.recent_surgery),
    recent_surgery_details: row.recent_surgery_details || undefined,
    activity_limitations: row.activity_limitations || undefined,
    other_accommodations: row.other_accommodations || undefined,
    youth_program: row.youth_program || undefined
  };
}

function mapSubmission(row: any): Submission {
  return {
    id: row.id,
    event_id: row.event_id,
    submitted_by: row.submitted_by || undefined,
    participant_name: row.participant_name,
    participant_dob: row.participant_dob,
    participant_age: row.participant_age,
    participant_phone: row.participant_phone || undefined,
    address: row.address || undefined,
    city: row.city || undefined,
    state_province: row.state_province || undefined,
    emergency_contact: row.emergency_contact || undefined,
    emergency_phone_primary: row.emergency_phone_primary || undefined,
    emergency_phone_secondary: row.emergency_phone_secondary || undefined,
    special_diet: bool(row.special_diet),
    special_diet_details: row.special_diet_details || undefined,
    allergies: bool(row.allergies),
    allergies_details: row.allergies_details || undefined,
    medications: row.medications || undefined,
    can_self_administer_meds: row.can_self_administer_meds != null ? bool(row.can_self_administer_meds) : undefined,
    chronic_illness: bool(row.chronic_illness),
    chronic_illness_details: row.chronic_illness_details || undefined,
    recent_surgery: bool(row.recent_surgery),
    recent_surgery_details: row.recent_surgery_details || undefined,
    activity_limitations: row.activity_limitations || undefined,
    other_accommodations: row.other_accommodations || undefined,
    participant_signature: row.participant_signature || undefined,
    participant_signature_type: row.participant_signature_type,
    participant_signature_date: row.participant_signature_date,
    guardian_signature: row.guardian_signature || undefined,
    guardian_signature_type: row.guardian_signature_type || undefined,
    guardian_signature_date: row.guardian_signature_date || undefined,
    submitted_at: row.created,
    pdf_path: row.pdf_path || undefined
  };
}

function mapAttachment(row: any): Attachment {
  return {
    id: row.id,
    event_id: row.event_id,
    filename: row.filename,
    original_name: row.original_name,
    mime_type: row.mime_type,
    size: row.size,
    display_order: row.display_order ?? 0,
    uploaded_at: row.created
  };
}

// ---------------------------------------------------------------------------
// Auth check helper
// ---------------------------------------------------------------------------

function requireUser(): User {
  if (!currentUser) throw new Error('Not authenticated');
  return currentUser;
}

// ---------------------------------------------------------------------------
// Blob URL cache for attachments
// ---------------------------------------------------------------------------

const blobUrlCache = new Map<string, string>();

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

export function createLocalRepository(db: LocalDatabase): DataRepository {
  // -----------------------------------------------------------------------
  // Auth
  // -----------------------------------------------------------------------
  const auth: AuthRepository = {
    async register(email: string, password: string, name: string, role: string): Promise<User> {
      const existing = await db.query('SELECT id FROM users WHERE email = ?', [email]);
      if (existing.length > 0) throw new Error('Email already registered');

      const id = crypto.randomUUID();
      const password_hash = await hashPassword(password);
      const ts = now();

      await db.execute(
        `INSERT INTO users (id, email, password_hash, name, role, created, updated)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [id, email, password_hash, name, role, ts, ts]
      );

      const rows = await db.query('SELECT * FROM users WHERE id = ?', [id]);
      currentUser = mapUser(rows[0]);
      notifyAuthChange();
      return currentUser;
    },

    async login(email: string, password: string): Promise<User> {
      const rows = await db.query<any>('SELECT * FROM users WHERE email = ?', [email]);
      if (rows.length === 0) throw new Error('Invalid email or password');

      const row = rows[0];
      const hash = await hashPassword(password);
      if (hash !== row.password_hash) throw new Error('Invalid email or password');

      currentUser = mapUser(row);
      // Persist login to survive page reload
      localStorage.setItem('permish_local_user_id', currentUser.id);
      notifyAuthChange();
      return currentUser;
    },

    async logout(): Promise<void> {
      currentUser = null;
      localStorage.removeItem('permish_local_user_id');
      notifyAuthChange();
    },

    async getCurrentUser(): Promise<User | null> {
      if (currentUser) return currentUser;

      // Try to restore session from localStorage
      const userId = localStorage.getItem('permish_local_user_id');
      if (!userId) return null;

      const rows = await db.query('SELECT * FROM users WHERE id = ?', [userId]);
      if (rows.length === 0) {
        localStorage.removeItem('permish_local_user_id');
        return null;
      }

      currentUser = mapUser(rows[0]);
      notifyAuthChange();
      return currentUser;
    },

    async getProfile(): Promise<User> {
      return requireUser();
    },

    async updateProfile(data: Partial<User>): Promise<User> {
      const user = requireUser();
      const fields: string[] = [];
      const values: unknown[] = [];

      const allowedFields: (keyof User)[] = [
        'name',
        'phone',
        'address',
        'city',
        'state_province',
        'guardian_signature',
        'guardian_signature_type'
      ];

      for (const key of allowedFields) {
        if (key in data) {
          fields.push(`${key} = ?`);
          values.push(data[key] ?? null);
        }
      }

      if (fields.length === 0) return user;

      fields.push('updated = ?');
      values.push(now());
      values.push(user.id);

      await db.execute(`UPDATE users SET ${fields.join(', ')} WHERE id = ?`, values);

      const rows = await db.query('SELECT * FROM users WHERE id = ?', [user.id]);
      currentUser = mapUser(rows[0]);
      notifyAuthChange();
      return currentUser;
    },

    async changePassword(currentPassword: string, newPassword: string): Promise<void> {
      const user = requireUser();
      const rows = await db.query<any>('SELECT password_hash FROM users WHERE id = ?', [user.id]);
      const currentHash = await hashPassword(currentPassword);
      if (currentHash !== rows[0].password_hash) throw new Error('Current password is incorrect');

      const newHash = await hashPassword(newPassword);
      await db.execute('UPDATE users SET password_hash = ?, updated = ? WHERE id = ?', [
        newHash,
        now(),
        user.id
      ]);
    },

    async forgotPassword(_email: string): Promise<void> {
      throw new Error('Not available in offline mode');
    },

    async resetPassword(_token: string, _newPassword: string): Promise<void> {
      throw new Error('Not available in offline mode');
    },

    isAuthenticated(): boolean {
      return currentUser !== null;
    },

    onAuthChange(callback: (user: User | null) => void): () => void {
      authCallbacks.push(callback);
      return () => {
        authCallbacks = authCallbacks.filter((cb) => cb !== callback);
      };
    }
  };

  // -----------------------------------------------------------------------
  // Events
  // -----------------------------------------------------------------------
  const events: EventRepository = {
    async create(data: Partial<Event>): Promise<{ event: Event; formUrl: string }> {
      const user = requireUser();
      const id = crypto.randomUUID();
      const ts = now();

      await db.execute(
        `INSERT INTO events (
          id, created_by, event_name, event_dates, event_start, event_end,
          event_description, ward, stake, leader_name, leader_phone, leader_email,
          notify_email, notify_phone, notify_carrier, organizations, additional_details,
          is_active, created, updated
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          id,
          user.id,
          data.event_name ?? '',
          data.event_dates ?? '',
          data.event_start ?? null,
          data.event_end ?? null,
          data.event_description ?? '',
          data.ward ?? '',
          data.stake ?? '',
          data.leader_name ?? '',
          data.leader_phone ?? '',
          data.leader_email ?? '',
          data.notify_email ?? null,
          data.notify_phone ?? null,
          data.notify_carrier ?? null,
          data.organizations ?? '[]',
          data.additional_details ?? null,
          1,
          ts,
          ts
        ]
      );

      const rows = await db.query('SELECT * FROM events WHERE id = ?', [id]);
      const event = mapEvent(rows[0]);
      const formUrl = `/form/${id}`;
      return { event, formUrl };
    },

    async list(options?: { all?: boolean }): Promise<Event[]> {
      const user = requireUser();
      let sql: string;
      let params: unknown[];

      if (options?.all) {
        sql = `
          SELECT e.*, COALESCE(sc.cnt, 0) AS submission_count
          FROM events e
          LEFT JOIN (SELECT event_id, COUNT(*) AS cnt FROM submissions GROUP BY event_id) sc
            ON sc.event_id = e.id
          ORDER BY e.created DESC`;
        params = [];
      } else {
        sql = `
          SELECT e.*, COALESCE(sc.cnt, 0) AS submission_count
          FROM events e
          LEFT JOIN (SELECT event_id, COUNT(*) AS cnt FROM submissions GROUP BY event_id) sc
            ON sc.event_id = e.id
          WHERE e.created_by = ?
          ORDER BY e.created DESC`;
        params = [user.id];
      }

      const rows = await db.query(sql, params);
      return rows.map(mapEvent);
    },

    async getById(id: string): Promise<Event> {
      const rows = await db.query(
        `SELECT e.*, COALESCE(sc.cnt, 0) AS submission_count
         FROM events e
         LEFT JOIN (SELECT event_id, COUNT(*) AS cnt FROM submissions GROUP BY event_id) sc
           ON sc.event_id = e.id
         WHERE e.id = ?`,
        [id]
      );
      if (rows.length === 0) throw new Error('Event not found');
      return mapEvent(rows[0]);
    },

    async update(id: string, data: Partial<Event>): Promise<Event> {
      requireUser();
      const fields: string[] = [];
      const values: unknown[] = [];

      const allowedFields: (keyof Event)[] = [
        'event_name',
        'event_dates',
        'event_start',
        'event_end',
        'event_description',
        'ward',
        'stake',
        'leader_name',
        'leader_phone',
        'leader_email',
        'notify_email',
        'notify_phone',
        'notify_carrier',
        'organizations',
        'additional_details'
      ];

      for (const key of allowedFields) {
        if (key in data) {
          fields.push(`${key} = ?`);
          values.push(data[key] ?? null);
        }
      }
      if ('is_active' in data) {
        fields.push('is_active = ?');
        values.push(intBool(data.is_active));
      }

      if (fields.length === 0) {
        return events.getById(id);
      }

      fields.push('updated = ?');
      values.push(now());
      values.push(id);

      await db.execute(`UPDATE events SET ${fields.join(', ')} WHERE id = ?`, values);
      return events.getById(id);
    },

    async deactivate(id: string): Promise<void> {
      requireUser();
      await db.execute('UPDATE events SET is_active = 0, updated = ? WHERE id = ?', [now(), id]);
    },

    async getSubmissions(eventId: string): Promise<Submission[]> {
      requireUser();
      const rows = await db.query('SELECT * FROM submissions WHERE event_id = ? ORDER BY created DESC', [
        eventId
      ]);
      return rows.map(mapSubmission);
    },

    async getAllSubmissions(): Promise<AllSubmission[]> {
      const user = requireUser();
      const rows = await db.query<any>(
        `SELECT s.*, e.event_name, e.event_dates, e.organizations
         FROM submissions s
         JOIN events e ON e.id = s.event_id
         WHERE e.created_by = ?
         ORDER BY s.created DESC`,
        [user.id]
      );
      return rows.map((row: any) => ({
        ...mapSubmission(row),
        event_name: row.event_name,
        event_dates: row.event_dates,
        organizations: row.organizations || '[]'
      }));
    }
  };

  // -----------------------------------------------------------------------
  // Profiles
  // -----------------------------------------------------------------------
  const profiles: ProfileRepository = {
    async list(): Promise<ChildProfile[]> {
      const user = requireUser();
      const rows = await db.query('SELECT * FROM child_profiles WHERE user_id = ? ORDER BY participant_name', [
        user.id
      ]);
      return rows.map(mapProfile);
    },

    async create(data: Partial<ChildProfile>): Promise<ChildProfile> {
      const user = requireUser();
      const id = crypto.randomUUID();
      const ts = now();

      await db.execute(
        `INSERT INTO child_profiles (
          id, user_id, participant_name, participant_dob, participant_phone,
          address, city, state_province,
          emergency_contact, emergency_phone_primary, emergency_phone_secondary,
          special_diet, special_diet_details, allergies, allergies_details,
          medications, can_self_administer_meds,
          chronic_illness, chronic_illness_details,
          recent_surgery, recent_surgery_details,
          activity_limitations, other_accommodations, youth_program,
          created, updated
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          id,
          user.id,
          data.participant_name ?? '',
          data.participant_dob ?? '',
          data.participant_phone ?? null,
          data.address ?? null,
          data.city ?? null,
          data.state_province ?? null,
          data.emergency_contact ?? null,
          data.emergency_phone_primary ?? null,
          data.emergency_phone_secondary ?? null,
          intBool(data.special_diet),
          data.special_diet_details ?? null,
          intBool(data.allergies),
          data.allergies_details ?? null,
          data.medications ?? null,
          data.can_self_administer_meds != null ? intBool(data.can_self_administer_meds) : null,
          intBool(data.chronic_illness),
          data.chronic_illness_details ?? null,
          intBool(data.recent_surgery),
          data.recent_surgery_details ?? null,
          data.activity_limitations ?? null,
          data.other_accommodations ?? null,
          data.youth_program ?? null,
          ts,
          ts
        ]
      );

      const rows = await db.query('SELECT * FROM child_profiles WHERE id = ?', [id]);
      return mapProfile(rows[0]);
    },

    async update(id: string, data: Partial<ChildProfile>): Promise<ChildProfile> {
      requireUser();
      const fields: string[] = [];
      const values: unknown[] = [];

      const stringFields: (keyof ChildProfile)[] = [
        'participant_name',
        'participant_dob',
        'participant_phone',
        'address',
        'city',
        'state_province',
        'emergency_contact',
        'emergency_phone_primary',
        'emergency_phone_secondary',
        'special_diet_details',
        'allergies_details',
        'medications',
        'chronic_illness_details',
        'recent_surgery_details',
        'activity_limitations',
        'other_accommodations',
        'youth_program'
      ];

      const boolFields: (keyof ChildProfile)[] = [
        'special_diet',
        'allergies',
        'chronic_illness',
        'recent_surgery'
      ];

      for (const key of stringFields) {
        if (key in data) {
          fields.push(`${key} = ?`);
          values.push(data[key] ?? null);
        }
      }

      for (const key of boolFields) {
        if (key in data) {
          fields.push(`${key} = ?`);
          values.push(intBool(data[key]));
        }
      }

      if ('can_self_administer_meds' in data) {
        fields.push('can_self_administer_meds = ?');
        values.push(data.can_self_administer_meds != null ? intBool(data.can_self_administer_meds) : null);
      }

      if (fields.length === 0) {
        const rows = await db.query('SELECT * FROM child_profiles WHERE id = ?', [id]);
        return mapProfile(rows[0]);
      }

      fields.push('updated = ?');
      values.push(now());
      values.push(id);

      await db.execute(`UPDATE child_profiles SET ${fields.join(', ')} WHERE id = ?`, values);

      const rows = await db.query('SELECT * FROM child_profiles WHERE id = ?', [id]);
      return mapProfile(rows[0]);
    },

    async delete(id: string): Promise<void> {
      requireUser();
      await db.execute('DELETE FROM child_profiles WHERE id = ?', [id]);
    }
  };

  // -----------------------------------------------------------------------
  // Submissions
  // -----------------------------------------------------------------------
  const submissions: SubmissionRepository = {
    async getFormEvent(eventId: string): Promise<{ event: Event; attachments: Attachment[] }> {
      const event = await events.getById(eventId);
      const attRows = await db.query(
        'SELECT * FROM event_attachments WHERE event_id = ? ORDER BY display_order',
        [eventId]
      );
      return { event, attachments: attRows.map(mapAttachment) };
    },

    async submit(eventId: string, data: Record<string, unknown>): Promise<{ submission: Submission }> {
      const user = requireUser();
      const id = crypto.randomUUID();
      const ts = now();
      const dob = (data.participant_dob as string) ?? '';
      const age = computeAge(dob);

      await db.execute(
        `INSERT INTO submissions (
          id, event_id, submitted_by,
          participant_name, participant_dob, participant_age, participant_phone,
          address, city, state_province,
          emergency_contact, emergency_phone_primary, emergency_phone_secondary,
          special_diet, special_diet_details, allergies, allergies_details,
          medications, can_self_administer_meds,
          chronic_illness, chronic_illness_details,
          recent_surgery, recent_surgery_details,
          activity_limitations, other_accommodations,
          participant_signature, participant_signature_type, participant_signature_date,
          guardian_signature, guardian_signature_type, guardian_signature_date,
          pdf_path, created, updated
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          id,
          eventId,
          user.id,
          data.participant_name ?? '',
          dob,
          age,
          data.participant_phone ?? null,
          data.address ?? null,
          data.city ?? null,
          data.state_province ?? null,
          data.emergency_contact ?? null,
          data.emergency_phone_primary ?? null,
          data.emergency_phone_secondary ?? null,
          intBool(data.special_diet),
          data.special_diet_details ?? null,
          intBool(data.allergies),
          data.allergies_details ?? null,
          data.medications ?? null,
          data.can_self_administer_meds != null ? intBool(data.can_self_administer_meds) : null,
          intBool(data.chronic_illness),
          data.chronic_illness_details ?? null,
          intBool(data.recent_surgery),
          data.recent_surgery_details ?? null,
          data.activity_limitations ?? null,
          data.other_accommodations ?? null,
          data.participant_signature ?? null,
          data.participant_signature_type ?? 'typed',
          data.participant_signature_date ?? ts,
          data.guardian_signature ?? null,
          data.guardian_signature_type ?? null,
          data.guardian_signature_date ?? null,
          null, // pdf_path — not generated in local mode
          ts,
          ts
        ]
      );

      const rows = await db.query('SELECT * FROM submissions WHERE id = ?', [id]);
      return { submission: mapSubmission(rows[0]) };
    },

    async getMine(): Promise<Submission[]> {
      const user = requireUser();
      const rows = await db.query('SELECT * FROM submissions WHERE submitted_by = ? ORDER BY created DESC', [
        user.id
      ]);
      return rows.map(mapSubmission);
    },

    async getById(id: string): Promise<Submission> {
      const rows = await db.query('SELECT * FROM submissions WHERE id = ?', [id]);
      if (rows.length === 0) throw new Error('Submission not found');
      return mapSubmission(rows[0]);
    },

    async update(id: string, data: Record<string, unknown>): Promise<Submission> {
      requireUser();
      const fields: string[] = [];
      const values: unknown[] = [];

      const stringFields = [
        'participant_name',
        'participant_dob',
        'participant_phone',
        'address',
        'city',
        'state_province',
        'emergency_contact',
        'emergency_phone_primary',
        'emergency_phone_secondary',
        'special_diet_details',
        'allergies_details',
        'medications',
        'chronic_illness_details',
        'recent_surgery_details',
        'activity_limitations',
        'other_accommodations',
        'participant_signature',
        'participant_signature_type',
        'participant_signature_date',
        'guardian_signature',
        'guardian_signature_type',
        'guardian_signature_date'
      ];

      const boolFields = [
        'special_diet',
        'allergies',
        'chronic_illness',
        'recent_surgery'
      ];

      for (const key of stringFields) {
        if (key in data) {
          fields.push(`${key} = ?`);
          values.push(data[key] ?? null);
        }
      }

      for (const key of boolFields) {
        if (key in data) {
          fields.push(`${key} = ?`);
          values.push(intBool(data[key]));
        }
      }

      if ('can_self_administer_meds' in data) {
        fields.push('can_self_administer_meds = ?');
        values.push(data.can_self_administer_meds != null ? intBool(data.can_self_administer_meds) : null);
      }

      // Recompute age if DOB changed
      if ('participant_dob' in data && data.participant_dob) {
        fields.push('participant_age = ?');
        values.push(computeAge(data.participant_dob as string));
      }

      if (fields.length === 0) {
        return submissions.getById(id);
      }

      fields.push('updated = ?');
      values.push(now());
      values.push(id);

      await db.execute(`UPDATE submissions SET ${fields.join(', ')} WHERE id = ?`, values);
      return submissions.getById(id);
    },

    async delete(id: string): Promise<void> {
      requireUser();
      await db.execute('DELETE FROM submissions WHERE id = ?', [id]);
    },

    getPdfUrl(submissionId: string): string {
      // PDF generation is not available in local mode
      return '';
    }
  };

  // -----------------------------------------------------------------------
  // Attachments
  // -----------------------------------------------------------------------
  const attachments: AttachmentRepository = {
    async list(eventId: string): Promise<Attachment[]> {
      const rows = await db.query(
        'SELECT * FROM event_attachments WHERE event_id = ? ORDER BY display_order',
        [eventId]
      );
      return rows.map(mapAttachment);
    },

    async upload(eventId: string, file: File): Promise<Attachment> {
      requireUser();
      const id = crypto.randomUUID();
      const ts = now();
      const filename = `${id}_${file.name}`;
      const arrayBuffer = await file.arrayBuffer();
      const blobData = new Uint8Array(arrayBuffer);

      // Get max display_order for this event
      const maxOrder = await db.query<any>(
        'SELECT COALESCE(MAX(display_order), -1) AS max_order FROM event_attachments WHERE event_id = ?',
        [eventId]
      );
      const displayOrder = (maxOrder[0]?.max_order ?? -1) + 1;

      await db.execute(
        `INSERT INTO event_attachments (
          id, event_id, filename, original_name, mime_type, size, display_order, blob_data, created, updated
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [id, eventId, filename, file.name, file.type, file.size, displayOrder, blobData, ts, ts]
      );

      return {
        id,
        event_id: eventId,
        filename,
        original_name: file.name,
        mime_type: file.type,
        size: file.size,
        display_order: displayOrder,
        uploaded_at: ts
      };
    },

    async delete(eventId: string, attachmentId: string): Promise<void> {
      requireUser();
      // Revoke any cached blob URL
      const cacheKey = `${eventId}:${attachmentId}`;
      if (blobUrlCache.has(cacheKey)) {
        URL.revokeObjectURL(blobUrlCache.get(cacheKey)!);
        blobUrlCache.delete(cacheKey);
      }
      await db.execute('DELETE FROM event_attachments WHERE id = ? AND event_id = ?', [
        attachmentId,
        eventId
      ]);
    },

    getUrl(eventId: string, attachmentId: string): string {
      const cacheKey = `${eventId}:${attachmentId}`;
      if (blobUrlCache.has(cacheKey)) return blobUrlCache.get(cacheKey)!;

      // We need to fetch blob data synchronously — getUrl is sync.
      // Use a data URL placeholder initially; actual URL is created lazily.
      // The caller should use getUrlAsync() if possible, but for interface
      // compatibility we kick off an async load and return a placeholder.
      this._loadBlobUrl(eventId, attachmentId);
      return blobUrlCache.get(cacheKey) ?? '';
    },

    // Internal helper — not on the interface but we attach it for the getUrl workaround
    async _loadBlobUrl(eventId: string, attachmentId: string): Promise<string> {
      const cacheKey = `${eventId}:${attachmentId}`;
      if (blobUrlCache.has(cacheKey)) return blobUrlCache.get(cacheKey)!;

      const rows = await db.query<any>(
        'SELECT blob_data, mime_type FROM event_attachments WHERE id = ? AND event_id = ?',
        [attachmentId, eventId]
      );

      if (rows.length === 0) return '';

      const blob = new Blob([rows[0].blob_data], { type: rows[0].mime_type });
      const url = URL.createObjectURL(blob);
      blobUrlCache.set(cacheKey, url);
      return url;
    }
  } as AttachmentRepository & { _loadBlobUrl: (eventId: string, attachmentId: string) => Promise<string> };

  // -----------------------------------------------------------------------
  // Admin
  // -----------------------------------------------------------------------
  const admin: AdminRepository = {
    async getStats(): Promise<SystemStats> {
      const [users, evts, activeEvts, subs, profs] = await Promise.all([
        db.query<any>('SELECT COUNT(*) AS cnt FROM users'),
        db.query<any>('SELECT COUNT(*) AS cnt FROM events'),
        db.query<any>('SELECT COUNT(*) AS cnt FROM events WHERE is_active = 1'),
        db.query<any>('SELECT COUNT(*) AS cnt FROM submissions'),
        db.query<any>('SELECT COUNT(*) AS cnt FROM child_profiles')
      ]);

      return {
        userCount: users[0].cnt,
        eventCount: evts[0].cnt,
        activeEventCount: activeEvts[0].cnt,
        submissionCount: subs[0].cnt,
        profileCount: profs[0].cnt
      };
    },

    async listUsers(): Promise<User[]> {
      const rows = await db.query('SELECT * FROM users ORDER BY created DESC');
      return rows.map(mapUser);
    },

    async getUser(id: string): Promise<User> {
      const rows = await db.query('SELECT * FROM users WHERE id = ?', [id]);
      if (rows.length === 0) throw new Error('User not found');
      return mapUser(rows[0]);
    },

    async createUser(data: { email: string; password: string; name: string; role: string }): Promise<User> {
      const existing = await db.query('SELECT id FROM users WHERE email = ?', [data.email]);
      if (existing.length > 0) throw new Error('Email already registered');

      const id = crypto.randomUUID();
      const password_hash = await hashPassword(data.password);
      const ts = now();

      await db.execute(
        `INSERT INTO users (id, email, password_hash, name, role, created, updated)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [id, data.email, password_hash, data.name, data.role, ts, ts]
      );

      const rows = await db.query('SELECT * FROM users WHERE id = ?', [id]);
      return mapUser(rows[0]);
    },

    async updateRole(id: string, role: string): Promise<User> {
      await db.execute('UPDATE users SET role = ?, updated = ? WHERE id = ?', [role, now(), id]);
      const rows = await db.query('SELECT * FROM users WHERE id = ?', [id]);
      if (rows.length === 0) throw new Error('User not found');
      return mapUser(rows[0]);
    },

    async resetPassword(id: string, newPassword: string): Promise<void> {
      const hash = await hashPassword(newPassword);
      await db.execute('UPDATE users SET password_hash = ?, updated = ? WHERE id = ?', [hash, now(), id]);
    },

    async deleteUser(id: string): Promise<void> {
      // Delete related data first (cascade not enforced in all sql.js modes)
      await db.execute('DELETE FROM submissions WHERE submitted_by = ?', [id]);
      await db.execute('DELETE FROM child_profiles WHERE user_id = ?', [id]);
      await db.execute('DELETE FROM events WHERE created_by = ?', [id]);
      await db.execute('DELETE FROM users WHERE id = ?', [id]);
    }
  };

  // -----------------------------------------------------------------------
  // Assemble the DataRepository
  // -----------------------------------------------------------------------
  return {
    auth,
    events,
    profiles,
    submissions,
    attachments,
    admin
  };
}

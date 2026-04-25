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
  GroupRepository,
  DataRepository
} from '../repository';
import type {
  User,
  Event,
  ChildProfile,
  Submission,
  AllSubmission,
  Attachment,
  SystemStats,
  Group,
  GroupDetail,
  GroupMember
} from '../types';
import { computeAge } from '../../utils/age';

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

function now(): string {
  return new Date().toISOString().replace('T', ' ').replace('Z', '').slice(0, 19);
}

async function ensureParentMembership(db: LocalDatabase, parentId: string, userId: string): Promise<void> {
  const existing = await db.query(
    'SELECT id FROM group_members WHERE group_id = ? AND user_id = ?',
    [parentId, userId]
  );
  if (existing.length === 0) {
    await db.execute(
      'INSERT INTO group_members (id, group_id, user_id, role, joined_at) VALUES (?, ?, ?, ?, ?)',
      [crypto.randomUUID(), parentId, userId, 'member', now()]
    );
  }
}

async function isLocalEffectiveAdmin(db: LocalDatabase, groupId: string, user: { id: string; role: string }): Promise<boolean> {
  if (user.role === 'super') return true;
  const visited = new Set<string>();
  let cursor: string | undefined = groupId;
  while (cursor && !visited.has(cursor)) {
    visited.add(cursor);
    const m: any[] = await db.query(
      'SELECT role FROM group_members WHERE group_id = ? AND user_id = ?',
      [cursor, user.id]
    );
    if (m.length > 0 && m[0].role === 'admin') return true;
    const g: any[] = await db.query('SELECT parent_id FROM groups WHERE id = ?', [cursor]);
    cursor = g.length > 0 && g[0].parent_id ? String(g[0].parent_id) : undefined;
  }
  return false;
}

async function countLocalAdmins(db: LocalDatabase, groupId: string): Promise<number> {
  const rows: any[] = await db.query(
    "SELECT COUNT(*) as n FROM group_members WHERE group_id = ? AND role = 'admin'",
    [groupId]
  );
  return rows.length > 0 ? Number(rows[0].n) : 0;
}

async function addLocalMembershipWithPropagation(
  db: LocalDatabase,
  groupId: string,
  userId: string,
  role: 'admin' | 'member'
): Promise<void> {
  const existing: any[] = await db.query(
    'SELECT id, role FROM group_members WHERE group_id = ? AND user_id = ?',
    [groupId, userId]
  );
  if (existing.length === 0) {
    await db.execute(
      'INSERT INTO group_members (id, group_id, user_id, role, joined_at) VALUES (?, ?, ?, ?, ?)',
      [crypto.randomUUID(), groupId, userId, role, now()]
    );
  } else if (role === 'admin') {
    await db.execute('UPDATE group_members SET role = ? WHERE id = ?', [role, existing[0].id]);
  }
  // Walk parent chain
  const visited = new Set<string>();
  let cursor: string | undefined = groupId;
  while (cursor && !visited.has(cursor)) {
    visited.add(cursor);
    const g: any[] = await db.query('SELECT parent_id FROM groups WHERE id = ?', [cursor]);
    const next = g.length > 0 && g[0].parent_id ? String(g[0].parent_id) : undefined;
    if (next) {
      await ensureParentMembership(db, next, userId);
    }
    cursor = next;
  }
}

function generateInviteCode(): string {
  const bytes = new Uint8Array(4);
  crypto.getRandomValues(bytes);
  return Array.from(bytes).map((b) => b.toString(16).padStart(2, '0')).join('').toUpperCase();
}

function generateInviteToken(): string {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  // base64url
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

interface LocalInviteRow {
  id: string;
  group_id: string;
  code: string | null;
  token: string;
  role: 'admin' | 'member';
  email: string | null;
  max_uses: number | null;
  used_count: number;
  expires_at: string | null;
  revoked_at: string | null;
  accepted_at: string | null;
  created_at: string;
}

async function collectGroupAndDescendantIds(db: LocalDatabase, rootId: string): Promise<string[]> {
  const out = [rootId];
  const queue = [rootId];
  const visited = new Set<string>([rootId]);
  while (queue.length > 0) {
    const id = queue.shift()!;
    const children: any[] = await db.query('SELECT id FROM groups WHERE parent_id = ?', [id]);
    for (const c of children) {
      if (!visited.has(c.id)) {
        visited.add(c.id);
        out.push(c.id);
        queue.push(c.id);
      }
    }
  }
  return out;
}

function safeJsonParse(s: string): unknown {
  try { return JSON.parse(s); } catch { return null; }
}

function inviteUsable(invite: LocalInviteRow | undefined): { ok: boolean; reason?: string } {
  if (!invite) return { ok: false, reason: 'not_found' };
  if (invite.revoked_at) return { ok: false, reason: 'revoked' };
  if (invite.accepted_at) return { ok: false, reason: 'accepted' };
  if (invite.expires_at && new Date(invite.expires_at) < new Date()) return { ok: false, reason: 'expired' };
  if (invite.max_uses != null && invite.used_count >= invite.max_uses) return { ok: false, reason: 'exhausted' };
  return { ok: true };
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
  // Groups
  // -----------------------------------------------------------------------
  const groups: GroupRepository = {
    async list(): Promise<Group[]> {
      const user = requireUser();
      const rows = await db.query<any>(
        `SELECT g.*, gm.role AS member_role,
          (SELECT COUNT(*) FROM group_members WHERE group_id = g.id) AS member_count
         FROM groups g
         JOIN group_members gm ON gm.group_id = g.id AND gm.user_id = ?
         ORDER BY g.name`,
        [user.id]
      );
      return rows.map((row: any) => ({
        id: row.id,
        name: row.name,
        type: row.type,
        parent_id: row.parent_id || undefined,
        ward: row.ward || undefined,
        stake: row.stake || undefined,
        leader_name: row.leader_name || undefined,
        leader_phone: row.leader_phone || undefined,
        leader_email: row.leader_email || undefined,
        invite_code: row.invite_code || undefined,
        member_role: row.member_role,
        member_count: row.member_count,
        created_at: row.created
      }));
    },

    async getById(id: string): Promise<GroupDetail> {
      const rows = await db.query<any>('SELECT * FROM groups WHERE id = ?', [id]);
      if (rows.length === 0) throw new Error('Group not found');
      const row = rows[0];

      // Get members
      const memberRows = await db.query<any>(
        `SELECT gm.id AS membership_id, gm.user_id, u.name, u.email, gm.role, gm.joined_at
         FROM group_members gm
         JOIN users u ON u.id = gm.user_id
         WHERE gm.group_id = ?
         ORDER BY gm.joined_at`,
        [id]
      );
      const members: GroupMember[] = memberRows.map((m: any) => ({
        membership_id: m.membership_id,
        user_id: m.user_id,
        name: m.name,
        email: m.email,
        role: m.role,
        joined_at: m.joined_at
      }));

      // Get subgroups
      const subgroupRows = await db.query<any>(
        'SELECT id, name, type, ward FROM groups WHERE parent_id = ?',
        [id]
      );
      const subgroups = subgroupRows.map((s: any) => ({
        id: s.id,
        name: s.name,
        type: s.type,
        ward: s.ward || undefined
      }));

      // Get parent
      let parent: Group['parent'];
      if (row.parent_id) {
        const parentRows = await db.query<any>(
          'SELECT id, name, type, stake FROM groups WHERE id = ?',
          [row.parent_id]
        );
        if (parentRows.length > 0) {
          parent = {
            id: parentRows[0].id,
            name: parentRows[0].name,
            type: parentRows[0].type,
            stake: parentRows[0].stake || undefined
          };
        }
      }

      // Effective admin: walk parent chain looking for admin membership (or super)
      const currentUser = requireUser();
      let effectiveAdmin: boolean = currentUser.role === 'super';
      if (!effectiveAdmin) {
        const visited = new Set<string>();
        let cursorId: string | undefined = id;
        while (cursorId && !visited.has(cursorId)) {
          visited.add(cursorId);
          const memberRows: any[] = await db.query(
            'SELECT role FROM group_members WHERE group_id = ? AND user_id = ?',
            [cursorId, currentUser.id]
          );
          if (memberRows.length > 0 && memberRows[0].role === 'admin') {
            effectiveAdmin = true;
            break;
          }
          const groupRows: any[] = await db.query('SELECT parent_id FROM groups WHERE id = ?', [cursorId]);
          const nextParentId: string | undefined = groupRows.length > 0 && groupRows[0].parent_id ? String(groupRows[0].parent_id) : undefined;
          cursorId = nextParentId;
        }
      }

      return {
        id: row.id,
        name: row.name,
        type: row.type,
        parent_id: row.parent_id || undefined,
        ward: row.ward || undefined,
        stake: row.stake || undefined,
        leader_name: row.leader_name || undefined,
        leader_phone: row.leader_phone || undefined,
        leader_email: row.leader_email || undefined,
        invite_code: row.invite_code || undefined,
        member_count: members.length,
        created_at: row.created,
        members,
        subgroups,
        parent,
        effective_admin: effectiveAdmin
      };
    },

    async create(data: { name: string; type: string; parent_id?: string; ward?: string; stake?: string; leader_name?: string; leader_phone?: string; leader_email?: string; send_leader_invite?: boolean }): Promise<Group> {
      const user = requireUser();
      const id = crypto.randomUUID();
      const inviteCode = generateInviteCode();
      const ts = now();

      await db.execute(
        `INSERT INTO groups (id, name, type, parent_id, ward, stake, leader_name, leader_phone, leader_email, invite_code, created, updated)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [id, data.name, data.type, data.parent_id ?? null, data.ward ?? null, data.stake ?? null, data.leader_name ?? null, data.leader_phone ?? null, data.leader_email ?? null, inviteCode, ts, ts]
      );

      // Auto-add creator as admin
      await db.execute(
        `INSERT INTO group_members (id, group_id, user_id, role, joined_at) VALUES (?, ?, ?, ?, ?)`,
        [crypto.randomUUID(), id, user.id, 'admin', ts]
      );

      // Seed default member-role shareable invite
      await db.execute(
        `INSERT INTO group_invites (id, group_id, code, token, role, used_count, created_by, created_at)
         VALUES (?, ?, ?, ?, 'member', 0, ?, ?)`,
        [crypto.randomUUID(), id, inviteCode, generateInviteToken(), user.id, ts]
      );

      // Optional admin-role invite for the leader
      if (data.send_leader_invite && data.leader_email) {
        await db.execute(
          `INSERT INTO group_invites (id, group_id, code, token, role, email, max_uses, used_count, created_by, created_at)
           VALUES (?, ?, NULL, ?, 'admin', ?, 1, 0, ?, ?)`,
          [crypto.randomUUID(), id, generateInviteToken(), data.leader_email, user.id, ts]
        );
      }

      return {
        id,
        name: data.name,
        type: data.type as Group['type'],
        parent_id: data.parent_id,
        ward: data.ward,
        stake: data.stake,
        leader_name: data.leader_name,
        leader_phone: data.leader_phone,
        leader_email: data.leader_email,
        invite_code: inviteCode,
        member_role: 'admin',
        member_count: 1,
        created_at: ts
      };
    },

    async update(id: string, data: Partial<Group>): Promise<Group> {
      const user = requireUser();
      if (!(await isLocalEffectiveAdmin(db, id, user))) throw new Error('Must be a group admin');
      const fields: string[] = [];
      const values: unknown[] = [];

      const allowedFields = ['name', 'type', 'parent_id', 'ward', 'stake', 'leader_name', 'leader_phone', 'leader_email'] as const;
      for (const key of allowedFields) {
        if (key in data) {
          fields.push(`${key} = ?`);
          values.push((data as any)[key] ?? null);
        }
      }

      if (fields.length === 0) {
        return (await groups.getById(id)) as Group;
      }

      fields.push('updated = ?');
      values.push(now());
      values.push(id);

      await db.execute(`UPDATE groups SET ${fields.join(', ')} WHERE id = ?`, values);

      const rows = await db.query<any>('SELECT * FROM groups WHERE id = ?', [id]);
      const row = rows[0];
      return {
        id: row.id,
        name: row.name,
        type: row.type,
        parent_id: row.parent_id || undefined,
        ward: row.ward || undefined,
        stake: row.stake || undefined,
        leader_name: row.leader_name || undefined,
        leader_phone: row.leader_phone || undefined,
        leader_email: row.leader_email || undefined,
        invite_code: row.invite_code || undefined,
        created_at: row.created
      };
    },

    async join(inviteCode: string): Promise<{ group: Group; message: string }> {
      const user = requireUser();
      const code = String(inviteCode).toUpperCase();
      const inviteRows: any[] = await db.query('SELECT * FROM group_invites WHERE code = ?', [code]);
      const invite = inviteRows[0] as LocalInviteRow | undefined;
      const usable = inviteUsable(invite);
      if (!usable.ok) throw new Error(`Invite ${usable.reason}`);

      const groupRows = await db.query<any>('SELECT * FROM groups WHERE id = ?', [invite!.group_id]);
      if (groupRows.length === 0) throw new Error('Group not found');
      const row = groupRows[0];

      const existing = await db.query(
        'SELECT id FROM group_members WHERE group_id = ? AND user_id = ?',
        [row.id, user.id]
      );
      if (existing.length > 0) throw new Error('Already a member of this group');

      await addLocalMembershipWithPropagation(db, row.id, user.id, invite!.role);
      await db.execute('UPDATE group_invites SET used_count = used_count + 1 WHERE id = ?', [invite!.id]);

      const group: Group = {
        id: row.id,
        name: row.name,
        type: row.type,
        parent_id: row.parent_id || undefined,
        ward: row.ward || undefined,
        stake: row.stake || undefined,
        member_role: invite!.role,
        created_at: row.created
      };

      return { group, message: `Joined ${group.name}` };
    },

    async invite(groupId: string, email: string, role?: string): Promise<{ message: string; invite: import('../types').GroupInvite }> {
      const user = requireUser();
      if (!(await isLocalEffectiveAdmin(db, groupId, user))) throw new Error('Must be a group admin to invite');
      const inviteRole = role === 'admin' ? 'admin' : 'member';

      // Reject if a registered user is already a member
      const userRows = await db.query<any>('SELECT id FROM users WHERE email = ?', [email]);
      if (userRows.length > 0) {
        const member = await db.query(
          'SELECT id FROM group_members WHERE group_id = ? AND user_id = ?',
          [groupId, userRows[0].id]
        );
        if (member.length > 0) throw new Error('User is already a member');
      }

      const id = crypto.randomUUID();
      const token = generateInviteToken();
      const ts = now();
      await db.execute(
        `INSERT INTO group_invites (id, group_id, code, token, role, email, max_uses, used_count, created_by, created_at)
         VALUES (?, ?, NULL, ?, ?, ?, 1, 0, ?, ?)`,
        [id, groupId, token, inviteRole, email, user.id, ts]
      );
      const rows: any[] = await db.query('SELECT * FROM group_invites WHERE id = ?', [id]);
      return { message: `Invite created for ${email}`, invite: rows[0] };
    },

    async updateMemberRole(groupId: string, userId: string, role: string): Promise<void> {
      const user = requireUser();
      if (!(await isLocalEffectiveAdmin(db, groupId, user))) throw new Error('Must be a group admin');
      if (!['admin', 'member'].includes(role)) throw new Error('Invalid role');

      const target: any[] = await db.query(
        'SELECT id, role FROM group_members WHERE group_id = ? AND user_id = ?',
        [groupId, userId]
      );
      if (target.length === 0) throw new Error('Member not found');

      if (target[0].role === 'admin' && role === 'member' && (await countLocalAdmins(db, groupId)) <= 1) {
        throw new Error('Cannot demote the last admin of this group');
      }

      await db.execute(
        'UPDATE group_members SET role = ? WHERE group_id = ? AND user_id = ?',
        [role, groupId, userId]
      );
    },

    async removeMember(groupId: string, userId: string): Promise<void> {
      const user = requireUser();
      const isSelf = user.id === userId;
      if (!isSelf && !(await isLocalEffectiveAdmin(db, groupId, user))) {
        throw new Error('Must be a group admin to remove members');
      }
      const target: any[] = await db.query(
        'SELECT role FROM group_members WHERE group_id = ? AND user_id = ?',
        [groupId, userId]
      );
      if (target.length === 0) throw new Error('Member not found');
      if (target[0].role === 'admin' && (await countLocalAdmins(db, groupId)) <= 1) {
        throw new Error('Cannot remove the last admin of this group');
      }
      await db.execute(
        'DELETE FROM group_members WHERE group_id = ? AND user_id = ?',
        [groupId, userId]
      );
    },

    async regenerateInvite(groupId: string): Promise<{ invite_code: string }> {
      const user = requireUser();
      if (!(await isLocalEffectiveAdmin(db, groupId, user))) throw new Error('Must be a group admin');
      const newCode = generateInviteCode();
      const ts = now();
      // Revoke existing default codes
      await db.execute(
        `UPDATE group_invites SET revoked_at = ? WHERE group_id = ? AND code IS NOT NULL AND revoked_at IS NULL`,
        [ts, groupId]
      );
      await db.execute(
        `INSERT INTO group_invites (id, group_id, code, token, role, used_count, created_by, created_at)
         VALUES (?, ?, ?, ?, 'member', 0, ?, ?)`,
        [crypto.randomUUID(), groupId, newCode, generateInviteToken(), user.id, ts]
      );
      await db.execute('UPDATE groups SET invite_code = ?, updated = ? WHERE id = ?', [newCode, ts, groupId]);
      return { invite_code: newCode };
    },

    async listInvites(groupId: string): Promise<import('../types').GroupInvite[]> {
      const user = requireUser();
      if (!(await isLocalEffectiveAdmin(db, groupId, user))) throw new Error('Must be a group admin');
      const rows: any[] = await db.query(
        `SELECT id, group_id, code, token, role, email, max_uses, used_count, expires_at, revoked_at, accepted_at, created_at
         FROM group_invites WHERE group_id = ? ORDER BY created_at DESC`,
        [groupId]
      );
      return rows;
    },

    async createInvite(groupId: string, body: { role?: 'admin' | 'member'; email?: string; max_uses?: number; expires_at?: string }): Promise<import('../types').GroupInvite> {
      const user = requireUser();
      if (!(await isLocalEffectiveAdmin(db, groupId, user))) throw new Error('Must be a group admin');
      const inviteRole: 'admin' | 'member' = body?.role === 'admin' ? 'admin' : 'member';
      const isEmail = !!body?.email;
      const id = crypto.randomUUID();
      const code = isEmail ? null : generateInviteCode();
      const token = generateInviteToken();
      const maxUses = isEmail ? 1 : (Number.isInteger(body?.max_uses) && body!.max_uses! > 0 ? body!.max_uses! : null);
      const expires = body?.expires_at ? new Date(body.expires_at).toISOString() : null;
      const ts = now();
      await db.execute(
        `INSERT INTO group_invites (id, group_id, code, token, role, email, max_uses, used_count, expires_at, created_by, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?)`,
        [id, groupId, code, token, inviteRole, body?.email ?? null, maxUses, expires, user.id, ts]
      );
      const rows: any[] = await db.query('SELECT * FROM group_invites WHERE id = ?', [id]);
      return rows[0];
    },

    async revokeInvite(groupId: string, inviteId: string): Promise<void> {
      const user = requireUser();
      if (!(await isLocalEffectiveAdmin(db, groupId, user))) throw new Error('Must be a group admin');
      await db.execute(
        `UPDATE group_invites SET revoked_at = ? WHERE id = ? AND group_id = ? AND revoked_at IS NULL`,
        [now(), inviteId, groupId]
      );
    },

    async previewInvite(token: string): Promise<import('../types').InvitePreview> {
      const rows: any[] = await db.query('SELECT * FROM group_invites WHERE token = ?', [token]);
      const invite = rows[0] as LocalInviteRow | undefined;
      const usable = inviteUsable(invite);
      if (!usable.ok) throw new Error(`Invite ${usable.reason}`);
      const groupRows: any[] = await db.query(
        'SELECT id, name, type, ward, stake FROM groups WHERE id = ?',
        [invite!.group_id]
      );
      if (groupRows.length === 0) throw new Error('Group not found');
      return {
        invite: { role: invite!.role, email: invite!.email, expires_at: invite!.expires_at },
        group: groupRows[0],
      };
    },

    async getAuditLog(groupId: string, opts?: { limit?: number; before?: string }): Promise<import('../types').AuditEntry[]> {
      const user = requireUser();
      if (!(await isLocalEffectiveAdmin(db, groupId, user))) throw new Error('Must be a group admin');
      const ids = await collectGroupAndDescendantIds(db, groupId);
      if (ids.length === 0) return [];
      const placeholders = ids.map(() => '?').join(',');
      const params: any[] = [...ids];
      let cursor = '';
      if (opts?.before) { cursor = ' AND a.created_at < ?'; params.push(opts.before); }
      params.push(Math.min(opts?.limit ?? 100, 500));
      const rows: any[] = await db.query(
        `SELECT a.id, a.actor_id, a.action, a.target_type, a.target_id, a.group_id, a.meta, a.created_at,
                u.name AS actor_name, u.email AS actor_email
         FROM audit_log a
         LEFT JOIN users u ON u.id = a.actor_id
         WHERE a.group_id IN (${placeholders})${cursor}
         ORDER BY a.created_at DESC, a.id DESC
         LIMIT ?`,
        params
      );
      return rows.map((r) => ({
        ...r,
        meta: r.meta ? safeJsonParse(r.meta) : null,
      }));
    },

    async acceptInvite(token: string): Promise<{ group: Group; message: string }> {
      const user = requireUser();
      const rows: any[] = await db.query('SELECT * FROM group_invites WHERE token = ?', [token]);
      const invite = rows[0] as LocalInviteRow | undefined;
      const usable = inviteUsable(invite);
      if (!usable.ok) throw new Error(`Invite ${usable.reason}`);
      if (invite!.email && user.email && invite!.email.toLowerCase() !== user.email.toLowerCase()) {
        throw new Error('This invite was sent to a different email address');
      }
      const groupRows: any[] = await db.query('SELECT * FROM groups WHERE id = ?', [invite!.group_id]);
      if (groupRows.length === 0) throw new Error('Group not found');
      const row = groupRows[0];

      const existing = await db.query(
        'SELECT id FROM group_members WHERE group_id = ? AND user_id = ?',
        [row.id, user.id]
      );
      const ts = now();
      if (existing.length === 0) {
        await addLocalMembershipWithPropagation(db, row.id, user.id, invite!.role);
        await db.execute('UPDATE group_invites SET used_count = used_count + 1 WHERE id = ?', [invite!.id]);
      }
      if (invite!.max_uses === 1) {
        await db.execute(
          `UPDATE group_invites SET accepted_at = ?, accepted_by = ? WHERE id = ?`,
          [ts, user.id, invite!.id]
        );
      }

      const group: Group = {
        id: row.id,
        name: row.name,
        type: row.type,
        parent_id: row.parent_id || undefined,
        ward: row.ward || undefined,
        stake: row.stake || undefined,
        member_role: invite!.role,
        created_at: row.created,
      };
      return { group, message: existing.length > 0 ? `Already a member of ${group.name}` : `Joined ${group.name}` };
    },
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
    admin,
    groups
  };
}

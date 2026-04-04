import PocketBase, { type RecordModel } from 'pocketbase';
import type {
  AuthRepository,
  EventRepository,
  ProfileRepository,
  SubmissionRepository,
  AttachmentRepository,
  AdminRepository,
  SubscriptionManager,
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
  RealtimeEvent
} from '../types';

const PB_URL = import.meta.env.PUBLIC_PB_URL || 'http://localhost:8090';
const SIDECAR_URL = import.meta.env.PUBLIC_SIDECAR_URL || 'http://localhost:3002';

const pb = new PocketBase(PB_URL);

// ---------------------------------------------------------------------------
// Mapper functions — PocketBase records → domain types
// ---------------------------------------------------------------------------

function mapUser(r: RecordModel): User {
  return {
    id: r.id,
    email: r.email,
    name: r.name,
    role: r.role,
    phone: r.phone || undefined,
    address: r.address || undefined,
    city: r.city || undefined,
    state_province: r.state_province || undefined,
    guardian_signature: r.guardian_signature || undefined,
    guardian_signature_type: r.guardian_signature_type || undefined,
    created_at: r.created
  };
}

function mapEvent(r: RecordModel): Event {
  return {
    id: r.id,
    created_by: r.created_by,
    event_name: r.event_name,
    event_dates: r.event_dates,
    event_start: r.event_start || undefined,
    event_end: r.event_end || undefined,
    event_description: r.event_description,
    ward: r.ward,
    stake: r.stake,
    leader_name: r.leader_name,
    leader_phone: r.leader_phone,
    leader_email: r.leader_email,
    notify_email: r.notify_email || undefined,
    notify_phone: r.notify_phone || undefined,
    notify_carrier: r.notify_carrier || undefined,
    organizations: r.organizations || '[]',
    additional_details: r.additional_details || undefined,
    is_active: r.is_active,
    created_at: r.created,
    submission_count: undefined
  };
}

function mapProfile(r: RecordModel): ChildProfile {
  return {
    id: r.id,
    user_id: r.user_id,
    participant_name: r.participant_name,
    participant_dob: r.participant_dob,
    participant_phone: r.participant_phone || undefined,
    address: r.address || undefined,
    city: r.city || undefined,
    state_province: r.state_province || undefined,
    emergency_contact: r.emergency_contact || undefined,
    emergency_phone_primary: r.emergency_phone_primary || undefined,
    emergency_phone_secondary: r.emergency_phone_secondary || undefined,
    special_diet: r.special_diet,
    special_diet_details: r.special_diet_details || undefined,
    allergies: r.allergies,
    allergies_details: r.allergies_details || undefined,
    medications: r.medications || undefined,
    can_self_administer_meds: r.can_self_administer_meds ?? undefined,
    chronic_illness: r.chronic_illness,
    chronic_illness_details: r.chronic_illness_details || undefined,
    recent_surgery: r.recent_surgery,
    recent_surgery_details: r.recent_surgery_details || undefined,
    activity_limitations: r.activity_limitations || undefined,
    other_accommodations: r.other_accommodations || undefined,
    youth_program: r.youth_program || undefined
  };
}

function mapSubmission(r: RecordModel): Submission {
  return {
    id: r.id,
    event_id: r.event_id,
    submitted_by: r.submitted_by || undefined,
    participant_name: r.participant_name,
    participant_dob: r.participant_dob,
    participant_age: r.participant_age,
    participant_phone: r.participant_phone || undefined,
    address: r.address || undefined,
    city: r.city || undefined,
    state_province: r.state_province || undefined,
    emergency_contact: r.emergency_contact || undefined,
    emergency_phone_primary: r.emergency_phone_primary || undefined,
    emergency_phone_secondary: r.emergency_phone_secondary || undefined,
    special_diet: r.special_diet,
    special_diet_details: r.special_diet_details || undefined,
    allergies: r.allergies,
    allergies_details: r.allergies_details || undefined,
    medications: r.medications || undefined,
    can_self_administer_meds: r.can_self_administer_meds ?? undefined,
    chronic_illness: r.chronic_illness,
    chronic_illness_details: r.chronic_illness_details || undefined,
    recent_surgery: r.recent_surgery,
    recent_surgery_details: r.recent_surgery_details || undefined,
    activity_limitations: r.activity_limitations || undefined,
    other_accommodations: r.other_accommodations || undefined,
    participant_signature: r.participant_signature || undefined,
    participant_signature_type: r.participant_signature_type,
    participant_signature_date: r.participant_signature_date,
    guardian_signature: r.guardian_signature || undefined,
    guardian_signature_type: r.guardian_signature_type || undefined,
    guardian_signature_date: r.guardian_signature_date || undefined,
    submitted_at: r.created,
    pdf_path: r.pdf_path || undefined
  };
}

function mapAttachment(r: RecordModel): Attachment {
  return {
    id: r.id,
    event_id: r.event_id,
    filename: r.file || r.filename,
    original_name: r.original_name,
    mime_type: r.mime_type,
    size: r.size,
    display_order: r.display_order ?? 0,
    uploaded_at: r.created
  };
}

// ---------------------------------------------------------------------------
// Sidecar fetch helper — used for form submit and submission update (PDF gen)
// ---------------------------------------------------------------------------

async function sidecarFetch(path: string, options: RequestInit = {}): Promise<any> {
  const { headers: customHeaders, ...rest } = options;
  const authHeaders: Record<string, string> = {};
  if (pb.authStore.token) {
    authHeaders['Authorization'] = `Bearer ${pb.authStore.token}`;
  }
  const res = await fetch(`${SIDECAR_URL}${path}`, {
    ...rest,
    headers: { 'Content-Type': 'application/json', ...authHeaders, ...customHeaders }
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(body.error || res.statusText);
  }
  return res.json();
}

// ---------------------------------------------------------------------------
// Attachment URL cache — needed because getUrl() is synchronous
// ---------------------------------------------------------------------------

const attachmentUrlCache = new Map<string, string>();

// ---------------------------------------------------------------------------
// Repository implementations
// ---------------------------------------------------------------------------

function createAuthRepository(): AuthRepository {
  return {
    async register(email: string, password: string, name: string, role: string): Promise<User> {
      const record = await pb.collection('users').create({
        email,
        password,
        passwordConfirm: password,
        name,
        role
      });
      // Auto-login after registration
      await pb.collection('users').authWithPassword(email, password);
      return mapUser(record);
    },

    async login(email: string, password: string): Promise<User> {
      const result = await pb.collection('users').authWithPassword(email, password);
      return mapUser(result.record);
    },

    async logout(): Promise<void> {
      pb.authStore.clear();
    },

    async getCurrentUser(): Promise<User | null> {
      if (!pb.authStore.isValid) {
        return null;
      }
      try {
        const result = await pb.collection('users').authRefresh();
        return mapUser(result.record);
      } catch {
        pb.authStore.clear();
        return null;
      }
    },

    async getProfile(): Promise<User> {
      const record = await pb.collection('users').getOne(pb.authStore.record!.id);
      return mapUser(record);
    },

    async updateProfile(data: Partial<User>): Promise<User> {
      const record = await pb.collection('users').update(pb.authStore.record!.id, data);
      return mapUser(record);
    },

    async changePassword(currentPassword: string, newPassword: string): Promise<void> {
      await pb.collection('users').update(pb.authStore.record!.id, {
        oldPassword: currentPassword,
        password: newPassword,
        passwordConfirm: newPassword
      });
    },

    async forgotPassword(email: string): Promise<void> {
      await pb.collection('users').requestPasswordReset(email);
    },

    async resetPassword(token: string, newPassword: string): Promise<void> {
      await pb.collection('users').confirmPasswordReset(token, newPassword, newPassword);
    },

    isAuthenticated(): boolean {
      return pb.authStore.isValid;
    },

    onAuthChange(callback: (user: User | null) => void): () => void {
      const unsubscribe = pb.authStore.onChange((_token, record) => {
        callback(record ? mapUser(record as RecordModel) : null);
      });
      return unsubscribe;
    }
  };
}

function createEventRepository(): EventRepository {
  return {
    async create(data: Partial<Event>): Promise<{ event: Event; formUrl: string }> {
      const record = await pb.collection('events').create({
        ...data,
        created_by: pb.authStore.record!.id
      });
      const event = mapEvent(record);
      const formUrl = `/form/${event.id}`;
      return { event, formUrl };
    },

    async list(options?: { all?: boolean }): Promise<Event[]> {
      const userId = pb.authStore.record?.id;
      let filter = `created_by = "${userId}"`;
      if (!options?.all) {
        filter += ' && is_active = true';
      }

      const records = await pb.collection('events').getFullList({ filter, sort: '-created' });
      const events = records.map(mapEvent);

      // Batch fetch submission counts
      for (const event of events) {
        try {
          const subs = await pb.collection('submissions').getList(1, 1, {
            filter: `event_id = "${event.id}"`
          });
          event.submission_count = subs.totalItems;
        } catch {
          event.submission_count = 0;
        }
      }

      return events;
    },

    async getById(id: string): Promise<Event> {
      const record = await pb.collection('events').getOne(id);
      return mapEvent(record);
    },

    async update(id: string, data: Partial<Event>): Promise<Event> {
      const record = await pb.collection('events').update(id, data);
      return mapEvent(record);
    },

    async deactivate(id: string): Promise<void> {
      await pb.collection('events').update(id, { is_active: false });
    },

    async getSubmissions(eventId: string): Promise<Submission[]> {
      const records = await pb.collection('submissions').getFullList({
        filter: `event_id = "${eventId}"`,
        sort: '-created'
      });
      return records.map(mapSubmission);
    },

    async getAllSubmissions(): Promise<AllSubmission[]> {
      const userId = pb.authStore.record?.id;
      const records = await pb.collection('submissions').getFullList({
        filter: `event_id.created_by = "${userId}"`,
        sort: '-created',
        expand: 'event_id'
      });
      return records.map((r) => ({
        ...mapSubmission(r),
        event_name: r.expand?.event_id?.event_name || '',
        event_dates: r.expand?.event_id?.event_dates || '',
        organizations: r.expand?.event_id?.organizations || '[]'
      }));
    },

    onSubmissionCreated(eventId: string, callback: (submission: Submission) => void): () => void {
      pb.collection('submissions').subscribe('*', (e) => {
        if (e.action === 'create' && e.record.event_id === eventId) {
          callback(mapSubmission(e.record as RecordModel));
        }
      });
      return () => {
        pb.collection('submissions').unsubscribe();
      };
    }
  };
}

function createProfileRepository(): ProfileRepository {
  return {
    async list(): Promise<ChildProfile[]> {
      const userId = pb.authStore.record?.id;
      const records = await pb.collection('child_profiles').getFullList({
        filter: `user_id = "${userId}"`,
        sort: '-created'
      });
      return records.map(mapProfile);
    },

    async create(data: Partial<ChildProfile>): Promise<ChildProfile> {
      const record = await pb.collection('child_profiles').create({
        ...data,
        user_id: pb.authStore.record!.id
      });
      return mapProfile(record);
    },

    async update(id: string, data: Partial<ChildProfile>): Promise<ChildProfile> {
      const record = await pb.collection('child_profiles').update(id, data);
      return mapProfile(record);
    },

    async delete(id: string): Promise<void> {
      await pb.collection('child_profiles').delete(id);
    }
  };
}

function createSubmissionRepository(): SubmissionRepository {
  return {
    async getFormEvent(eventId: string): Promise<{ event: Event; attachments: Attachment[] }> {
      const eventRecord = await pb.collection('events').getOne(eventId);
      const event = mapEvent(eventRecord);

      const attachmentRecords = await pb.collection('event_attachments').getFullList({
        filter: `event_id = "${eventId}"`,
        sort: 'display_order'
      });
      const attachments = attachmentRecords.map((r) => {
        const mapped = mapAttachment(r);
        // Cache the file URL for synchronous getUrl() access
        if (r.file) {
          const url = pb.files.getURL(r, r.file);
          attachmentUrlCache.set(r.id, url);
        }
        return mapped;
      });

      return { event, attachments };
    },

    async submit(eventId: string, data: Record<string, unknown>): Promise<{ submission: Submission }> {
      // Form submission goes through the sidecar for PDF generation
      const result = await sidecarFetch(`/api/events/${eventId}/submit`, {
        method: 'POST',
        body: JSON.stringify(data)
      });
      return { submission: result.submission };
    },

    async getMine(): Promise<Submission[]> {
      const userId = pb.authStore.record?.id;
      const records = await pb.collection('submissions').getFullList({
        filter: `submitted_by = "${userId}"`,
        sort: '-created'
      });
      return records.map(mapSubmission);
    },

    async getById(id: string): Promise<Submission> {
      const record = await pb.collection('submissions').getOne(id);
      return mapSubmission(record);
    },

    async update(id: string, data: Record<string, unknown>): Promise<Submission> {
      // Submission updates go through the sidecar for PDF regeneration
      const result = await sidecarFetch(`/api/submissions/${id}`, {
        method: 'PUT',
        body: JSON.stringify(data)
      });
      return result.submission;
    },

    async delete(id: string): Promise<void> {
      await pb.collection('submissions').delete(id);
    },

    getPdfUrl(submissionId: string): string {
      return `${SIDECAR_URL}/api/submissions/${submissionId}/pdf`;
    }
  };
}

function createAttachmentRepository(): AttachmentRepository {
  return {
    async list(eventId: string): Promise<Attachment[]> {
      const records = await pb.collection('event_attachments').getFullList({
        filter: `event_id = "${eventId}"`,
        sort: 'display_order'
      });
      return records.map((r) => {
        const mapped = mapAttachment(r);
        if (r.file) {
          const url = pb.files.getURL(r, r.file);
          attachmentUrlCache.set(r.id, url);
        }
        return mapped;
      });
    },

    async upload(eventId: string, file: File): Promise<Attachment> {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('event_id', eventId);
      formData.append('original_name', file.name);
      formData.append('mime_type', file.type);
      formData.append('size', String(file.size));
      formData.append('display_order', '0');

      const record = await pb.collection('event_attachments').create(formData);
      const mapped = mapAttachment(record);
      if (record.file) {
        const url = pb.files.getURL(record, record.file);
        attachmentUrlCache.set(record.id, url);
      }
      return mapped;
    },

    async delete(eventId: string, attachmentId: string): Promise<void> {
      await pb.collection('event_attachments').delete(attachmentId);
      attachmentUrlCache.delete(attachmentId);
    },

    getUrl(eventId: string, attachmentId: string): string {
      return (
        attachmentUrlCache.get(attachmentId) ||
        `${PB_URL}/api/files/event_attachments/${attachmentId}/`
      );
    }
  };
}

function createAdminRepository(): AdminRepository {
  return {
    async getStats(): Promise<SystemStats> {
      const [users, events, activeEvents, submissions, profiles] = await Promise.all([
        pb.collection('users').getList(1, 1),
        pb.collection('events').getList(1, 1),
        pb.collection('events').getList(1, 1, { filter: 'is_active = true' }),
        pb.collection('submissions').getList(1, 1),
        pb.collection('child_profiles').getList(1, 1)
      ]);

      return {
        userCount: users.totalItems,
        eventCount: events.totalItems,
        activeEventCount: activeEvents.totalItems,
        submissionCount: submissions.totalItems,
        profileCount: profiles.totalItems
      };
    },

    async listUsers(): Promise<User[]> {
      const records = await pb.collection('users').getFullList({ sort: '-created' });
      return records.map(mapUser);
    },

    async getUser(id: string): Promise<User> {
      const record = await pb.collection('users').getOne(id);
      return mapUser(record);
    },

    async createUser(data: { email: string; password: string; name: string; role: string }): Promise<User> {
      const record = await pb.collection('users').create({
        email: data.email,
        password: data.password,
        passwordConfirm: data.password,
        name: data.name,
        role: data.role
      });
      return mapUser(record);
    },

    async updateRole(id: string, role: string): Promise<User> {
      const record = await pb.collection('users').update(id, { role });
      return mapUser(record);
    },

    async resetPassword(id: string, newPassword: string): Promise<void> {
      await pb.collection('users').update(id, {
        password: newPassword,
        passwordConfirm: newPassword
      });
    },

    async deleteUser(id: string): Promise<void> {
      await pb.collection('users').delete(id);
    }
  };
}

function createSubscriptionManager(): SubscriptionManager {
  const activeSubscriptions: Array<() => void> = [];

  return {
    subscribe(collection: string, callback: (event: RealtimeEvent) => void): () => void {
      pb.collection(collection).subscribe('*', (e) => {
        callback({
          action: e.action as RealtimeEvent['action'],
          record: e.record as Record<string, unknown>
        });
      });
      const unsub = () => {
        pb.collection(collection).unsubscribe();
      };
      activeSubscriptions.push(unsub);
      return unsub;
    },

    unsubscribeAll(): void {
      for (const unsub of activeSubscriptions) {
        unsub();
      }
      activeSubscriptions.length = 0;
    }
  };
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

export function createPocketBaseRepository(): DataRepository {
  return {
    auth: createAuthRepository(),
    events: createEventRepository(),
    profiles: createProfileRepository(),
    submissions: createSubmissionRepository(),
    attachments: createAttachmentRepository(),
    admin: createAdminRepository(),
    subscriptions: createSubscriptionManager()
  };
}

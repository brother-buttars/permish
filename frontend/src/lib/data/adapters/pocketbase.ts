import PocketBase, { type RecordModel } from 'pocketbase';
import type {
  AuthRepository,
  EventRepository,
  ProfileRepository,
  SubmissionRepository,
  AttachmentRepository,
  AdminRepository,
  GroupRepository,
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
  RealtimeEvent,
  Group,
  GroupDetail,
  GroupMember
} from '../types';

const PB_URL = import.meta.env.PUBLIC_PB_URL || 'http://localhost:8090';
const SIDECAR_URL = import.meta.env.PUBLIC_SIDECAR_URL || 'http://localhost:3002';

const pb = new PocketBase(PB_URL);

async function ensureParentMembership(pb: PocketBase, parentId: string, userId: string): Promise<void> {
  const existing = await pb.collection('group_members').getFullList({
    filter: `group_id = "${parentId}" && user_id = "${userId}"`
  });
  if (existing.length === 0) {
    await pb.collection('group_members').create({
      group_id: parentId,
      user_id: userId,
      role: 'member'
    });
  }
}

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

function mapGroup(r: RecordModel): Group {
  return {
    id: r.id,
    name: r.name,
    type: r.type,
    parent_id: r.parent_id || undefined,
    ward: r.ward || undefined,
    stake: r.stake || undefined,
    leader_name: r.leader_name || undefined,
    leader_phone: r.leader_phone || undefined,
    leader_email: r.leader_email || undefined,
    invite_code: r.invite_code || undefined,
    member_role: r.member_role || undefined,
    member_count: r.member_count ?? undefined,
    created_at: r.created
  };
}

function mapGroupMember(r: RecordModel): GroupMember {
  return {
    membership_id: r.id,
    user_id: r.user_id || r.expand?.user_id?.id,
    name: r.expand?.user_id?.name || r.name || '',
    email: r.expand?.user_id?.email || r.email || '',
    role: r.role,
    joined_at: r.joined_at || r.created
  };
}

function createGroupRepository(): GroupRepository {
  return {
    async list(): Promise<Group[]> {
      const userId = pb.authStore.record?.id;
      // Get groups the user is a member of
      const memberships = await pb.collection('group_members').getFullList({
        filter: `user_id = "${userId}"`,
        expand: 'group_id'
      });
      return memberships.map((m) => {
        const group = mapGroup(m.expand?.group_id as RecordModel);
        group.member_role = m.role;
        return group;
      });
    },

    async getById(id: string): Promise<GroupDetail> {
      const record = await pb.collection('groups').getOne(id);
      const group = mapGroup(record);

      // Get members with expanded user data
      const memberRecords = await pb.collection('group_members').getFullList({
        filter: `group_id = "${id}"`,
        expand: 'user_id'
      });
      const members = memberRecords.map(mapGroupMember);

      // Get subgroups
      const subgroupRecords = await pb.collection('groups').getFullList({
        filter: `parent_id = "${id}"`
      });
      const subgroups = subgroupRecords.map((r) => ({
        id: r.id,
        name: r.name,
        type: r.type,
        ward: r.ward || undefined
      }));

      // Get parent if exists
      let parent: Group['parent'];
      if (record.parent_id) {
        const parentRecord = await pb.collection('groups').getOne(record.parent_id);
        parent = {
          id: parentRecord.id,
          name: parentRecord.name,
          type: parentRecord.type,
          stake: parentRecord.stake || undefined
        };
      }

      // Effective admin: admin of this group or any ancestor (or super)
      const userId = pb.authStore.record?.id;
      const userRole = (pb.authStore.record as RecordModel | null)?.role;
      let effectiveAdmin = userRole === 'super';
      if (!effectiveAdmin && userId) {
        const visited = new Set<string>();
        let currentId: string | null = id;
        let currentParentId: string | null = record.parent_id || null;
        while (currentId && !visited.has(currentId)) {
          visited.add(currentId);
          const ms = await pb.collection('group_members').getFullList({
            filter: `group_id = "${currentId}" && user_id = "${userId}"`
          });
          if (ms.length > 0 && ms[0].role === 'admin') { effectiveAdmin = true; break; }
          if (!currentParentId) break;
          const p = await pb.collection('groups').getOne(currentParentId);
          currentId = p.id;
          currentParentId = p.parent_id || null;
        }
      }

      return { ...group, members, subgroups, parent, effective_admin: effectiveAdmin };
    },

    async create(data: { name: string; type: string; parent_id?: string; ward?: string; stake?: string; leader_name?: string; leader_phone?: string; leader_email?: string }): Promise<Group> {
      const record = await pb.collection('groups').create({
        ...data,
        invite_code: crypto.randomUUID().slice(0, 8)
      });
      // Auto-add creator as admin
      await pb.collection('group_members').create({
        group_id: record.id,
        user_id: pb.authStore.record!.id,
        role: 'admin'
      });
      return mapGroup(record);
    },

    async update(id: string, data: Partial<Group>): Promise<Group> {
      const record = await pb.collection('groups').update(id, data);
      return mapGroup(record);
    },

    async join(inviteCode: string): Promise<{ group: Group; message: string }> {
      // Find group by invite code
      const records = await pb.collection('groups').getFullList({
        filter: `invite_code = "${inviteCode}"`
      });
      if (records.length === 0) throw new Error('Invalid invite code');

      const group = mapGroup(records[0]);
      const userId = pb.authStore.record!.id;
      // Add user as member
      await pb.collection('group_members').create({
        group_id: group.id,
        user_id: userId,
        role: 'member'
      });

      // Propagate to parent group (e.g., ward → stake)
      if (group.parent_id) {
        await ensureParentMembership(pb, group.parent_id, userId);
      }

      return { group, message: `Joined ${group.name}` };
    },

    async invite(groupId: string, email: string, role?: string): Promise<{ message: string; invite: import('../types').GroupInvite }> {
      const inviteRole = role === 'admin' ? 'admin' : 'member';
      // Reject if already a registered member of the group
      const users = await pb.collection('users').getFullList({ filter: `email = "${email}"` });
      if (users.length > 0) {
        const existing = await pb.collection('group_members').getFullList({
          filter: `group_id = "${groupId}" && user_id = "${users[0].id}"`
        });
        if (existing.length > 0) throw new Error('User is already a member');
      }
      const token = pbInviteToken();
      const record = await pb.collection('group_invites').create({
        group_id: groupId,
        code: null,
        token,
        role: inviteRole,
        email,
        max_uses: 1,
        used_count: 0,
        created_by: pb.authStore.record?.id,
      });
      return { message: `Invite created for ${email}`, invite: mapInvite(record) };
    },

    async updateMemberRole(groupId: string, userId: string, role: string): Promise<void> {
      const memberships = await pb.collection('group_members').getFullList({
        filter: `group_id = "${groupId}" && user_id = "${userId}"`
      });
      if (memberships.length === 0) throw new Error('Member not found');
      await pb.collection('group_members').update(memberships[0].id, { role });
    },

    async removeMember(groupId: string, userId: string): Promise<void> {
      const memberships = await pb.collection('group_members').getFullList({
        filter: `group_id = "${groupId}" && user_id = "${userId}"`
      });
      if (memberships.length === 0) throw new Error('Member not found');
      await pb.collection('group_members').delete(memberships[0].id);
    },

    async regenerateInvite(groupId: string): Promise<{ invite_code: string }> {
      const newCode = pbInviteCode();
      // Revoke existing default code-bearing invites
      const active = await pb.collection('group_invites').getFullList({
        filter: `group_id = "${groupId}" && code != null && revoked_at = null`
      });
      const nowStr = new Date().toISOString();
      for (const r of active) {
        await pb.collection('group_invites').update(r.id, { revoked_at: nowStr });
      }
      await pb.collection('group_invites').create({
        group_id: groupId,
        code: newCode,
        token: pbInviteToken(),
        role: 'member',
        used_count: 0,
        created_by: pb.authStore.record?.id,
      });
      await pb.collection('groups').update(groupId, { invite_code: newCode });
      return { invite_code: newCode };
    },

    async listInvites(groupId: string): Promise<import('../types').GroupInvite[]> {
      const recs = await pb.collection('group_invites').getFullList({
        filter: `group_id = "${groupId}"`,
        sort: '-created'
      });
      return recs.map(mapInvite);
    },

    async createInvite(groupId: string, body: { role?: 'admin' | 'member'; email?: string; max_uses?: number; expires_at?: string }): Promise<import('../types').GroupInvite> {
      const inviteRole: 'admin' | 'member' = body?.role === 'admin' ? 'admin' : 'member';
      const isEmail = !!body?.email;
      const maxUses = isEmail ? 1 : (Number.isInteger(body?.max_uses) && body!.max_uses! > 0 ? body!.max_uses! : null);
      const rec = await pb.collection('group_invites').create({
        group_id: groupId,
        code: isEmail ? null : pbInviteCode(),
        token: pbInviteToken(),
        role: inviteRole,
        email: body?.email ?? null,
        max_uses: maxUses,
        used_count: 0,
        expires_at: body?.expires_at ?? null,
        created_by: pb.authStore.record?.id,
      });
      return mapInvite(rec);
    },

    async revokeInvite(groupId: string, inviteId: string): Promise<void> {
      await pb.collection('group_invites').update(inviteId, { revoked_at: new Date().toISOString() });
    },

    async previewInvite(token: string): Promise<import('../types').InvitePreview> {
      const recs = await pb.collection('group_invites').getFullList({ filter: `token = "${token}"` });
      if (recs.length === 0) throw new Error('Invite not_found');
      const r = recs[0];
      if (r.revoked_at) throw new Error('Invite revoked');
      if (r.accepted_at) throw new Error('Invite accepted');
      if (r.expires_at && new Date(r.expires_at) < new Date()) throw new Error('Invite expired');
      if (r.max_uses != null && r.used_count >= r.max_uses) throw new Error('Invite exhausted');
      const g = await pb.collection('groups').getOne(r.group_id);
      return {
        invite: { role: r.role, email: r.email ?? null, expires_at: r.expires_at ?? null },
        group: { id: g.id, name: g.name, type: g.type, ward: g.ward, stake: g.stake },
      };
    },

    async getAuditLog(groupId: string, opts?: { limit?: number; before?: string }): Promise<import('../types').AuditEntry[]> {
      const ids = await collectPbGroupAndDescendantIds(pb, groupId);
      if (ids.length === 0) return [];
      const groupFilter = ids.map((id) => `group_id = "${id}"`).join(' || ');
      const beforeFilter = opts?.before ? ` && created < "${opts.before}"` : '';
      const recs = await pb.collection('audit_log').getList(1, Math.min(opts?.limit ?? 100, 500), {
        filter: `(${groupFilter})${beforeFilter}`,
        sort: '-created',
        expand: 'actor_id',
      });
      return recs.items.map((r) => ({
        id: r.id,
        actor_id: r.actor_id ?? null,
        actor_name: (r.expand as any)?.actor_id?.name ?? null,
        actor_email: (r.expand as any)?.actor_id?.email ?? null,
        action: r.action,
        target_type: r.target_type ?? null,
        target_id: r.target_id ?? null,
        group_id: r.group_id ?? null,
        meta: r.meta ?? null,
        created_at: r.created,
      }));
    },

    async acceptInvite(token: string): Promise<{ group: Group; message: string }> {
      const recs = await pb.collection('group_invites').getFullList({ filter: `token = "${token}"` });
      if (recs.length === 0) throw new Error('Invite not_found');
      const r = recs[0];
      if (r.revoked_at) throw new Error('Invite revoked');
      if (r.accepted_at) throw new Error('Invite accepted');
      if (r.expires_at && new Date(r.expires_at) < new Date()) throw new Error('Invite expired');
      if (r.max_uses != null && r.used_count >= r.max_uses) throw new Error('Invite exhausted');

      const userId = pb.authStore.record!.id;
      const userEmail = (pb.authStore.record as RecordModel | null)?.email as string | undefined;
      if (r.email && userEmail && r.email.toLowerCase() !== userEmail.toLowerCase()) {
        throw new Error('This invite was sent to a different email address');
      }
      const g = await pb.collection('groups').getOne(r.group_id);
      const existing = await pb.collection('group_members').getFullList({
        filter: `group_id = "${g.id}" && user_id = "${userId}"`
      });
      if (existing.length === 0) {
        await pb.collection('group_members').create({ group_id: g.id, user_id: userId, role: r.role });
        if (g.parent_id) await ensureParentMembership(pb, g.parent_id, userId);
        await pb.collection('group_invites').update(r.id, { used_count: (r.used_count || 0) + 1 });
      }
      if (r.max_uses === 1) {
        await pb.collection('group_invites').update(r.id, { accepted_at: new Date().toISOString(), accepted_by: userId });
      }
      const group = mapGroup(g);
      group.member_role = r.role;
      return { group, message: existing.length > 0 ? `Already a member of ${group.name}` : `Joined ${group.name}` };
    },
  };
}

function pbInviteCode(): string {
  const bytes = new Uint8Array(4);
  crypto.getRandomValues(bytes);
  return Array.from(bytes).map((b) => b.toString(16).padStart(2, '0')).join('').toUpperCase();
}

function pbInviteToken(): string {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function collectPbGroupAndDescendantIds(pb: PocketBase, rootId: string): Promise<string[]> {
  const out = [rootId];
  const queue = [rootId];
  const visited = new Set<string>([rootId]);
  while (queue.length > 0) {
    const id = queue.shift()!;
    const children = await pb.collection('groups').getFullList({ filter: `parent_id = "${id}"`, fields: 'id' });
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

function mapInvite(r: RecordModel): import('../types').GroupInvite {
  return {
    id: r.id,
    group_id: r.group_id,
    code: r.code ?? null,
    token: r.token,
    role: r.role,
    email: r.email ?? null,
    max_uses: r.max_uses ?? null,
    used_count: r.used_count ?? 0,
    expires_at: r.expires_at ?? null,
    revoked_at: r.revoked_at ?? null,
    accepted_at: r.accepted_at ?? null,
    created_at: r.created,
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
    groups: createGroupRepository(),
    subscriptions: createSubscriptionManager()
  };
}

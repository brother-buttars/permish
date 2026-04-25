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
  GroupMember,
  GroupInvite,
  InvitePreview,
  AdminFilter,
  AdminGroupNode,
  AdminActivity,
  AdminSubmission,
  AdminProfile
} from '../types';

function adminFilterQuery(filter?: AdminFilter): string {
  const params = new URLSearchParams();
  if (filter?.groupId) params.set('groupId', filter.groupId);
  if (filter?.activityId) params.set('activityId', filter.activityId);
  const qs = params.toString();
  return qs ? `?${qs}` : '';
}

/**
 * API URL resolution (runtime, not build-time):
 * 1. Custom server URL from localStorage (user-configured via /server-settings)
 * 2. Build-time env var (for Docker/dev overrides)
 * 3. Current origin (default — works on any domain without config)
 */
function getApiUrl(): string {
  if (typeof window !== 'undefined') {
    const custom = localStorage.getItem('permish_server_url');
    if (custom) return custom.replace(/\/$/, ''); // strip trailing slash
  }
  return import.meta.env.PUBLIC_API_URL || (typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3001');
}

// Resolved once at module load, updated when server settings change
let API_URL = getApiUrl();

/** Call this after changing permish_server_url in localStorage */
export function reloadApiUrl(): void {
  API_URL = getApiUrl();
}

async function apiFetch(path: string, options: RequestInit = {}): Promise<any> {
  const { headers: customHeaders, ...restOptions } = options;
  const res = await fetch(`${API_URL}${path}`, {
    credentials: 'include',
    ...restOptions,
    headers: { 'Content-Type': 'application/json', ...customHeaders }
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(body.error || res.statusText);
  }
  return res.json();
}

function createAuthRepository(): AuthRepository & { _authenticated: boolean } {
  const state = { _authenticated: false };

  return {
    get _authenticated() {
      return state._authenticated;
    },
    set _authenticated(val: boolean) {
      state._authenticated = val;
    },

    async register(email: string, password: string, name: string, role: string): Promise<User> {
      const data = await apiFetch('/api/auth/register', {
        method: 'POST',
        body: JSON.stringify({ email, password, name, role })
      });
      return data.user;
    },

    async login(email: string, password: string): Promise<User> {
      const data = await apiFetch('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email, password })
      });
      state._authenticated = true;
      return data.user;
    },

    async logout(): Promise<void> {
      await apiFetch('/api/auth/logout', { method: 'POST' });
      state._authenticated = false;
    },

    async getCurrentUser(): Promise<User | null> {
      try {
        const data = await apiFetch('/api/auth/me');
        state._authenticated = true;
        return data.user;
      } catch {
        state._authenticated = false;
        return null;
      }
    },

    async getProfile(): Promise<User> {
      const data = await apiFetch('/api/auth/profile');
      return data.user;
    },

    async updateProfile(profileData: Partial<User>): Promise<User> {
      const data = await apiFetch('/api/auth/profile', {
        method: 'PUT',
        body: JSON.stringify(profileData)
      });
      return data.user;
    },

    async changePassword(currentPassword: string, newPassword: string): Promise<void> {
      await apiFetch('/api/auth/password', {
        method: 'PUT',
        body: JSON.stringify({ currentPassword, newPassword })
      });
    },

    async forgotPassword(email: string): Promise<void> {
      await apiFetch('/api/auth/forgot-password', {
        method: 'POST',
        body: JSON.stringify({ email })
      });
    },

    async resetPassword(token: string, newPassword: string): Promise<void> {
      await apiFetch('/api/auth/reset-password', {
        method: 'POST',
        body: JSON.stringify({ token, newPassword })
      });
    },

    isAuthenticated(): boolean {
      return state._authenticated;
    },

    async setupCredentials(email: string, name: string, password: string): Promise<User> {
      const data = await apiFetch('/api/auth/setup-credentials', {
        method: 'PUT',
        body: JSON.stringify({ email, name, password })
      });
      state._authenticated = true;
      return data.user;
    }
  };
}

function createEventRepository(): EventRepository {
  return {
    async create(data: Partial<Event>): Promise<{ event: Event; formUrl: string }> {
      return await apiFetch('/api/events', {
        method: 'POST',
        body: JSON.stringify(data)
      });
    },

    async list(options?: { all?: boolean }): Promise<Event[]> {
      const query = options?.all ? '?all=1' : '';
      const data = await apiFetch(`/api/events${query}`);
      return data.events;
    },

    async getById(id: string): Promise<Event> {
      const data = await apiFetch(`/api/events/${id}`);
      return data.event;
    },

    async update(id: string, eventData: Partial<Event>): Promise<Event> {
      const data = await apiFetch(`/api/events/${id}`, {
        method: 'PUT',
        body: JSON.stringify(eventData)
      });
      return data.event;
    },

    async deactivate(id: string): Promise<void> {
      await apiFetch(`/api/events/${id}`, { method: 'DELETE' });
    },

    async getSubmissions(eventId: string): Promise<Submission[]> {
      const data = await apiFetch(`/api/events/${eventId}/submissions`);
      return data.submissions;
    },

    async getAllSubmissions(): Promise<AllSubmission[]> {
      const data = await apiFetch('/api/events/all-submissions');
      return data.submissions;
    }
  };
}

function createProfileRepository(): ProfileRepository {
  return {
    async list(): Promise<ChildProfile[]> {
      const data = await apiFetch('/api/profiles');
      return data.profiles;
    },

    async create(profileData: Partial<ChildProfile>): Promise<ChildProfile> {
      const data = await apiFetch('/api/profiles', {
        method: 'POST',
        body: JSON.stringify(profileData)
      });
      return data.profile;
    },

    async update(id: string, profileData: Partial<ChildProfile>): Promise<ChildProfile> {
      const data = await apiFetch(`/api/profiles/${id}`, {
        method: 'PUT',
        body: JSON.stringify(profileData)
      });
      return data.profile;
    },

    async delete(id: string): Promise<void> {
      await apiFetch(`/api/profiles/${id}`, { method: 'DELETE' });
    }
  };
}

function createSubmissionRepository(): SubmissionRepository {
  return {
    async getFormEvent(eventId: string): Promise<{ event: Event; attachments: Attachment[] }> {
      const data = await apiFetch(`/api/events/${eventId}/form`);
      return { event: data.event, attachments: data.attachments };
    },

    async submit(eventId: string, formData: Record<string, unknown>): Promise<{ submission: Submission }> {
      return await apiFetch(`/api/events/${eventId}/submit`, {
        method: 'POST',
        body: JSON.stringify(formData)
      });
    },

    async getMine(): Promise<Submission[]> {
      const data = await apiFetch('/api/submissions/mine');
      return data.submissions;
    },

    async getById(id: string): Promise<Submission> {
      const data = await apiFetch(`/api/submissions/${id}`);
      return data.submission;
    },

    async update(id: string, submissionData: Record<string, unknown>): Promise<Submission> {
      const data = await apiFetch(`/api/submissions/${id}`, {
        method: 'PUT',
        body: JSON.stringify(submissionData)
      });
      return data.submission;
    },

    async delete(id: string): Promise<void> {
      await apiFetch(`/api/submissions/${id}`, { method: 'DELETE' });
    },

    getPdfUrl(submissionId: string): string {
      return `${API_URL}/api/submissions/${submissionId}/pdf`;
    }
  };
}

function createAttachmentRepository(): AttachmentRepository {
  return {
    async list(eventId: string): Promise<Attachment[]> {
      const data = await apiFetch(`/api/events/${eventId}/attachments`);
      return data.attachments;
    },

    async upload(eventId: string, file: File): Promise<Attachment> {
      const formData = new FormData();
      formData.append('file', file);
      const res = await fetch(`${API_URL}/api/events/${eventId}/attachments`, {
        method: 'POST',
        credentials: 'include',
        body: formData
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({ error: res.statusText }));
        throw new Error(body.error || res.statusText);
      }
      const data = await res.json();
      return data.attachment;
    },

    async delete(eventId: string, attachmentId: string): Promise<void> {
      await apiFetch(`/api/events/${eventId}/attachments/${attachmentId}`, {
        method: 'DELETE'
      });
    },

    getUrl(eventId: string, attachmentId: string): string {
      return `${API_URL}/api/events/${eventId}/attachments/${attachmentId}`;
    }
  };
}

function createAdminRepository(): AdminRepository {
  return {
    async getStats(filter?: AdminFilter): Promise<SystemStats> {
      const data = await apiFetch(`/api/admin/stats${adminFilterQuery(filter)}`);
      return data.stats;
    },

    async listUsers(filter?: AdminFilter): Promise<User[]> {
      const data = await apiFetch(`/api/admin/users${adminFilterQuery(filter)}`);
      return data.users;
    },

    async getUser(id: string): Promise<User> {
      const data = await apiFetch(`/api/admin/users/${id}`);
      return data.user;
    },

    async createUser(userData: { email: string; password: string; name: string; role: string }): Promise<User> {
      const data = await apiFetch('/api/admin/users', {
        method: 'POST',
        body: JSON.stringify(userData)
      });
      return data.user;
    },

    async updateRole(id: string, role: string): Promise<User> {
      const data = await apiFetch(`/api/admin/users/${id}/role`, {
        method: 'PUT',
        body: JSON.stringify({ role })
      });
      return data.user;
    },

    async resetPassword(id: string, newPassword: string): Promise<void> {
      await apiFetch(`/api/admin/users/${id}/password`, {
        method: 'PUT',
        body: JSON.stringify({ newPassword })
      });
    },

    async deleteUser(id: string): Promise<void> {
      await apiFetch(`/api/admin/users/${id}`, { method: 'DELETE' });
    },

    async listGroupsTree(): Promise<AdminGroupNode[]> {
      const data = await apiFetch('/api/admin/groups-tree');
      return data.groups;
    },

    async listActivities(filter?: AdminFilter): Promise<AdminActivity[]> {
      const data = await apiFetch(`/api/admin/activities${adminFilterQuery(filter)}`);
      return data.activities;
    },

    async listSubmissions(filter?: AdminFilter): Promise<AdminSubmission[]> {
      const data = await apiFetch(`/api/admin/submissions${adminFilterQuery(filter)}`);
      return data.submissions;
    },

    async listProfiles(filter?: AdminFilter): Promise<AdminProfile[]> {
      const data = await apiFetch(`/api/admin/profiles${adminFilterQuery(filter)}`);
      return data.profiles;
    }
  };
}

function createGroupRepository(): GroupRepository {
  return {
    async list(): Promise<Group[]> {
      const data = await apiFetch('/api/groups');
      return data.groups;
    },

    async getById(id: string): Promise<GroupDetail> {
      const data = await apiFetch(`/api/groups/${id}`);
      return data.group;
    },

    async create(groupData: { name: string; type: string; parent_id?: string; ward?: string; stake?: string; leader_name?: string; leader_phone?: string; leader_email?: string }): Promise<Group> {
      const data = await apiFetch('/api/groups', {
        method: 'POST',
        body: JSON.stringify(groupData)
      });
      return data.group;
    },

    async update(id: string, groupData: Partial<Group>): Promise<Group> {
      const data = await apiFetch(`/api/groups/${id}`, {
        method: 'PUT',
        body: JSON.stringify(groupData)
      });
      return data.group;
    },

    async join(inviteCode: string): Promise<{ group: Group; message: string }> {
      return await apiFetch('/api/groups/join', {
        method: 'POST',
        body: JSON.stringify({ invite_code: inviteCode })
      });
    },

    async invite(groupId: string, email: string, role?: string): Promise<{ message: string; invite: GroupInvite }> {
      return await apiFetch(`/api/groups/${groupId}/invite`, {
        method: 'POST',
        body: JSON.stringify({ email, role })
      });
    },

    async updateMemberRole(groupId: string, userId: string, role: string): Promise<void> {
      await apiFetch(`/api/groups/${groupId}/members/${userId}/role`, {
        method: 'PUT',
        body: JSON.stringify({ role })
      });
    },

    async removeMember(groupId: string, userId: string): Promise<void> {
      await apiFetch(`/api/groups/${groupId}/members/${userId}`, {
        method: 'DELETE'
      });
    },

    async regenerateInvite(groupId: string): Promise<{ invite_code: string }> {
      return await apiFetch(`/api/groups/${groupId}/regenerate-invite`, {
        method: 'POST'
      });
    },

    async listInvites(groupId: string): Promise<GroupInvite[]> {
      const data = await apiFetch(`/api/groups/${groupId}/invites`);
      return data.invites;
    },

    async createInvite(groupId: string, body: { role?: 'admin' | 'member'; email?: string; max_uses?: number; expires_at?: string }): Promise<GroupInvite> {
      const data = await apiFetch(`/api/groups/${groupId}/invites`, {
        method: 'POST',
        body: JSON.stringify(body || {})
      });
      return data.invite;
    },

    async revokeInvite(groupId: string, inviteId: string): Promise<void> {
      await apiFetch(`/api/groups/${groupId}/invites/${inviteId}`, { method: 'DELETE' });
    },

    async previewInvite(token: string): Promise<InvitePreview> {
      return await apiFetch(`/api/invites/${token}`);
    },

    async acceptInvite(token: string): Promise<{ group: Group; message: string }> {
      return await apiFetch(`/api/invites/${token}/accept`, { method: 'POST' });
    },

    async getAuditLog(groupId: string, opts?: { limit?: number; before?: string }) {
      const params = new URLSearchParams();
      if (opts?.limit) params.set('limit', String(opts.limit));
      if (opts?.before) params.set('before', opts.before);
      const qs = params.toString() ? `?${params.toString()}` : '';
      const data = await apiFetch(`/api/groups/${groupId}/audit${qs}`);
      return data.entries;
    }
  };
}

export function createExpressRepository(): DataRepository {
  return {
    auth: createAuthRepository(),
    events: createEventRepository(),
    profiles: createProfileRepository(),
    submissions: createSubmissionRepository(),
    attachments: createAttachmentRepository(),
    admin: createAdminRepository(),
    groups: createGroupRepository()
  };
}

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
  GroupMember,
  AdminFilter,
  AdminGroupNode,
  AdminActivity,
  AdminSubmission,
  AdminProfile
} from './types';

export interface AuthRepository {
  register(email: string, password: string, name: string, role: string): Promise<User>;
  login(email: string, password: string): Promise<User>;
  logout(): Promise<void>;
  getCurrentUser(): Promise<User | null>;
  getProfile(): Promise<User>;
  updateProfile(data: Partial<User>): Promise<User>;
  changePassword(currentPassword: string, newPassword: string): Promise<void>;
  forgotPassword(email: string): Promise<void>;
  resetPassword(token: string, newPassword: string): Promise<void>;
  isAuthenticated(): boolean;
  onAuthChange?(callback: (user: User | null) => void): () => void;
  /** Express-mode only: complete first-login credential setup for a super-admin. */
  setupCredentials?(email: string, name: string, password: string): Promise<User>;
}

export interface EventRepository {
  create(data: Partial<Event>): Promise<{ event: Event; formUrl: string }>;
  list(options?: { all?: boolean }): Promise<Event[]>;
  getById(id: string): Promise<Event>;
  update(id: string, data: Partial<Event>): Promise<Event>;
  deactivate(id: string): Promise<void>;
  getSubmissions(eventId: string): Promise<Submission[]>;
  getAllSubmissions(): Promise<AllSubmission[]>;
  onSubmissionCreated?(eventId: string, callback: (submission: Submission) => void): () => void;
}

export interface ProfileRepository {
  list(): Promise<ChildProfile[]>;
  create(data: Partial<ChildProfile>): Promise<ChildProfile>;
  update(id: string, data: Partial<ChildProfile>): Promise<ChildProfile>;
  delete(id: string): Promise<void>;
}

export interface SubmissionRepository {
  getFormEvent(eventId: string): Promise<{ event: Event; attachments: Attachment[] }>;
  submit(eventId: string, data: Record<string, unknown>): Promise<{ submission: Submission }>;
  getMine(): Promise<Submission[]>;
  getById(id: string): Promise<Submission>;
  update(id: string, data: Record<string, unknown>): Promise<Submission>;
  delete(id: string): Promise<void>;
  getPdfUrl(submissionId: string): string;
}

export interface AttachmentRepository {
  list(eventId: string): Promise<Attachment[]>;
  upload(eventId: string, file: File): Promise<Attachment>;
  delete(eventId: string, attachmentId: string): Promise<void>;
  getUrl(eventId: string, attachmentId: string): string;
}

export interface AdminRepository {
  getStats(filter?: AdminFilter): Promise<SystemStats>;
  listUsers(filter?: AdminFilter): Promise<User[]>;
  getUser(id: string): Promise<User>;
  createUser(data: { email: string; password: string; name: string; role: string }): Promise<User>;
  updateRole(id: string, role: string): Promise<User>;
  resetPassword(id: string, newPassword: string): Promise<void>;
  deleteUser(id: string): Promise<void>;
  listGroupsTree(): Promise<AdminGroupNode[]>;
  listActivities(filter?: AdminFilter): Promise<AdminActivity[]>;
  listSubmissions(filter?: AdminFilter): Promise<AdminSubmission[]>;
  listProfiles(filter?: AdminFilter): Promise<AdminProfile[]>;
}

export interface GroupRepository {
  list(): Promise<Group[]>;
  getById(id: string): Promise<GroupDetail>;
  create(data: { name: string; type: string; parent_id?: string; ward?: string; stake?: string; leader_name?: string; leader_phone?: string; leader_email?: string; send_leader_invite?: boolean }): Promise<Group>;
  update(id: string, data: Partial<Group>): Promise<Group>;
  join(inviteCode: string): Promise<{ group: Group; message: string }>;
  /** Legacy email-add: now creates a tokenized invite usable by registered or unregistered recipients. */
  invite(groupId: string, email: string, role?: string): Promise<{ message: string; invite: import('./types').GroupInvite }>;
  updateMemberRole(groupId: string, userId: string, role: string): Promise<void>;
  removeMember(groupId: string, userId: string): Promise<void>;
  regenerateInvite(groupId: string): Promise<{ invite_code: string }>;

  // Invite management
  listInvites(groupId: string): Promise<import('./types').GroupInvite[]>;
  createInvite(groupId: string, data: { role?: 'admin' | 'member'; email?: string; max_uses?: number; expires_at?: string }): Promise<import('./types').GroupInvite>;
  revokeInvite(groupId: string, inviteId: string): Promise<void>;
  previewInvite(token: string): Promise<import('./types').InvitePreview>;
  acceptInvite(token: string): Promise<{ group: Group; message: string }>;

  // Audit log
  getAuditLog(groupId: string, opts?: { limit?: number; before?: string }): Promise<import('./types').AuditEntry[]>;
}

export interface SubscriptionManager {
  subscribe(collection: string, callback: (event: RealtimeEvent) => void): () => void;
  unsubscribeAll(): void;
}

export interface DataRepository {
  auth: AuthRepository;
  events: EventRepository;
  profiles: ProfileRepository;
  submissions: SubmissionRepository;
  attachments: AttachmentRepository;
  admin: AdminRepository;
  groups: GroupRepository;
  subscriptions?: SubscriptionManager;
}

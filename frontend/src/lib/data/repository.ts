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
  getStats(): Promise<SystemStats>;
  listUsers(): Promise<User[]>;
  getUser(id: string): Promise<User>;
  createUser(data: { email: string; password: string; name: string; role: string }): Promise<User>;
  updateRole(id: string, role: string): Promise<User>;
  resetPassword(id: string, newPassword: string): Promise<void>;
  deleteUser(id: string): Promise<void>;
}

export interface GroupRepository {
  list(): Promise<Group[]>;
  getById(id: string): Promise<GroupDetail>;
  create(data: { name: string; type: string; parent_id?: string; ward?: string; stake?: string; leader_name?: string; leader_phone?: string; leader_email?: string }): Promise<Group>;
  update(id: string, data: Partial<Group>): Promise<Group>;
  join(inviteCode: string): Promise<{ group: Group; message: string }>;
  invite(groupId: string, email: string, role?: string): Promise<{ message: string; member: GroupMember }>;
  updateMemberRole(groupId: string, userId: string, role: string): Promise<void>;
  removeMember(groupId: string, userId: string): Promise<void>;
  regenerateInvite(groupId: string): Promise<{ invite_code: string }>;
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

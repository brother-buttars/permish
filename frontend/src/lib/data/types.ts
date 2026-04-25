// Domain types matching the SQLite schema exactly.
// These are backend-agnostic — they represent the app's domain model.

export interface User {
  id: string;
  email: string;
  name: string;
  role: 'super' | 'user';
  phone?: string;
  must_change_password?: boolean;
  address?: string;
  city?: string;
  state_province?: string;
  guardian_signature?: string;
  guardian_signature_type?: 'drawn' | 'typed' | 'hand';
  created_at?: string;
}

export interface Event {
  id: string;
  created_by: string;
  group_id?: string | null;
  event_name: string;
  event_dates: string;
  event_start?: string | null;
  event_end?: string | null;
  event_description: string;
  ward: string;
  stake: string;
  leader_name: string;
  leader_phone: string;
  leader_email: string;
  notify_email?: string | null;
  notify_phone?: string | null;
  notify_carrier?: string | null;
  /** Stored as JSON string; create/update accepts string[] which the backend stringifies. */
  organizations: string | string[];
  additional_details?: string | null;
  is_active: boolean;
  created_at: string;
  /** Computed field, not stored in DB */
  submission_count?: number;
}

export interface ChildProfile {
  id: string;
  user_id: string;
  participant_name: string;
  participant_dob: string;
  participant_phone?: string;
  address?: string;
  city?: string;
  state_province?: string;
  emergency_contact?: string;
  emergency_phone_primary?: string;
  emergency_phone_secondary?: string;
  special_diet: boolean;
  special_diet_details?: string;
  allergies: boolean;
  allergies_details?: string;
  medications?: string;
  can_self_administer_meds?: boolean;
  chronic_illness: boolean;
  chronic_illness_details?: string;
  recent_surgery: boolean;
  recent_surgery_details?: string;
  activity_limitations?: string;
  other_accommodations?: string;
  youth_program?: string | null;
}

export interface Submission {
  id: string;
  event_id: string;
  submitted_by?: string;
  participant_name: string;
  participant_dob: string;
  participant_age: number;
  participant_phone?: string;
  address?: string;
  city?: string;
  state_province?: string;
  emergency_contact?: string;
  emergency_phone_primary?: string;
  emergency_phone_secondary?: string;
  special_diet: boolean;
  special_diet_details?: string;
  allergies: boolean;
  allergies_details?: string;
  medications?: string;
  can_self_administer_meds?: boolean;
  chronic_illness: boolean;
  chronic_illness_details?: string;
  recent_surgery: boolean;
  recent_surgery_details?: string;
  activity_limitations?: string;
  other_accommodations?: string;
  participant_signature?: string;
  participant_signature_type: 'drawn' | 'typed' | 'hand';
  participant_signature_date: string;
  guardian_signature?: string;
  guardian_signature_type?: 'drawn' | 'typed' | 'hand';
  guardian_signature_date?: string;
  submitted_at: string;
  pdf_path?: string;
}

export interface Attachment {
  id: string;
  event_id: string;
  filename: string;
  original_name: string;
  mime_type: string;
  size: number;
  display_order: number;
  uploaded_at?: string;
}

export interface SystemStats {
  userCount: number;
  eventCount: number;
  activeEventCount: number;
  submissionCount: number;
  profileCount: number;
}

export interface AllSubmission extends Submission {
  event_name: string;
  event_dates: string;
  organizations: string;
}

export interface Group {
  id: string;
  name: string;
  type: 'stake' | 'ward' | 'custom';
  parent_id?: string;
  ward?: string;
  stake?: string;
  leader_name?: string;
  leader_phone?: string;
  leader_email?: string;
  invite_code?: string;
  member_role?: 'admin' | 'member'; // current user's role in this group
  member_count?: number;
  parent?: { id: string; name: string; type: string; stake?: string };
  subgroups?: { id: string; name: string; type: string; ward?: string }[];
  created_at?: string;
}

export interface GroupMember {
  membership_id: string;
  user_id: string;
  name: string;
  email: string;
  role: 'admin' | 'member';
  joined_at: string;
}

export interface GroupDetail extends Group {
  members: GroupMember[];
  /** True when current user has admin authority over this group, either directly or via an ancestor (e.g., stake admin viewing a child ward). */
  effective_admin?: boolean;
}

export interface GroupInvite {
  id: string;
  group_id: string;
  code?: string | null;
  token: string;
  role: 'admin' | 'member';
  email?: string | null;
  max_uses?: number | null;
  used_count: number;
  expires_at?: string | null;
  revoked_at?: string | null;
  accepted_at?: string | null;
  created_at?: string;
}

export interface InvitePreview {
  invite: { role: 'admin' | 'member'; email?: string | null; expires_at?: string | null };
  group: { id: string; name: string; type: string; ward?: string; stake?: string };
}

export interface AuditEntry {
  id: string;
  actor_id: string | null;
  actor_name?: string | null;
  actor_email?: string | null;
  action: string;
  target_type: string | null;
  target_id: string | null;
  group_id: string | null;
  meta: Record<string, unknown> | null;
  created_at: string;
}

export interface AdminFilter {
  groupId?: string | null;
  activityId?: string | null;
}

export interface AdminGroupNode {
  id: string;
  name: string;
  type: 'stake' | 'ward' | 'custom';
  parent_id: string | null;
  depth: number;
}

export interface AdminActivity {
  id: string;
  event_name: string;
  event_dates: string;
  event_start?: string | null;
  event_end?: string | null;
  ward: string;
  stake: string;
  is_active: number;
  created_at: string;
  group_id: string | null;
  group_name?: string | null;
  submission_count: number;
}

export interface AdminSubmission {
  id: string;
  event_id: string;
  participant_name: string;
  participant_age: number;
  submitted_at: string;
  submitted_by?: string | null;
  event_name: string;
  event_dates: string;
  group_id?: string | null;
  group_name?: string | null;
  submitter_name?: string | null;
  submitter_email?: string | null;
}

export interface AdminProfile {
  id: string;
  user_id: string;
  participant_name: string;
  participant_dob: string;
  youth_program?: string | null;
  updated_at: string;
  owner_name: string;
  owner_email: string;
}

export interface RealtimeEvent {
  action: 'create' | 'update' | 'delete';
  record: Record<string, unknown>;
}

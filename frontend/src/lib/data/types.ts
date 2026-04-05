// Domain types matching the SQLite schema exactly.
// These are backend-agnostic — they represent the app's domain model.

export interface User {
  id: string;
  email: string;
  name: string;
  role: 'super' | 'planner' | 'parent';
  phone?: string;
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
  group_id?: string;
  event_name: string;
  event_dates: string;
  event_start?: string;
  event_end?: string;
  event_description: string;
  ward: string;
  stake: string;
  leader_name: string;
  leader_phone: string;
  leader_email: string;
  notify_email?: string;
  notify_phone?: string;
  notify_carrier?: string;
  organizations: string;
  additional_details?: string;
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
  youth_program?: string;
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
}

export interface RealtimeEvent {
  action: 'create' | 'update' | 'delete';
  record: Record<string, unknown>;
}

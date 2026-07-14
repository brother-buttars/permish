// GENERATED FILE — do not edit.
// Source: shared/schema.ts · Regenerate: `bun run gen:schema`

export const SERVER_SCHEMA_DDL = `
CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    name TEXT NOT NULL,
    role TEXT NOT NULL CHECK(role IN ('super', 'user')),
    phone TEXT,
    address TEXT,
    city TEXT,
    state_province TEXT,
    guardian_signature TEXT,
    guardian_signature_type TEXT CHECK(guardian_signature_type IN ('drawn', 'typed', 'hand', NULL)),
    must_change_password INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT (datetime('now'))
  );

CREATE TABLE IF NOT EXISTS groups (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    type TEXT NOT NULL CHECK(type IN ('stake', 'ward', 'custom')),
    parent_id TEXT REFERENCES groups(id),
    ward TEXT,
    stake TEXT,
    leader_name TEXT,
    leader_phone TEXT,
    leader_email TEXT,
    invite_code TEXT UNIQUE,
    created_at DATETIME DEFAULT (datetime('now')),
    updated_at DATETIME DEFAULT (datetime('now'))
  );

CREATE TABLE IF NOT EXISTS events (
    id TEXT PRIMARY KEY,
    created_by TEXT NOT NULL REFERENCES users(id),
    group_id TEXT REFERENCES groups(id),
    event_name TEXT NOT NULL,
    event_dates TEXT NOT NULL,
    event_start TEXT,
    event_end TEXT,
    event_description TEXT NOT NULL,
    ward TEXT NOT NULL,
    stake TEXT NOT NULL,
    leader_name TEXT NOT NULL,
    leader_phone TEXT NOT NULL,
    leader_email TEXT NOT NULL,
    notify_email TEXT,
    notify_phone TEXT,
    notify_carrier TEXT,
    organizations TEXT DEFAULT '[]',
    additional_details TEXT,
    is_active INTEGER DEFAULT 1,
    created_at DATETIME DEFAULT (datetime('now'))
  );

CREATE TABLE IF NOT EXISTS event_attachments (
    id TEXT PRIMARY KEY,
    event_id TEXT NOT NULL REFERENCES events(id),
    filename TEXT NOT NULL,
    original_name TEXT NOT NULL,
    mime_type TEXT NOT NULL,
    size INTEGER NOT NULL,
    display_order INTEGER DEFAULT 0,
    uploaded_at DATETIME DEFAULT (datetime('now'))
  );

CREATE TABLE IF NOT EXISTS child_profiles (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id),
    participant_name TEXT NOT NULL,
    participant_dob TEXT NOT NULL,
    participant_phone TEXT,
    address TEXT,
    city TEXT,
    state_province TEXT,
    emergency_contact TEXT,
    emergency_phone_primary TEXT,
    emergency_phone_secondary TEXT,
    special_diet INTEGER DEFAULT 0,
    special_diet_details TEXT,
    allergies INTEGER DEFAULT 0,
    allergies_details TEXT,
    medications TEXT,
    can_self_administer_meds INTEGER,
    chronic_illness INTEGER DEFAULT 0,
    chronic_illness_details TEXT,
    recent_surgery INTEGER DEFAULT 0,
    recent_surgery_details TEXT,
    activity_limitations TEXT,
    other_accommodations TEXT,
    youth_program TEXT,
    updated_at DATETIME DEFAULT (datetime('now'))
  );

CREATE TABLE IF NOT EXISTS submissions (
    id TEXT PRIMARY KEY,
    event_id TEXT NOT NULL REFERENCES events(id),
    submitted_by TEXT REFERENCES users(id),
    participant_name TEXT NOT NULL,
    participant_dob TEXT NOT NULL,
    participant_age INTEGER NOT NULL,
    participant_phone TEXT,
    address TEXT,
    city TEXT,
    state_province TEXT,
    emergency_contact TEXT,
    emergency_phone_primary TEXT,
    emergency_phone_secondary TEXT,
    special_diet INTEGER DEFAULT 0,
    special_diet_details TEXT,
    allergies INTEGER DEFAULT 0,
    allergies_details TEXT,
    medications TEXT,
    can_self_administer_meds INTEGER,
    chronic_illness INTEGER DEFAULT 0,
    chronic_illness_details TEXT,
    recent_surgery INTEGER DEFAULT 0,
    recent_surgery_details TEXT,
    activity_limitations TEXT,
    other_accommodations TEXT,
    participant_signature TEXT,
    participant_signature_type TEXT NOT NULL CHECK(participant_signature_type IN ('drawn', 'typed', 'hand')),
    participant_signature_date TEXT NOT NULL,
    guardian_signature TEXT,
    guardian_signature_type TEXT CHECK(guardian_signature_type IN ('drawn', 'typed', 'hand', NULL)),
    guardian_signature_date TEXT,
    pdf_path TEXT,
    submitted_at DATETIME DEFAULT (datetime('now'))
  );

CREATE TABLE IF NOT EXISTS password_reset_tokens (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id),
    token TEXT NOT NULL UNIQUE,
    expires_at DATETIME NOT NULL,
    used INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT (datetime('now'))
  );

CREATE TABLE IF NOT EXISTS group_members (
    id TEXT PRIMARY KEY,
    group_id TEXT NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role TEXT NOT NULL CHECK(role IN ('admin', 'member')) DEFAULT 'member',
    joined_at DATETIME DEFAULT (datetime('now')),
    UNIQUE(group_id, user_id)
  );

CREATE TABLE IF NOT EXISTS group_invites (
    id TEXT PRIMARY KEY,
    group_id TEXT NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
    code TEXT UNIQUE,
    token TEXT UNIQUE,
    role TEXT NOT NULL CHECK(role IN ('admin', 'member')) DEFAULT 'member',
    email TEXT,
    max_uses INTEGER,
    used_count INTEGER NOT NULL DEFAULT 0,
    expires_at DATETIME,
    created_by TEXT REFERENCES users(id) ON DELETE SET NULL,
    created_at DATETIME DEFAULT (datetime('now')),
    revoked_at DATETIME,
    accepted_at DATETIME,
    accepted_by TEXT REFERENCES users(id) ON DELETE SET NULL
  );

CREATE TABLE IF NOT EXISTS audit_log (
    id TEXT PRIMARY KEY,
    actor_id TEXT REFERENCES users(id) ON DELETE SET NULL,
    action TEXT NOT NULL,
    target_type TEXT,
    target_id TEXT,
    group_id TEXT REFERENCES groups(id) ON DELETE CASCADE,
    meta TEXT,
    created_at DATETIME DEFAULT (datetime('now'))
  );

CREATE INDEX IF NOT EXISTS idx_events_created_by ON events(created_by);

CREATE INDEX IF NOT EXISTS idx_submissions_event_id ON submissions(event_id);

CREATE INDEX IF NOT EXISTS idx_submissions_submitted_by ON submissions(submitted_by);

CREATE INDEX IF NOT EXISTS idx_child_profiles_user_id ON child_profiles(user_id);

CREATE INDEX IF NOT EXISTS idx_event_attachments_event_id ON event_attachments(event_id);

CREATE INDEX IF NOT EXISTS idx_group_members_group ON group_members(group_id);

CREATE INDEX IF NOT EXISTS idx_group_members_user ON group_members(user_id);

CREATE INDEX IF NOT EXISTS idx_groups_parent ON groups(parent_id);

CREATE INDEX IF NOT EXISTS idx_group_invites_group ON group_invites(group_id);

CREATE INDEX IF NOT EXISTS idx_group_invites_code ON group_invites(code);

CREATE INDEX IF NOT EXISTS idx_group_invites_token ON group_invites(token);

CREATE INDEX IF NOT EXISTS idx_audit_log_group ON audit_log(group_id, created_at);
`;

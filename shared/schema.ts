/**
 * Single source of truth for the Permish data model.
 *
 * The server (Bun + Hono, `bun:sqlite`) and the frontend local store (sql.js)
 * both derive their SQLite DDL from THIS file, and the sync engine derives its
 * column lists from it too. Edit a table here, run `bun run gen:schema` (from
 * repo root), and the server schema, the local schema, and the sync SQL all
 * regenerate — no more authoring the model in three places.
 *
 * This module is plain, dependency-free TypeScript imported only by the codegen
 * script (`scripts/gen-schema.ts`), never at runtime.
 */

export type Target = 'server' | 'local';

export interface ColumnDef {
  name: string;
  /** Full SQL type + inline constraints, e.g. "TEXT NOT NULL" or "INTEGER DEFAULT 0". */
  type: string;
  /** Which targets include this column. Omitted = both. */
  targets?: Target[];
}

export interface TableDef {
  name: string;
  /** Which targets create this table. Omitted = both. */
  targets?: Target[];
  columns: ColumnDef[];
  /** Extra table-level constraints, e.g. "UNIQUE(group_id, user_id)". */
  constraints?: string[];
}

export interface IndexDef {
  name: string;
  /** Index body, e.g. "events(created_by)" or "audit_log(group_id, created_at)". */
  on: string;
  /** Optional partial-index predicate (without the WHERE keyword). */
  where?: string;
  targets?: Target[];
}

// --- Reusable column groups -------------------------------------------------

// Domain fields shared verbatim by child_profiles and submissions.
const MEDICAL_COLUMNS: ColumnDef[] = [
  { name: 'participant_phone', type: 'TEXT' },
  { name: 'address', type: 'TEXT' },
  { name: 'city', type: 'TEXT' },
  { name: 'state_province', type: 'TEXT' },
  { name: 'emergency_contact', type: 'TEXT' },
  { name: 'emergency_phone_primary', type: 'TEXT' },
  { name: 'emergency_phone_secondary', type: 'TEXT' },
  { name: 'special_diet', type: 'INTEGER DEFAULT 0' },
  { name: 'special_diet_details', type: 'TEXT' },
  { name: 'allergies', type: 'INTEGER DEFAULT 0' },
  { name: 'allergies_details', type: 'TEXT' },
  { name: 'medications', type: 'TEXT' },
  { name: 'can_self_administer_meds', type: 'INTEGER' },
  { name: 'chronic_illness', type: 'INTEGER DEFAULT 0' },
  { name: 'chronic_illness_details', type: 'TEXT' },
  { name: 'recent_surgery', type: 'INTEGER DEFAULT 0' },
  { name: 'recent_surgery_details', type: 'TEXT' },
  { name: 'activity_limitations', type: 'TEXT' },
  { name: 'other_accommodations', type: 'TEXT' },
];

// Timestamp columns differ per target: the server uses domain-specific DATETIME
// names; the local store uses generic created/updated TEXT columns for sync.
const serverTs = (name: string): ColumnDef => ({ name, type: "DATETIME DEFAULT (datetime('now'))", targets: ['server'] });
const localCreatedUpdated: ColumnDef[] = [
  { name: 'created', type: "TEXT DEFAULT (datetime('now'))", targets: ['local'] },
  { name: 'updated', type: "TEXT DEFAULT (datetime('now'))", targets: ['local'] },
];

// --- Tables (creation order respects FK references) -------------------------

export const TABLES: TableDef[] = [
  {
    name: 'local_meta',
    targets: ['local'],
    columns: [
      { name: 'key', type: 'TEXT PRIMARY KEY' },
      { name: 'value', type: 'TEXT' },
    ],
  },
  {
    name: 'users',
    columns: [
      { name: 'id', type: 'TEXT PRIMARY KEY' },
      { name: 'email', type: 'TEXT UNIQUE NOT NULL' },
      { name: 'password_hash', type: 'TEXT NOT NULL' },
      { name: 'name', type: 'TEXT NOT NULL' },
      { name: 'role', type: "TEXT NOT NULL CHECK(role IN ('super', 'user'))" },
      { name: 'phone', type: 'TEXT' },
      { name: 'address', type: 'TEXT' },
      { name: 'city', type: 'TEXT' },
      { name: 'state_province', type: 'TEXT' },
      { name: 'guardian_signature', type: 'TEXT' },
      { name: 'guardian_signature_type', type: "TEXT CHECK(guardian_signature_type IN ('drawn', 'typed', 'hand', NULL))" },
      { name: 'must_change_password', type: 'INTEGER DEFAULT 0', targets: ['server'] },
      serverTs('created_at'),
      ...localCreatedUpdated,
    ],
  },
  {
    name: 'groups',
    columns: [
      { name: 'id', type: 'TEXT PRIMARY KEY' },
      { name: 'name', type: 'TEXT NOT NULL' },
      { name: 'type', type: "TEXT NOT NULL CHECK(type IN ('stake', 'ward', 'custom'))" },
      { name: 'parent_id', type: 'TEXT REFERENCES groups(id)' },
      { name: 'ward', type: 'TEXT' },
      { name: 'stake', type: 'TEXT' },
      { name: 'leader_name', type: 'TEXT' },
      { name: 'leader_phone', type: 'TEXT' },
      { name: 'leader_email', type: 'TEXT' },
      { name: 'invite_code', type: 'TEXT UNIQUE' },
      serverTs('created_at'),
      serverTs('updated_at'),
      ...localCreatedUpdated,
    ],
  },
  {
    name: 'events',
    columns: [
      { name: 'id', type: 'TEXT PRIMARY KEY' },
      { name: 'created_by', type: 'TEXT NOT NULL REFERENCES users(id)' },
      { name: 'group_id', type: 'TEXT REFERENCES groups(id)' },
      { name: 'event_name', type: 'TEXT NOT NULL' },
      { name: 'event_dates', type: 'TEXT NOT NULL' },
      { name: 'event_start', type: 'TEXT' },
      { name: 'event_end', type: 'TEXT' },
      { name: 'event_description', type: 'TEXT NOT NULL' },
      { name: 'ward', type: 'TEXT NOT NULL' },
      { name: 'stake', type: 'TEXT NOT NULL' },
      { name: 'leader_name', type: 'TEXT NOT NULL' },
      { name: 'leader_phone', type: 'TEXT NOT NULL' },
      { name: 'leader_email', type: 'TEXT NOT NULL' },
      { name: 'notify_email', type: 'TEXT' },
      { name: 'notify_phone', type: 'TEXT' },
      { name: 'notify_carrier', type: 'TEXT' },
      { name: 'organizations', type: "TEXT DEFAULT '[]'" },
      { name: 'additional_details', type: 'TEXT' },
      { name: 'is_active', type: 'INTEGER DEFAULT 1' },
      serverTs('created_at'),
      ...localCreatedUpdated,
    ],
  },
  {
    name: 'event_attachments',
    columns: [
      { name: 'id', type: 'TEXT PRIMARY KEY' },
      { name: 'event_id', type: 'TEXT NOT NULL REFERENCES events(id)' },
      { name: 'filename', type: 'TEXT NOT NULL' },
      { name: 'original_name', type: 'TEXT NOT NULL' },
      { name: 'mime_type', type: 'TEXT NOT NULL' },
      { name: 'size', type: 'INTEGER NOT NULL' },
      { name: 'display_order', type: 'INTEGER DEFAULT 0' },
      { name: 'blob_data', type: 'BLOB', targets: ['local'] },
      serverTs('uploaded_at'),
      ...localCreatedUpdated,
    ],
  },
  {
    name: 'child_profiles',
    columns: [
      { name: 'id', type: 'TEXT PRIMARY KEY' },
      { name: 'user_id', type: 'TEXT NOT NULL REFERENCES users(id)' },
      { name: 'participant_name', type: 'TEXT NOT NULL' },
      { name: 'participant_dob', type: 'TEXT NOT NULL' },
      ...MEDICAL_COLUMNS,
      { name: 'youth_program', type: 'TEXT' },
      serverTs('updated_at'),
      ...localCreatedUpdated,
    ],
  },
  {
    name: 'submissions',
    columns: [
      { name: 'id', type: 'TEXT PRIMARY KEY' },
      { name: 'event_id', type: 'TEXT NOT NULL REFERENCES events(id)' },
      { name: 'submitted_by', type: 'TEXT REFERENCES users(id)' },
      { name: 'participant_name', type: 'TEXT NOT NULL' },
      { name: 'participant_dob', type: 'TEXT NOT NULL' },
      { name: 'participant_age', type: 'INTEGER NOT NULL' },
      ...MEDICAL_COLUMNS,
      { name: 'participant_signature', type: 'TEXT' },
      { name: 'participant_signature_type', type: "TEXT NOT NULL CHECK(participant_signature_type IN ('drawn', 'typed', 'hand'))" },
      { name: 'participant_signature_date', type: 'TEXT NOT NULL' },
      { name: 'guardian_signature', type: 'TEXT' },
      { name: 'guardian_signature_type', type: "TEXT CHECK(guardian_signature_type IN ('drawn', 'typed', 'hand', NULL))" },
      { name: 'guardian_signature_date', type: 'TEXT' },
      { name: 'pdf_path', type: 'TEXT' },
      serverTs('submitted_at'),
      ...localCreatedUpdated,
    ],
  },
  {
    name: 'password_reset_tokens',
    targets: ['server'],
    columns: [
      { name: 'id', type: 'TEXT PRIMARY KEY' },
      { name: 'user_id', type: 'TEXT NOT NULL REFERENCES users(id)' },
      { name: 'token', type: 'TEXT NOT NULL UNIQUE' },
      { name: 'expires_at', type: 'DATETIME NOT NULL' },
      { name: 'used', type: 'INTEGER DEFAULT 0' },
      serverTs('created_at'),
    ],
  },
  {
    name: 'group_members',
    columns: [
      { name: 'id', type: 'TEXT PRIMARY KEY' },
      { name: 'group_id', type: 'TEXT NOT NULL REFERENCES groups(id) ON DELETE CASCADE' },
      { name: 'user_id', type: 'TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE' },
      { name: 'role', type: "TEXT NOT NULL CHECK(role IN ('admin', 'member')) DEFAULT 'member'" },
      { name: 'joined_at', type: "DATETIME DEFAULT (datetime('now'))" },
    ],
    constraints: ['UNIQUE(group_id, user_id)'],
  },
  {
    name: 'group_invites',
    columns: [
      { name: 'id', type: 'TEXT PRIMARY KEY' },
      { name: 'group_id', type: 'TEXT NOT NULL REFERENCES groups(id) ON DELETE CASCADE' },
      { name: 'code', type: 'TEXT UNIQUE' },
      { name: 'token', type: 'TEXT UNIQUE' },
      { name: 'role', type: "TEXT NOT NULL CHECK(role IN ('admin', 'member')) DEFAULT 'member'" },
      { name: 'email', type: 'TEXT' },
      { name: 'max_uses', type: 'INTEGER' },
      { name: 'used_count', type: 'INTEGER NOT NULL DEFAULT 0' },
      { name: 'expires_at', type: 'DATETIME' },
      { name: 'created_by', type: 'TEXT REFERENCES users(id) ON DELETE SET NULL' },
      serverTs('created_at'),
      { name: 'created_at', type: "TEXT DEFAULT (datetime('now'))", targets: ['local'] },
      { name: 'revoked_at', type: 'DATETIME' },
      { name: 'accepted_at', type: 'DATETIME' },
      { name: 'accepted_by', type: 'TEXT REFERENCES users(id) ON DELETE SET NULL' },
    ],
  },
  {
    name: 'audit_log',
    columns: [
      { name: 'id', type: 'TEXT PRIMARY KEY' },
      { name: 'actor_id', type: 'TEXT REFERENCES users(id) ON DELETE SET NULL' },
      { name: 'action', type: 'TEXT NOT NULL' },
      { name: 'target_type', type: 'TEXT' },
      { name: 'target_id', type: 'TEXT' },
      { name: 'group_id', type: 'TEXT REFERENCES groups(id) ON DELETE CASCADE' },
      { name: 'meta', type: 'TEXT' },
      serverTs('created_at'),
      { name: 'created_at', type: "TEXT DEFAULT (datetime('now'))", targets: ['local'] },
    ],
  },
  {
    name: 'pending_changes',
    targets: ['local'],
    columns: [
      { name: 'id', type: 'TEXT PRIMARY KEY' },
      { name: 'collection', type: 'TEXT NOT NULL' },
      { name: 'record_id', type: 'TEXT NOT NULL' },
      { name: 'operation', type: "TEXT NOT NULL CHECK(operation IN ('create', 'update', 'delete', 'delete-permanent', 'reassign'))" },
      { name: 'payload', type: 'TEXT NOT NULL' },
      { name: 'created_at', type: "TEXT NOT NULL DEFAULT (datetime('now'))" },
      { name: 'synced_at', type: 'TEXT' },
      { name: 'retry_count', type: 'INTEGER DEFAULT 0' },
      { name: 'last_error', type: 'TEXT' },
    ],
  },
];

export const INDEXES: IndexDef[] = [
  { name: 'idx_events_created_by', on: 'events(created_by)' },
  { name: 'idx_submissions_event_id', on: 'submissions(event_id)' },
  { name: 'idx_submissions_submitted_by', on: 'submissions(submitted_by)' },
  { name: 'idx_child_profiles_user_id', on: 'child_profiles(user_id)' },
  { name: 'idx_event_attachments_event_id', on: 'event_attachments(event_id)' },
  { name: 'idx_pending_unsynced', on: 'pending_changes(synced_at)', where: 'synced_at IS NULL', targets: ['local'] },
  { name: 'idx_group_members_group', on: 'group_members(group_id)' },
  { name: 'idx_group_members_user', on: 'group_members(user_id)' },
  { name: 'idx_groups_parent', on: 'groups(parent_id)' },
  { name: 'idx_group_invites_group', on: 'group_invites(group_id)' },
  { name: 'idx_group_invites_code', on: 'group_invites(code)' },
  { name: 'idx_group_invites_token', on: 'group_invites(token)' },
  { name: 'idx_audit_log_group', on: 'audit_log(group_id, created_at)' },
];

// --- Sync column specs ------------------------------------------------------
// Which domain columns the sync engine pushes/pulls per collection, in order.
// kind drives value coercion: 'bool' → 1/0, 'nbool' → null|1|0, 'plain' → value ?? null.

export type SyncKind = 'plain' | 'bool' | 'nbool';
export interface SyncField { name: string; kind: SyncKind }

const boolSet = new Set(['special_diet', 'allergies', 'chronic_illness', 'recent_surgery', 'is_active']);
const nboolSet = new Set(['can_self_administer_meds']);
const kindOf = (name: string): SyncKind => (nboolSet.has(name) ? 'nbool' : boolSet.has(name) ? 'bool' : 'plain');
const fields = (names: string[]): SyncField[] => names.map((name) => ({ name, kind: kindOf(name) }));

export interface SyncSpec {
  /** Immutable identity columns set only on INSERT (never in UPDATE SET). */
  immutable: string[];
  /** All syncable columns in order (identity first). */
  columns: SyncField[];
  /** Whether pull updates existing rows, or only inserts new ones. */
  updateOnPull: boolean;
}

export const SYNC: Record<'events' | 'child_profiles' | 'submissions', SyncSpec> = {
  events: {
    immutable: ['id', 'created_by'],
    columns: fields([
      'id', 'created_by', 'group_id', 'event_name', 'event_dates', 'event_start', 'event_end',
      'event_description', 'ward', 'stake', 'leader_name', 'leader_phone', 'leader_email',
      'notify_email', 'notify_phone', 'notify_carrier', 'organizations', 'additional_details', 'is_active',
    ]),
    updateOnPull: true,
  },
  child_profiles: {
    immutable: ['id', 'user_id'],
    columns: fields([
      'id', 'user_id', 'participant_name', 'participant_dob', 'participant_phone', 'address', 'city',
      'state_province', 'emergency_contact', 'emergency_phone_primary', 'emergency_phone_secondary',
      'special_diet', 'special_diet_details', 'allergies', 'allergies_details', 'medications',
      'can_self_administer_meds', 'chronic_illness', 'chronic_illness_details', 'recent_surgery',
      'recent_surgery_details', 'activity_limitations', 'other_accommodations', 'youth_program',
    ]),
    updateOnPull: true,
  },
  submissions: {
    immutable: ['id', 'event_id', 'submitted_by'],
    columns: fields([
      'id', 'event_id', 'submitted_by', 'participant_name', 'participant_dob', 'participant_age',
      'participant_phone', 'address', 'city', 'state_province', 'emergency_contact', 'emergency_phone_primary',
      'emergency_phone_secondary', 'special_diet', 'special_diet_details', 'allergies', 'allergies_details',
      'medications', 'can_self_administer_meds', 'chronic_illness', 'chronic_illness_details', 'recent_surgery',
      'recent_surgery_details', 'activity_limitations', 'other_accommodations', 'participant_signature',
      'participant_signature_type', 'participant_signature_date', 'guardian_signature', 'guardian_signature_type',
      'guardian_signature_date', 'pdf_path',
    ]),
    updateOnPull: false,
  },
};

// --- Generators -------------------------------------------------------------

function columnsFor(table: TableDef, target: Target): ColumnDef[] {
  return table.columns.filter((c) => !c.targets || c.targets.includes(target));
}

function tableApplies(table: TableDef, target: Target): boolean {
  return !table.targets || table.targets.includes(target);
}

/** Build the full CREATE TABLE + CREATE INDEX DDL for a target. */
export function buildSchemaDdl(target: Target): string {
  const parts: string[] = [];
  for (const table of TABLES) {
    if (!tableApplies(table, target)) continue;
    const cols = columnsFor(table, target).map((c) => `    ${c.name} ${c.type}`);
    const constraints = (table.constraints || []).map((c) => `    ${c}`);
    const body = [...cols, ...constraints].join(',\n');
    parts.push(`CREATE TABLE IF NOT EXISTS ${table.name} (\n${body}\n  )`);
  }
  for (const idx of INDEXES) {
    if (idx.targets && !idx.targets.includes(target)) continue;
    const where = idx.where ? ` WHERE ${idx.where}` : '';
    parts.push(`CREATE INDEX IF NOT EXISTS ${idx.name} ON ${idx.on}${where}`);
  }
  return parts.join(';\n\n') + ';\n';
}

function migrate(db) {
  // Add user profile fields if they don't exist
  const userCols = db.prepare("PRAGMA table_info(users)").all().map(c => c.name);
  const newUserCols = {
    phone: 'TEXT',
    address: 'TEXT',
    city: 'TEXT',
    state_province: 'TEXT',
    guardian_signature: 'TEXT',
    guardian_signature_type: 'TEXT',
  };
  for (const [col, type] of Object.entries(newUserCols)) {
    if (!userCols.includes(col)) {
      db.exec(`ALTER TABLE users ADD COLUMN ${col} ${type}`);
    }
  }

  // Remove guardian signature from child_profiles (belongs on users table, not profiles)
  const profileCols = db.prepare("PRAGMA table_info(child_profiles)").all().map(c => c.name);
  if (profileCols.includes('guardian_signature')) {
    db.exec("ALTER TABLE child_profiles DROP COLUMN guardian_signature");
  }
  if (profileCols.includes('guardian_signature_type')) {
    db.exec("ALTER TABLE child_profiles DROP COLUMN guardian_signature_type");
  }

  // Recreate submissions table to allow 'hand' signature type and nullable participant_signature
  let needsSubmissionMigration = false;
  try {
    db.exec("SAVEPOINT check_hand_sub");
    db.prepare("INSERT INTO submissions (id, event_id, participant_name, participant_dob, participant_age, participant_signature_type, participant_signature_date) VALUES ('__test__', '__test__', 'test', '2000-01-01', 20, 'hand', '2026-01-01')").run();
    db.exec("ROLLBACK TO check_hand_sub");
    db.exec("RELEASE check_hand_sub");
  } catch {
    needsSubmissionMigration = true;
    try { db.exec("ROLLBACK TO check_hand_sub"); } catch {}
    try { db.exec("RELEASE check_hand_sub"); } catch {}
  }
  if (needsSubmissionMigration) {
    db.exec(`
      CREATE TABLE submissions_new (
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
        submitted_at DATETIME DEFAULT (datetime('now')),
        pdf_path TEXT
      );
      INSERT INTO submissions_new SELECT * FROM submissions;
      DROP TABLE submissions;
      ALTER TABLE submissions_new RENAME TO submissions;
    `);
  }

  // Recreate users table to allow 'hand' guardian_signature_type
  let needsUserMigration = false;
  if (userCols.includes('guardian_signature_type')) {
    try {
      db.exec("SAVEPOINT check_hand_user");
      db.prepare("UPDATE users SET guardian_signature_type = 'hand' WHERE 0").run();
      db.exec("ROLLBACK TO check_hand_user");
      db.exec("RELEASE check_hand_user");
    } catch {
      needsUserMigration = true;
      try { db.exec("ROLLBACK TO check_hand_user"); } catch {}
      try { db.exec("RELEASE check_hand_user"); } catch {}
    }
  }
  if (needsUserMigration) {
    db.exec(`
      CREATE TABLE users_new (
        id TEXT PRIMARY KEY,
        email TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        name TEXT NOT NULL,
        role TEXT NOT NULL CHECK(role IN ('super', 'planner', 'parent')),
        phone TEXT,
        address TEXT,
        city TEXT,
        state_province TEXT,
        guardian_signature TEXT,
        guardian_signature_type TEXT CHECK(guardian_signature_type IN ('drawn', 'typed', 'hand', NULL)),
        created_at DATETIME DEFAULT (datetime('now'))
      );
      INSERT INTO users_new SELECT * FROM users;
      DROP TABLE users;
      ALTER TABLE users_new RENAME TO users;
    `);
  }

  // Migrate users table to support 'super' role
  let needsSuperRoleMigration = false;
  try {
    db.exec("SAVEPOINT check_super_role");
    db.prepare("INSERT INTO users (id, email, password_hash, name, role) VALUES ('__test_super__', '__test__@test', '__hash__', 'test', 'super')").run();
    db.exec("ROLLBACK TO check_super_role");
    db.exec("RELEASE check_super_role");
  } catch {
    needsSuperRoleMigration = true;
    try { db.exec("ROLLBACK TO check_super_role"); } catch {}
    try { db.exec("RELEASE check_super_role"); } catch {}
  }
  if (needsSuperRoleMigration) {
    db.exec(`
      CREATE TABLE users_new2 (
        id TEXT PRIMARY KEY,
        email TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        name TEXT NOT NULL,
        role TEXT NOT NULL CHECK(role IN ('super', 'planner', 'parent')),
        phone TEXT,
        address TEXT,
        city TEXT,
        state_province TEXT,
        guardian_signature TEXT,
        guardian_signature_type TEXT CHECK(guardian_signature_type IN ('drawn', 'typed', 'hand', NULL)),
        created_at DATETIME DEFAULT (datetime('now'))
      );
      INSERT INTO users_new2 SELECT * FROM users;
      DROP TABLE users;
      ALTER TABLE users_new2 RENAME TO users;
    `);
  }

  // Add organizations column to events if missing
  const eventCols = db.prepare("PRAGMA table_info(events)").all().map(c => c.name);
  if (!eventCols.includes('organizations')) {
    db.exec("ALTER TABLE events ADD COLUMN organizations TEXT DEFAULT '[]'");
  }

  // Add structured date columns to events if missing
  if (!eventCols.includes('event_start')) {
    db.exec("ALTER TABLE events ADD COLUMN event_start TEXT");
  }
  if (!eventCols.includes('event_end')) {
    db.exec("ALTER TABLE events ADD COLUMN event_end TEXT");
  }

  // Add youth_program column to child_profiles if missing
  const profileCols2 = db.prepare("PRAGMA table_info(child_profiles)").all().map(c => c.name);
  if (!profileCols2.includes('youth_program')) {
    db.exec("ALTER TABLE child_profiles ADD COLUMN youth_program TEXT");
  }

  // Add additional_details column to events if missing
  if (!eventCols.includes('additional_details')) {
    db.exec("ALTER TABLE events ADD COLUMN additional_details TEXT");
  }

  // Create event_attachments table
  db.exec(`
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
  `);

  // Create password reset tokens table
  db.exec(`
    CREATE TABLE IF NOT EXISTS password_reset_tokens (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id),
      token TEXT NOT NULL UNIQUE,
      expires_at DATETIME NOT NULL,
      used INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT (datetime('now'))
    );
  `);

  // Create groups and group_members tables (idempotent)
  db.exec(`
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

    CREATE TABLE IF NOT EXISTS group_members (
      id TEXT PRIMARY KEY,
      group_id TEXT NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      role TEXT NOT NULL CHECK(role IN ('admin', 'member')) DEFAULT 'member',
      joined_at DATETIME DEFAULT (datetime('now')),
      UNIQUE(group_id, user_id)
    );
  `);

  // Add group_id to events table
  const eventCols2 = db.prepare("PRAGMA table_info(events)").all().map(c => c.name);
  if (!eventCols2.includes('group_id')) {
    db.exec("ALTER TABLE events ADD COLUMN group_id TEXT REFERENCES groups(id)");
  }

  // Migrate user roles: 'planner' -> 'user', 'parent' -> 'user', keep 'super'
  let needsRoleMigration = false;
  try {
    db.exec("SAVEPOINT check_user_role");
    db.prepare("INSERT INTO users (id, email, password_hash, name, role) VALUES ('__test_user_role__', '__test__@test', '__hash__', 'test', 'user')").run();
    db.exec("ROLLBACK TO check_user_role");
    db.exec("RELEASE check_user_role");
  } catch {
    needsRoleMigration = true;
    try { db.exec("ROLLBACK TO check_user_role"); } catch {}
    try { db.exec("RELEASE check_user_role"); } catch {}
  }
  if (needsRoleMigration) {
    // Temporarily disable foreign keys for table recreation
    db.pragma('foreign_keys = OFF');
    db.exec(`
      DROP TABLE IF EXISTS users_migrated;
      CREATE TABLE users_migrated (
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
        created_at DATETIME DEFAULT (datetime('now'))
      );
      INSERT INTO users_migrated SELECT id, email, password_hash, name,
        CASE WHEN role = 'super' THEN 'super' ELSE 'user' END,
        phone, address, city, state_province, guardian_signature, guardian_signature_type, created_at
      FROM users;
      DROP TABLE users;
      ALTER TABLE users_migrated RENAME TO users;
    `);
    db.pragma('foreign_keys = ON');
  }

  createIndexes(db);
}

function createIndexes(db) {
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_events_created_by ON events(created_by);
    CREATE INDEX IF NOT EXISTS idx_submissions_event_id ON submissions(event_id);
    CREATE INDEX IF NOT EXISTS idx_submissions_submitted_by ON submissions(submitted_by);
    CREATE INDEX IF NOT EXISTS idx_child_profiles_user_id ON child_profiles(user_id);
    CREATE INDEX IF NOT EXISTS idx_event_attachments_event_id ON event_attachments(event_id);
    CREATE INDEX IF NOT EXISTS idx_group_members_group ON group_members(group_id);
    CREATE INDEX IF NOT EXISTS idx_group_members_user ON group_members(user_id);
    CREATE INDEX IF NOT EXISTS idx_groups_parent ON groups(parent_id);
    CREATE INDEX IF NOT EXISTS idx_groups_invite_code ON groups(invite_code);
  `);
}

function createTables(db) {
  db.exec(`
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
      created_at DATETIME DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS events (
      id TEXT PRIMARY KEY,
      created_by TEXT NOT NULL REFERENCES users(id),
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
      group_id TEXT REFERENCES groups(id),
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
      submitted_at DATETIME DEFAULT (datetime('now')),
      pdf_path TEXT
    );
  `);
  // Create password reset tokens table
  db.exec(`
    CREATE TABLE IF NOT EXISTS password_reset_tokens (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id),
      token TEXT NOT NULL UNIQUE,
      expires_at DATETIME NOT NULL,
      used INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT (datetime('now'))
    );
  `);

  // Groups and group membership tables
  db.exec(`
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

    CREATE TABLE IF NOT EXISTS group_members (
      id TEXT PRIMARY KEY,
      group_id TEXT NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      role TEXT NOT NULL CHECK(role IN ('admin', 'member')) DEFAULT 'member',
      joined_at DATETIME DEFAULT (datetime('now')),
      UNIQUE(group_id, user_id)
    );
  `);

  createIndexes(db);
}

async function bootstrapSuperAdmin(db) {
  const existing = db.prepare("SELECT id FROM users WHERE role = 'super'").get();
  if (existing) return;

  const bcrypt = require('bcryptjs');
  const { randomUUID } = require('crypto');
  const id = randomUUID();
  const password_hash = await bcrypt.hash('#ChildOfGod!', 10);
  db.prepare('INSERT INTO users (id, email, password_hash, name, role) VALUES (?, ?, ?, ?, ?)')
    .run(id, 'brandonbuttars@gmail.com', password_hash, 'Brandon Buttars', 'super');
  console.log('Super admin account created (username: super)');
}

module.exports = { createTables, migrate, createIndexes, bootstrapSuperAdmin };

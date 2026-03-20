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
}

function createTables(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      name TEXT NOT NULL,
      role TEXT NOT NULL CHECK(role IN ('planner', 'parent')),
      phone TEXT,
      address TEXT,
      city TEXT,
      state_province TEXT,
      guardian_signature TEXT,
      guardian_signature_type TEXT CHECK(guardian_signature_type IN ('drawn', 'typed', NULL)),
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
      is_active INTEGER DEFAULT 1,
      created_at DATETIME DEFAULT (datetime('now'))
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
      guardian_signature TEXT,
      guardian_signature_type TEXT CHECK(guardian_signature_type IN ('drawn', 'typed', NULL)),
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
      participant_signature TEXT NOT NULL,
      participant_signature_type TEXT NOT NULL CHECK(participant_signature_type IN ('drawn', 'typed')),
      participant_signature_date TEXT NOT NULL,
      guardian_signature TEXT,
      guardian_signature_type TEXT CHECK(guardian_signature_type IN ('drawn', 'typed', NULL)),
      guardian_signature_date TEXT,
      submitted_at DATETIME DEFAULT (datetime('now')),
      pdf_path TEXT
    );
  `);
}

module.exports = { createTables, migrate };

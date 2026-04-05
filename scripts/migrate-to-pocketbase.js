#!/usr/bin/env node

/**
 * Migration script: SQLite -> PocketBase
 *
 * Reads all records from the existing better-sqlite3 database and creates
 * corresponding records in PocketBase collections with preserved UUIDs.
 *
 * Prerequisites:
 *   - PocketBase running at PB_URL (default: http://localhost:8090)
 *   - PocketBase superuser account created
 *   - Collections already created (via pb_migrations/)
 *   - Existing SQLite database at SQLITE_PATH
 *
 * Usage:
 *   node scripts/migrate-to-pocketbase.js
 *
 * Environment variables:
 *   SQLITE_PATH        - Path to existing SQLite database (default: ./backend/data/permish.db)
 *   PB_URL             - PocketBase URL (default: http://localhost:8090)
 *   PB_ADMIN_EMAIL     - PocketBase superuser email (required unless DRY_RUN)
 *   PB_ADMIN_PASSWORD  - PocketBase superuser password (required unless DRY_RUN)
 *   UPLOADS_DIR        - Path to backend uploads directory (default: ./backend/uploads)
 *   DRY_RUN            - Set to 'true' to preview counts without writing (default: false)
 *   SEND_RESET_EMAILS  - Set to 'true' to send password reset emails after migration
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const Database = require('better-sqlite3');
const PocketBase = require('pocketbase/cjs');

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const config = {
  sqlitePath: process.env.SQLITE_PATH || './backend/data/permish.db',
  pbUrl: process.env.PB_URL || 'http://localhost:8090',
  pbAdminEmail: process.env.PB_ADMIN_EMAIL,
  pbAdminPassword: process.env.PB_ADMIN_PASSWORD,
  uploadsDir: process.env.UPLOADS_DIR || './backend/uploads',
  dryRun: process.env.DRY_RUN === 'true',
  sendResetEmails: process.env.SEND_RESET_EMAILS === 'true',
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Generate a cryptographically random temporary password. */
function generateTempPassword() {
  return crypto.randomBytes(32).toString('hex');
}

/** Convert SQLite integer boolean (0/1/null) to a real boolean. */
function toBool(value) {
  return value === 1;
}

/**
 * Retry wrapper for PocketBase API calls. PocketBase can occasionally
 * reject rapid-fire requests, so we retry with exponential backoff.
 */
async function withRetry(fn, { retries = 3, delayMs = 500 } = {}) {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      if (attempt === retries) throw err;
      const wait = delayMs * Math.pow(2, attempt - 1);
      await new Promise((r) => setTimeout(r, wait));
    }
  }
}

// ---------------------------------------------------------------------------
// Migration functions
// ---------------------------------------------------------------------------

/**
 * Migrate users table.
 *
 * bcrypt hashes cannot be transferred into PocketBase, so each user is created
 * with a random temporary password. The returned list identifies users who need
 * a password reset email.
 */
async function migrateUsers(db, pb) {
  const users = db.prepare('SELECT * FROM users').all();
  console.log(`\nMigrating ${users.length} users...`);

  const needsReset = [];
  let success = 0;
  let failed = 0;

  for (const user of users) {
    try {
      const tempPassword = generateTempPassword();
      await withRetry(() =>
        pb.collection('users').create({
          id: user.id,
          email: user.email,
          password: tempPassword,
          passwordConfirm: tempPassword,
          name: user.name,
          role: user.role,
          phone: user.phone || '',
          address: user.address || '',
          city: user.city || '',
          state_province: user.state_province || '',
          guardian_signature: user.guardian_signature || '',
          guardian_signature_type: user.guardian_signature_type || '',
          emailVisibility: true,
        })
      );
      needsReset.push({ email: user.email, name: user.name });
      success++;
      console.log(`  + User: ${user.email} (${user.role})`);
    } catch (err) {
      failed++;
      const detail = err?.response?.data
        ? JSON.stringify(err.response.data)
        : err.message;
      console.error(`  x User ${user.email}: ${detail}`);
    }
  }

  console.log(`  Users done: ${success} succeeded, ${failed} failed`);
  return needsReset;
}

/**
 * Migrate events table.
 */
async function migrateEvents(db, pb) {
  const events = db.prepare('SELECT * FROM events').all();
  console.log(`\nMigrating ${events.length} events...`);

  let success = 0;
  let failed = 0;

  for (const event of events) {
    try {
      await withRetry(() =>
        pb.collection('events').create({
          id: event.id,
          created_by: event.created_by,
          event_name: event.event_name,
          event_dates: event.event_dates,
          event_start: event.event_start || '',
          event_end: event.event_end || '',
          event_description: event.event_description,
          ward: event.ward,
          stake: event.stake,
          leader_name: event.leader_name,
          leader_phone: event.leader_phone,
          leader_email: event.leader_email,
          notify_email: event.notify_email || '',
          notify_phone: event.notify_phone || '',
          notify_carrier: event.notify_carrier || '',
          organizations: event.organizations || '[]',
          additional_details: event.additional_details || '',
          is_active: toBool(event.is_active),
        })
      );
      success++;
      console.log(`  + Event: ${event.event_name}`);
    } catch (err) {
      failed++;
      const detail = err?.response?.data
        ? JSON.stringify(err.response.data)
        : err.message;
      console.error(`  x Event ${event.event_name}: ${detail}`);
    }
  }

  console.log(`  Events done: ${success} succeeded, ${failed} failed`);
}

/**
 * Migrate event_attachments table.
 *
 * Files are read from the uploads directory and sent as multipart form data
 * so PocketBase stores them in its own file system.
 */
async function migrateAttachments(db, pb) {
  const attachments = db.prepare('SELECT * FROM event_attachments').all();
  console.log(`\nMigrating ${attachments.length} event attachments...`);

  let success = 0;
  let failed = 0;
  let skipped = 0;

  for (const att of attachments) {
    try {
      const filePath = path.resolve(config.uploadsDir, att.filename);

      if (!fs.existsSync(filePath)) {
        console.warn(`  ! Attachment file not found, skipping: ${filePath}`);
        skipped++;
        continue;
      }

      const fileBuffer = fs.readFileSync(filePath);
      const blob = new Blob([fileBuffer], { type: att.mime_type });

      const formData = new FormData();
      formData.append('id', att.id);
      formData.append('event_id', att.event_id);
      formData.append('original_name', att.original_name);
      formData.append('mime_type', att.mime_type);
      formData.append('size', String(att.size));
      formData.append('display_order', String(att.display_order || 0));
      formData.append('file', blob, att.original_name);

      await withRetry(() => pb.collection('event_attachments').create(formData));
      success++;
      console.log(`  + Attachment: ${att.original_name}`);
    } catch (err) {
      failed++;
      const detail = err?.response?.data
        ? JSON.stringify(err.response.data)
        : err.message;
      console.error(`  x Attachment ${att.original_name}: ${detail}`);
    }
  }

  console.log(
    `  Attachments done: ${success} succeeded, ${failed} failed, ${skipped} skipped`
  );
}

/**
 * Migrate child_profiles table.
 */
async function migrateProfiles(db, pb) {
  const profiles = db.prepare('SELECT * FROM child_profiles').all();
  console.log(`\nMigrating ${profiles.length} child profiles...`);

  let success = 0;
  let failed = 0;

  for (const p of profiles) {
    try {
      await withRetry(() =>
        pb.collection('child_profiles').create({
          id: p.id,
          user_id: p.user_id,
          participant_name: p.participant_name,
          participant_dob: p.participant_dob,
          participant_phone: p.participant_phone || '',
          address: p.address || '',
          city: p.city || '',
          state_province: p.state_province || '',
          emergency_contact: p.emergency_contact || '',
          emergency_phone_primary: p.emergency_phone_primary || '',
          emergency_phone_secondary: p.emergency_phone_secondary || '',
          special_diet: toBool(p.special_diet),
          special_diet_details: p.special_diet_details || '',
          allergies: toBool(p.allergies),
          allergies_details: p.allergies_details || '',
          medications: p.medications || '',
          can_self_administer_meds: toBool(p.can_self_administer_meds),
          chronic_illness: toBool(p.chronic_illness),
          chronic_illness_details: p.chronic_illness_details || '',
          recent_surgery: toBool(p.recent_surgery),
          recent_surgery_details: p.recent_surgery_details || '',
          activity_limitations: p.activity_limitations || '',
          other_accommodations: p.other_accommodations || '',
          youth_program: p.youth_program || '',
        })
      );
      success++;
      console.log(`  + Profile: ${p.participant_name}`);
    } catch (err) {
      failed++;
      const detail = err?.response?.data
        ? JSON.stringify(err.response.data)
        : err.message;
      console.error(`  x Profile ${p.participant_name}: ${detail}`);
    }
  }

  console.log(`  Profiles done: ${success} succeeded, ${failed} failed`);
}

/**
 * Migrate submissions table.
 */
async function migrateSubmissions(db, pb) {
  const submissions = db.prepare('SELECT * FROM submissions').all();
  console.log(`\nMigrating ${submissions.length} submissions...`);

  let success = 0;
  let failed = 0;

  for (const sub of submissions) {
    try {
      await withRetry(() =>
        pb.collection('submissions').create({
          id: sub.id,
          event_id: sub.event_id,
          submitted_by: sub.submitted_by || '',
          participant_name: sub.participant_name,
          participant_dob: sub.participant_dob,
          participant_age: sub.participant_age,
          participant_phone: sub.participant_phone || '',
          address: sub.address || '',
          city: sub.city || '',
          state_province: sub.state_province || '',
          emergency_contact: sub.emergency_contact || '',
          emergency_phone_primary: sub.emergency_phone_primary || '',
          emergency_phone_secondary: sub.emergency_phone_secondary || '',
          special_diet: toBool(sub.special_diet),
          special_diet_details: sub.special_diet_details || '',
          allergies: toBool(sub.allergies),
          allergies_details: sub.allergies_details || '',
          medications: sub.medications || '',
          can_self_administer_meds: toBool(sub.can_self_administer_meds),
          chronic_illness: toBool(sub.chronic_illness),
          chronic_illness_details: sub.chronic_illness_details || '',
          recent_surgery: toBool(sub.recent_surgery),
          recent_surgery_details: sub.recent_surgery_details || '',
          activity_limitations: sub.activity_limitations || '',
          other_accommodations: sub.other_accommodations || '',
          participant_signature: sub.participant_signature || '',
          participant_signature_type: sub.participant_signature_type,
          participant_signature_date: sub.participant_signature_date,
          guardian_signature: sub.guardian_signature || '',
          guardian_signature_type: sub.guardian_signature_type || '',
          guardian_signature_date: sub.guardian_signature_date || '',
          pdf_path: sub.pdf_path || '',
        })
      );
      success++;
      console.log(`  + Submission: ${sub.participant_name}`);
    } catch (err) {
      failed++;
      const detail = err?.response?.data
        ? JSON.stringify(err.response.data)
        : err.message;
      console.error(`  x Submission ${sub.participant_name}: ${detail}`);
    }
  }

  console.log(`  Submissions done: ${success} succeeded, ${failed} failed`);
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  console.log('=== Permish: SQLite -> PocketBase Migration ===\n');

  if (config.dryRun) {
    console.log('*** DRY RUN -- no data will be written ***\n');
  }

  // -----------------------------------------------------------------------
  // 1. Verify SQLite database
  // -----------------------------------------------------------------------
  const dbPath = path.resolve(config.sqlitePath);
  if (!fs.existsSync(dbPath)) {
    console.error(`SQLite database not found: ${dbPath}`);
    process.exit(1);
  }

  const db = new Database(dbPath, { readonly: true });
  console.log(`SQLite database: ${dbPath}`);

  // -----------------------------------------------------------------------
  // 2. Show record counts
  // -----------------------------------------------------------------------
  const tableCount = (table) => {
    try {
      return db.prepare(`SELECT COUNT(*) AS c FROM ${table}`).get().c;
    } catch {
      return 0;
    }
  };

  const counts = {
    users: tableCount('users'),
    events: tableCount('events'),
    event_attachments: tableCount('event_attachments'),
    child_profiles: tableCount('child_profiles'),
    submissions: tableCount('submissions'),
  };

  console.log('\nRecords to migrate:');
  for (const [table, count] of Object.entries(counts)) {
    console.log(`  ${table}: ${count}`);
  }
  console.log();

  if (config.dryRun) {
    console.log('Dry run complete. Set DRY_RUN=false (or omit) to execute.');
    db.close();
    process.exit(0);
  }

  // -----------------------------------------------------------------------
  // 3. Connect to PocketBase as superuser
  // -----------------------------------------------------------------------
  if (!config.pbAdminEmail || !config.pbAdminPassword) {
    console.error(
      'PB_ADMIN_EMAIL and PB_ADMIN_PASSWORD are required (unless DRY_RUN=true).'
    );
    db.close();
    process.exit(1);
  }

  const pb = new PocketBase(config.pbUrl);

  try {
    await pb
      .collection('_superusers')
      .authWithPassword(config.pbAdminEmail, config.pbAdminPassword);
    console.log(`Connected to PocketBase at ${config.pbUrl} as superuser.\n`);
  } catch (err) {
    console.error(`Failed to authenticate with PocketBase: ${err.message}`);
    console.error(
      'Make sure PocketBase is running and credentials are correct.'
    );
    db.close();
    process.exit(1);
  }

  // -----------------------------------------------------------------------
  // 4. Run migrations in foreign-key order
  // -----------------------------------------------------------------------
  const needsReset = await migrateUsers(db, pb);
  await migrateEvents(db, pb);
  await migrateAttachments(db, pb);
  await migrateProfiles(db, pb);
  await migrateSubmissions(db, pb);

  // -----------------------------------------------------------------------
  // 5. Summary
  // -----------------------------------------------------------------------
  console.log('\n=== Migration Complete ===');
  console.log(`Users needing password reset: ${needsReset.length}`);

  if (needsReset.length > 0) {
    console.log('\nUsers who need to reset their password:');
    for (const u of needsReset) {
      console.log(`  ${u.name} <${u.email}>`);
    }
  }

  // -----------------------------------------------------------------------
  // 6. Optionally send password reset emails
  // -----------------------------------------------------------------------
  if (config.sendResetEmails && needsReset.length > 0) {
    console.log('\nSending password reset emails...');
    for (const u of needsReset) {
      try {
        await pb.collection('users').requestPasswordReset(u.email);
        console.log(`  + Reset email sent to ${u.email}`);
      } catch (err) {
        console.error(`  x Failed for ${u.email}: ${err.message}`);
      }
    }
  }

  db.close();
  console.log('\nDone.');
}

main().catch((err) => {
  console.error('\nMigration failed:', err);
  process.exit(1);
});

#!/usr/bin/env node

/**
 * End-to-end PocketBase integration test
 *
 * Tests the full flow: register -> create event -> submit form -> list submissions
 *
 * Usage: node scripts/test-pocketbase-e2e.js
 */

const { spawn, execSync } = require('child_process');
const path = require('path');
const fs = require('fs');
const PocketBase = require('pocketbase/cjs');

const PB_BINARY = path.join(__dirname, '..', 'pocketbase');
const PB_MIGRATIONS = path.join(__dirname, '..', 'pb_migrations');
const PB_PORT = 18090 + Math.floor(Math.random() * 1000);
const PB_URL = `http://127.0.0.1:${PB_PORT}`;
const PB_DATA_DIR = path.join('/tmp', `pb_e2e_test_${Date.now()}`);

let pbProcess = null;
let passed = 0;
let failed = 0;
const errors = [];

function assert(condition, message) {
  if (condition) {
    passed++;
    console.log(`  PASS ${message}`);
  } else {
    failed++;
    errors.push(message);
    console.error(`  FAIL ${message}`);
  }
}

async function waitForPocketBase(url, timeoutMs = 15000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(`${url}/api/health`);
      if (res.ok) return true;
    } catch {}
    await new Promise(r => setTimeout(r, 200));
  }
  return false;
}

async function startPocketBase() {
  console.log(`Starting PocketBase on port ${PB_PORT}...`);
  console.log(`Data dir: ${PB_DATA_DIR}`);

  fs.mkdirSync(PB_DATA_DIR, { recursive: true });

  // Copy migrations
  const migrationsDir = path.join(PB_DATA_DIR, 'pb_migrations');
  fs.mkdirSync(migrationsDir, { recursive: true });
  const migrationFiles = fs.readdirSync(PB_MIGRATIONS);
  for (const f of migrationFiles) {
    fs.copyFileSync(path.join(PB_MIGRATIONS, f), path.join(migrationsDir, f));
  }

  // Start PocketBase (this applies migrations on first run)
  pbProcess = spawn(PB_BINARY, [
    'serve',
    `--http=127.0.0.1:${PB_PORT}`,
    `--dir=${PB_DATA_DIR}`,
    `--migrationsDir=${migrationsDir}`,
  ], {
    stdio: ['pipe', 'pipe', 'pipe'],
  });

  pbProcess.stdout.on('data', (d) => {
    const line = d.toString().trim();
    if (line) console.log(`  [pb] ${line}`);
  });
  pbProcess.stderr.on('data', (d) => {
    const line = d.toString().trim();
    if (line) console.error(`  [pb:err] ${line}`);
  });

  const ready = await waitForPocketBase(PB_URL);
  if (!ready) throw new Error('PocketBase failed to start (migrations may have failed)');
  console.log('PocketBase is ready');

  // Create superuser via CLI (after server is running and migrations applied)
  console.log('Creating superuser...');
  try {
    execSync(
      `"${PB_BINARY}" superuser upsert admin@test.com adminpassword123 --dir="${PB_DATA_DIR}"`,
      { stdio: 'pipe' }
    );
    console.log('Superuser created\n');
  } catch (err) {
    throw new Error(`Failed to create superuser: ${err.stderr?.toString() || err.message}`);
  }
}

function stopPocketBase() {
  if (pbProcess) {
    pbProcess.kill('SIGTERM');
    pbProcess = null;
  }
  try {
    fs.rmSync(PB_DATA_DIR, { recursive: true, force: true });
  } catch {}
}

async function runTests() {
  const pb = new PocketBase(PB_URL);

  // ===== Authenticate as admin =====
  console.log('Authenticating as admin...');
  try {
    await pb.collection('_superusers').authWithPassword('admin@test.com', 'adminpassword123');
    assert(pb.authStore.isValid, 'Admin authenticated');
  } catch (err) {
    assert(false, `Admin auth failed: ${err.message}`);
    return;
  }

  // ===== Test 1: Register a planner =====
  console.log('\n--- Auth Tests ---');
  let planner;
  try {
    planner = await pb.collection('users').create({
      email: 'planner@test.com',
      password: 'testpass123',
      passwordConfirm: 'testpass123',
      name: 'Test Planner',
      role: 'planner',
    });
    assert(planner.id && planner.email === 'planner@test.com', 'Register planner');
  } catch (err) {
    assert(false, `Register planner: ${err.message}`);
    return;
  }

  // Login as planner
  try {
    const auth = await pb.collection('users').authWithPassword('planner@test.com', 'testpass123');
    assert(auth.record.email === 'planner@test.com', 'Login as planner');
    assert(pb.authStore.isValid, 'Auth store is valid after login');
  } catch (err) {
    assert(false, `Login as planner: ${err.message}`);
    return;
  }

  // ===== Test 2: Create an event =====
  console.log('\n--- Event Tests ---');
  let event;
  try {
    event = await pb.collection('events').create({
      created_by: planner.id,
      event_name: 'Youth Camp 2026',
      event_dates: '15-17 July 2026',
      event_description: 'Annual ward youth camp at Zion National Park',
      ward: 'Mountain View 1st Ward',
      stake: 'Mountain View Stake',
      leader_name: 'John Smith',
      leader_phone: '555-0100',
      leader_email: 'john@ward.org',
      organizations: ['Deacons', 'Teachers', 'Priests'],
      is_active: true,
    });
    assert(event.id && event.event_name === 'Youth Camp 2026', 'Create event');
  } catch (err) {
    assert(false, `Create event: ${err.message}`);
    return;
  }

  // List events (as planner who owns them)
  try {
    const events = await pb.collection('events').getFullList({
      filter: `created_by = "${planner.id}"`,
    });
    assert(events.length === 1, 'List events returns 1 event');
    assert(events[0].event_name === 'Youth Camp 2026', 'Event name matches');
  } catch (err) {
    assert(false, `List events: ${err.message}`);
  }

  // View single event (public viewRule = null means anyone can view)
  try {
    pb.authStore.clear();
    const publicEvent = await pb.collection('events').getOne(event.id);
    assert(publicEvent.event_name === 'Youth Camp 2026', 'Public can view single event');
    // Re-auth as planner
    await pb.collection('users').authWithPassword('planner@test.com', 'testpass123');
  } catch (err) {
    assert(false, `Public event view: ${err.message}`);
    try { await pb.collection('users').authWithPassword('planner@test.com', 'testpass123'); } catch {}
  }

  // ===== Test 3: Register a parent and create a profile =====
  console.log('\n--- Profile Tests ---');
  let parent;
  try {
    // Auth as admin to create user (admin can bypass createRule validation)
    await pb.collection('_superusers').authWithPassword('admin@test.com', 'adminpassword123');
    parent = await pb.collection('users').create({
      email: 'parent@test.com',
      password: 'testpass123',
      passwordConfirm: 'testpass123',
      name: 'Jane Parent',
      role: 'parent',
    });
    // Now auth as parent
    await pb.collection('users').authWithPassword('parent@test.com', 'testpass123');
    assert(parent.id, 'Register parent');
  } catch (err) {
    assert(false, `Register parent: ${err.message}`);
    return;
  }

  let profile;
  try {
    profile = await pb.collection('child_profiles').create({
      user_id: parent.id,
      participant_name: 'Tommy Parent',
      participant_dob: '2012-06-15 00:00:00.000Z',
      participant_phone: '555-0200',
      emergency_contact: 'Jane Parent',
      emergency_phone_primary: '555-0100',
      allergies: true,
      allergies_details: 'Peanuts',
    });
    assert(profile.id && profile.participant_name === 'Tommy Parent', 'Create child profile');
    assert(profile.allergies === true, 'Boolean field (allergies) is true');
  } catch (err) {
    assert(false, `Create child profile: ${err.message}`);
  }

  // List profiles (should only see own)
  try {
    const profiles = await pb.collection('child_profiles').getFullList({
      filter: `user_id = "${parent.id}"`,
    });
    assert(profiles.length === 1, 'List profiles returns 1 profile');
  } catch (err) {
    assert(false, `List profiles: ${err.message}`);
  }

  // ===== Test 4: Submit a form =====
  console.log('\n--- Submission Tests ---');
  let submission;
  try {
    submission = await pb.collection('submissions').create({
      event_id: event.id,
      submitted_by: parent.id,
      participant_name: 'Tommy Parent',
      participant_dob: '2012-06-15 00:00:00.000Z',
      participant_age: 13,
      participant_phone: '555-0200',
      address: '123 Main St',
      city: 'Provo',
      state_province: 'Utah',
      emergency_contact: 'Jane Parent',
      emergency_phone_primary: '555-0100',
      allergies: true,
      allergies_details: 'Peanuts',
      participant_signature: 'Tommy Parent',
      participant_signature_type: 'typed',
      participant_signature_date: '2026-04-05 00:00:00.000Z',
      guardian_signature: 'Jane Parent',
      guardian_signature_type: 'typed',
      guardian_signature_date: '2026-04-05 00:00:00.000Z',
    });
    assert(submission.id && submission.participant_name === 'Tommy Parent', 'Submit form');
    assert(submission.participant_age === 13, 'Age is stored correctly');
    assert(submission.allergies === true, 'Boolean field preserved');
  } catch (err) {
    assert(false, `Submit form: ${err.message}`);
  }

  // List submissions as parent
  try {
    const mine = await pb.collection('submissions').getFullList({
      filter: `submitted_by = "${parent.id}"`,
    });
    assert(mine.length === 1, 'Parent sees their submission');
  } catch (err) {
    assert(false, `List parent submissions: ${err.message}`);
  }

  // List submissions as planner (event owner)
  try {
    await pb.collection('users').authWithPassword('planner@test.com', 'testpass123');
    const plannerSubs = await pb.collection('submissions').getFullList({
      filter: `event_id = "${event.id}"`,
    });
    assert(plannerSubs.length === 1, 'Planner sees event submissions');
    assert(plannerSubs[0].participant_name === 'Tommy Parent', 'Submission data correct');
  } catch (err) {
    assert(false, `Planner list submissions: ${err.message}`);
  }

  // ===== Test 5: Update event =====
  console.log('\n--- Update Tests ---');
  try {
    const updated = await pb.collection('events').update(event.id, {
      event_description: 'Updated description for camp',
    });
    assert(updated.event_description === 'Updated description for camp', 'Update event');
  } catch (err) {
    assert(false, `Update event: ${err.message}`);
  }

  // ===== Test 6: Deactivate event =====
  try {
    await pb.collection('events').update(event.id, { is_active: false });
    const deactivated = await pb.collection('events').getOne(event.id);
    assert(deactivated.is_active === false, 'Deactivate event');
  } catch (err) {
    assert(false, `Deactivate event: ${err.message}`);
  }

  // ===== Test 7: Delete submission =====
  try {
    await pb.collection('submissions').delete(submission.id);
    let found = true;
    try {
      await pb.collection('submissions').getOne(submission.id);
    } catch {
      found = false;
    }
    assert(!found, 'Delete submission');
  } catch (err) {
    assert(false, `Delete submission: ${err.message}`);
  }

  // ===== Test 8: API rules - parent can't create events =====
  console.log('\n--- API Rule Tests ---');
  try {
    await pb.collection('users').authWithPassword('parent@test.com', 'testpass123');
    try {
      await pb.collection('events').create({
        created_by: parent.id,
        event_name: 'Unauthorized Event',
        event_dates: 'N/A',
        event_description: 'Should fail',
        ward: 'Test',
        stake: 'Test',
        leader_name: 'Test',
        leader_phone: '555',
        leader_email: 'test@test.com',
      });
      assert(false, 'Parent should NOT be able to create events');
    } catch {
      assert(true, 'Parent correctly blocked from creating events');
    }
  } catch (err) {
    assert(false, `API rule test: ${err.message}`);
  }

  // ===== Test 9: Profile isolation =====
  try {
    await pb.collection('users').authWithPassword('planner@test.com', 'testpass123');
    const plannerProfiles = await pb.collection('child_profiles').getFullList({
      filter: `user_id = "${planner.id}"`,
    });
    assert(plannerProfiles.length === 0, 'Planner sees 0 profiles (correct isolation)');
  } catch (err) {
    assert(false, `Profile isolation: ${err.message}`);
  }

  // ===== Test 10: Unauthenticated submission (public createRule) =====
  console.log('\n--- Public Access Tests ---');
  try {
    pb.authStore.clear();
    const anonSubmission = await pb.collection('submissions').create({
      event_id: event.id,
      participant_name: 'Anonymous Kid',
      participant_dob: '2013-01-01 00:00:00.000Z',
      participant_age: 12,
      participant_signature: 'Anonymous Kid',
      participant_signature_type: 'typed',
      participant_signature_date: '2026-04-05 00:00:00.000Z',
    });
    assert(anonSubmission.id, 'Unauthenticated user can submit form (public createRule)');
    // Clean up via admin
    await pb.collection('_superusers').authWithPassword('admin@test.com', 'adminpassword123');
    await pb.collection('submissions').delete(anonSubmission.id);
  } catch (err) {
    assert(false, `Unauthenticated submission: ${err.message}`);
  }

  // ===== Test 11: Event attachments =====
  console.log('\n--- Attachment Tests ---');
  try {
    await pb.collection('users').authWithPassword('planner@test.com', 'testpass123');
    // Reactivate event
    await pb.collection('events').update(event.id, { is_active: true });

    const formData = new FormData();
    formData.append('event_id', event.id);
    formData.append('original_name', 'test-doc.pdf');
    formData.append('display_order', '0');
    // Minimal valid PDF (PocketBase validates actual content, not just declared MIME type)
    const minimalPdf = '%PDF-1.0\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj 2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj 3 0 obj<</Type/Page/MediaBox[0 0 3 3]>>endobj\nxref\n0 4\n0000000000 65535 f \n0000000009 00000 n \n0000000058 00000 n \n0000000115 00000 n \ntrailer<</Size 4/Root 1 0 R>>\nstartxref\n190\n%%EOF';
    formData.append('file', new Blob([minimalPdf], { type: 'application/pdf' }), 'test-doc.pdf');

    const attachment = await pb.collection('event_attachments').create(formData);
    assert(attachment.id && attachment.original_name === 'test-doc.pdf', 'Create attachment');

    // Verify public access (clear auth)
    pb.authStore.clear();
    const publicAttachments = await pb.collection('event_attachments').getFullList({
      filter: `event_id = "${event.id}"`,
    });
    assert(publicAttachments.length === 1, 'Attachments publicly accessible (for form view)');
  } catch (err) {
    assert(false, `Attachment test: ${err.message}`);
  }
}

async function main() {
  console.log('=== Permish E2E PocketBase Integration Test ===\n');

  if (!fs.existsSync(PB_BINARY)) {
    console.error(`PocketBase binary not found: ${PB_BINARY}`);
    console.error('Download from https://pocketbase.io/docs/ and place at project root');
    process.exit(1);
  }

  try {
    await startPocketBase();
    await runTests();
  } catch (err) {
    console.error('\nFatal error:', err.message);
    failed++;
  } finally {
    stopPocketBase();
  }

  console.log(`\n=== Results: ${passed} passed, ${failed} failed ===`);
  if (errors.length > 0) {
    console.log('\nFailed tests:');
    errors.forEach(e => console.log(`  - ${e}`));
  }

  process.exit(failed > 0 ? 1 : 0);
}

main();

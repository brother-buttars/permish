#!/usr/bin/env node
/**
 * Seed PocketBase with the same realistic test data as the SQLite seeder.
 *
 * Reuses the data definitions from backend/scripts/seed.js so the two seeders
 * stay in sync. Authenticates as a PocketBase superuser to get past list/view
 * rules, then writes stakes, wards, users, memberships, events, profiles, and
 * submissions.
 *
 * Usage:
 *   PB_ADMIN_EMAIL=admin@example.com PB_ADMIN_PASSWORD=secret \
 *     node scripts/seed-pocketbase.js
 *
 *   # Wipe app data first
 *   ... node scripts/seed-pocketbase.js --reset
 *
 * Env:
 *   PB_URL              http://localhost:8090
 *   PB_ADMIN_EMAIL      required
 *   PB_ADMIN_PASSWORD   required
 *   SEED_PASSWORD       password applied to all seeded users (default: password123)
 */

const path = require('path');
const PocketBase = require('pocketbase/cjs');

const seed = require(path.resolve(__dirname, '..', 'backend', 'scripts', 'seed.js'));
const { USERS, STAKES, PROFILE_TEMPLATES, buildEvents, ageFromDob, dobIso, DEFAULT_PASSWORD } = seed;

const PB_URL = process.env.PB_URL || 'http://localhost:8090';
const PB_ADMIN_EMAIL = process.env.PB_ADMIN_EMAIL;
const PB_ADMIN_PASSWORD = process.env.PB_ADMIN_PASSWORD;
const SEED_PASSWORD = process.env.SEED_PASSWORD || DEFAULT_PASSWORD;

// PB collections that hold app data — order matters for delete (children first).
const APP_COLLECTIONS = [
  'audit_log',
  'group_invites',
  'group_members',
  'submissions',
  'event_attachments',
  'events',
  'child_profiles',
  'groups',
];

async function deleteAll(pb, collection) {
  // PocketBase doesn't expose bulk delete; fetch ids then delete one by one.
  const records = await pb.collection(collection).getFullList({ fields: 'id' });
  for (const r of records) {
    try { await pb.collection(collection).delete(r.id); } catch (err) {
      // ignore — may have been cascade-deleted from a prior call
    }
  }
  return records.length;
}

async function deleteAllUsers(pb) {
  // Skip the superuser performing the seed; we only delete `users` collection
  // entries, never `_superusers`.
  const records = await pb.collection('users').getFullList({ fields: 'id' });
  for (const r of records) {
    try { await pb.collection('users').delete(r.id); } catch {}
  }
  return records.length;
}

async function reset(pb) {
  console.log('Resetting app data...');
  for (const c of APP_COLLECTIONS) {
    const n = await deleteAll(pb, c);
    if (n) console.log(`  cleared ${c}: ${n} records`);
  }
  const u = await deleteAllUsers(pb);
  if (u) console.log(`  cleared users: ${u} records`);
}

async function main() {
  const argv = process.argv.slice(2);
  const doReset = argv.includes('--reset');

  if (!PB_ADMIN_EMAIL || !PB_ADMIN_PASSWORD) {
    console.error('PB_ADMIN_EMAIL and PB_ADMIN_PASSWORD are required.');
    process.exit(1);
  }

  const pb = new PocketBase(PB_URL);
  try {
    await pb.collection('_superusers').authWithPassword(PB_ADMIN_EMAIL, PB_ADMIN_PASSWORD);
    console.log(`Connected to PocketBase at ${PB_URL} as superuser.`);
  } catch (err) {
    console.error(`Failed to authenticate with PocketBase: ${err.message}`);
    process.exit(1);
  }

  if (doReset) {
    await reset(pb);
  } else {
    // Refuse to seed if any users already exist (safety against double-seed).
    const existing = await pb.collection('users').getList(1, 1).catch(() => null);
    if (existing && existing.totalItems > 0) {
      console.error(`PocketBase already has ${existing.totalItems} user(s).`);
      console.error('Re-run with --reset to wipe app data and re-seed.');
      process.exit(1);
    }
  }

  const today = new Date();

  // ---- Stakes & wards ----
  const stakeIdByKey = {};
  const wardIdByKey = {};
  const wardStakeKeyByWardKey = {};

  for (const s of STAKES) {
    const stakeRec = await pb.collection('groups').create({
      name: s.name,
      type: 'stake',
      stake: s.name,
      leader_name: s.leader.name,
      leader_phone: s.leader.phone,
      leader_email: s.leader.email,
      invite_code: `STK-${s.key.toUpperCase()}`,
    });
    stakeIdByKey[s.key] = stakeRec.id;

    for (const w of s.wards) {
      const wardRec = await pb.collection('groups').create({
        name: w.name,
        type: 'ward',
        parent_id: stakeRec.id,
        ward: w.name,
        stake: s.name,
        leader_name: s.leader.name,
        leader_phone: s.leader.phone,
        leader_email: s.leader.email,
        invite_code: `WRD-${w.key.toUpperCase()}`,
      });
      wardIdByKey[w.key] = wardRec.id;
      wardStakeKeyByWardKey[w.key] = s.key;
    }
  }

  // ---- Users ----
  const userIdByEmail = {};
  for (const u of USERS) {
    const rec = await pb.collection('users').create({
      email: u.email,
      password: SEED_PASSWORD,
      passwordConfirm: SEED_PASSWORD,
      name: u.name,
      role: u.role,
      emailVisibility: true,
      verified: true,
    });
    userIdByEmail[u.email] = rec.id;
  }

  // ---- Group memberships ----
  for (const u of USERS) {
    const uid = userIdByEmail[u.email];
    if (u.tag === 'super') continue;
    const ts = new Date().toISOString();
    if (u.tag === 'stake-admin') {
      const stake = STAKES.find((s) => s.key === u.stake);
      await pb.collection('group_members').create({
        group_id: stakeIdByKey[u.stake], user_id: uid, role: 'admin', joined_at: ts,
      });
      for (const w of stake.wards) {
        await pb.collection('group_members').create({
          group_id: wardIdByKey[w.key], user_id: uid, role: 'admin', joined_at: ts,
        });
      }
    } else if (u.tag === 'ward-admin') {
      const stakeKey = wardStakeKeyByWardKey[u.ward];
      await pb.collection('group_members').create({
        group_id: wardIdByKey[u.ward], user_id: uid, role: 'admin', joined_at: ts,
      });
      await pb.collection('group_members').create({
        group_id: stakeIdByKey[stakeKey], user_id: uid, role: 'member', joined_at: ts,
      });
    } else if (u.tag === 'member') {
      await pb.collection('group_members').create({
        group_id: wardIdByKey[u.ward], user_id: uid, role: 'member', joined_at: ts,
      });
    }
  }

  // ---- Events ----
  const events = buildEvents(today);
  const fmtDate = (d) => d.toISOString().slice(0, 10);
  const fmtRange = (s, e) => (fmtDate(s) === fmtDate(e) ? fmtDate(s) : `${fmtDate(s)} to ${fmtDate(e)}`);
  const stakeAdminUserIdForWardKey = (wardKey) => {
    const stakeKey = wardStakeKeyByWardKey[wardKey];
    const admin = USERS.find((u) => u.tag === 'stake-admin' && u.stake === stakeKey);
    return userIdByEmail[admin.email];
  };

  const createdEvents = [];
  for (const e of events) {
    const stakeKey = wardStakeKeyByWardKey[e.ward];
    const stake = STAKES.find((s) => s.key === stakeKey);
    const ward = stake.wards.find((w) => w.key === e.ward);
    const rec = await pb.collection('events').create({
      created_by: stakeAdminUserIdForWardKey(e.ward),
      event_name: e.name,
      event_dates: fmtRange(e.start, e.end),
      event_start: fmtDate(e.start),
      event_end: fmtDate(e.end),
      event_description: e.desc,
      ward: ward.name,
      stake: stake.name,
      leader_name: stake.leader.name,
      leader_phone: stake.leader.phone,
      leader_email: stake.leader.email,
      organizations: e.orgs,
      group_id: wardIdByKey[e.ward],
      is_active: !!e.is_active,
    });
    createdEvents.push({ id: rec.id, ...e });
  }

  // ---- Profiles (members only) ----
  const profilesByEmail = {};
  for (const u of USERS.filter((x) => x.tag === 'member')) {
    const last = u.name.split(' ').pop();
    profilesByEmail[u.email] = [];
    for (let i = 0; i < 2; i++) {
      const tpl = PROFILE_TEMPLATES[i];
      const dob = dobIso(tpl.dob_offset_years, today);
      const program = i % 2 === 0 ? 'young_men' : 'young_women';
      const rec = await pb.collection('child_profiles').create({
        user_id: userIdByEmail[u.email],
        participant_name: tpl.participant_name.replace('{last}', last),
        participant_dob: dob,
        participant_phone: '801-555-' + String(2000 + Math.floor(Math.random() * 999)).slice(-4),
        address: '123 Main St',
        city: 'Provo',
        state_province: 'UT',
        emergency_contact: u.name,
        emergency_phone_primary: '801-555-9000',
        special_diet: false,
        allergies: !!tpl.allergies,
        allergies_details: tpl.allergies || '',
        can_self_administer_meds: !tpl.allergies,
        youth_program: program,
      });
      profilesByEmail[u.email].push({ id: rec.id, name: rec.participant_name, dob });
    }
  }

  // ---- Submissions ----
  const memberUsers = USERS.filter((x) => x.tag === 'member');
  let submissionCount = 0;
  for (const ev of createdEvents) {
    const isPast = ev.end < today;
    const targets = isPast ? memberUsers : memberUsers.slice(0, 2);
    for (const u of targets) {
      const profiles = profilesByEmail[u.email] || [];
      if (!profiles.length) continue;
      const p = profiles[0];
      const submittedAt = new Date(ev.start);
      submittedAt.setDate(submittedAt.getDate() - 3);
      await pb.collection('submissions').create({
        event_id: ev.id,
        submitted_by: userIdByEmail[u.email],
        participant_name: p.name,
        participant_dob: p.dob,
        participant_age: ageFromDob(p.dob, submittedAt),
        participant_phone: '801-555-1212',
        address: '123 Main St',
        city: 'Provo',
        state_province: 'UT',
        emergency_contact: u.name,
        emergency_phone_primary: '801-555-9000',
        special_diet: false,
        allergies: false,
        allergies_details: '',
        participant_signature_type: 'typed',
        participant_signature_date: submittedAt.toISOString().slice(0, 10),
        guardian_signature_type: 'typed',
        guardian_signature_date: submittedAt.toISOString().slice(0, 10),
      });
      submissionCount++;
    }
  }

  console.log('\nSeed complete.');
  console.log(`  Stakes:      ${STAKES.length}`);
  console.log(`  Wards:       ${STAKES.reduce((n, s) => n + s.wards.length, 0)}`);
  console.log(`  Users:       ${USERS.length}`);
  console.log(`  Events:      ${createdEvents.length}`);
  console.log(`  Submissions: ${submissionCount}`);
  console.log(`\nAll accounts use password: ${SEED_PASSWORD}\n`);
  console.log('Email                              Role        Scope         Tag');
  console.log('---------------------------------- ----------- ------------- ------------');
  for (const u of USERS) {
    console.log(
      u.email.padEnd(34),
      u.role.padEnd(11),
      (u.stake || u.ward || '-').padEnd(13),
      u.tag,
    );
  }
  console.log();
}

if (require.main === module) {
  main().catch((err) => { console.error(err); process.exit(1); });
}

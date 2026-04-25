const request = require('supertest');
const app = require('../src/index');
const { createTestDb } = require('./setup');

let db;
let user1Cookie, user2Cookie;

beforeEach(async () => {
  db = createTestDb();
  app.locals.db = db;

  await request(app).post('/api/auth/register')
    .send({ email: 'user1@test.com', password: 'Password123!', name: 'User One', role: 'user' });
  await request(app).post('/api/auth/register')
    .send({ email: 'user2@test.com', password: 'Password123!', name: 'User Two', role: 'user' });

  // Promote user1 to super and re-login so the JWT carries the new role
  db.prepare("UPDATE users SET role = 'super' WHERE email = 'user1@test.com'").run();
  const login1 = await request(app).post('/api/auth/login')
    .send({ email: 'user1@test.com', password: 'Password123!' });
  user1Cookie = login1.headers['set-cookie'];

  const login2 = await request(app).post('/api/auth/login')
    .send({ email: 'user2@test.com', password: 'Password123!' });
  user2Cookie = login2.headers['set-cookie'];
});
afterEach(() => db.close());

describe('PUT /api/admin/users/:id/role', () => {
  test('super can promote user → super', async () => {
    const u2 = db.prepare("SELECT id FROM users WHERE email = 'user2@test.com'").get();
    const res = await request(app).put(`/api/admin/users/${u2.id}/role`)
      .set('Cookie', user1Cookie).send({ role: 'super' });
    expect(res.status).toBe(200);
    expect(res.body.user.role).toBe('super');
  });

  test('super can demote another super → user when more than one super exists', async () => {
    const u2 = db.prepare("SELECT id FROM users WHERE email = 'user2@test.com'").get();
    db.prepare("UPDATE users SET role = 'super' WHERE id = ?").run(u2.id);

    const res = await request(app).put(`/api/admin/users/${u2.id}/role`)
      .set('Cookie', user1Cookie).send({ role: 'user' });
    expect(res.status).toBe(200);
    expect(res.body.user.role).toBe('user');
  });

  test('last-super guard blocks demoting the only super', async () => {
    const u1 = db.prepare("SELECT id FROM users WHERE email = 'user1@test.com'").get();
    const res = await request(app).put(`/api/admin/users/${u1.id}/role`)
      .set('Cookie', user1Cookie).send({ role: 'user' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/last super/i);
  });

  test('non-super gets 403', async () => {
    const u1 = db.prepare("SELECT id FROM users WHERE email = 'user1@test.com'").get();
    const res = await request(app).put(`/api/admin/users/${u1.id}/role`)
      .set('Cookie', user2Cookie).send({ role: 'user' });
    expect(res.status).toBe(403);
  });

  test('rejects invalid role values', async () => {
    const u2 = db.prepare("SELECT id FROM users WHERE email = 'user2@test.com'").get();
    const res = await request(app).put(`/api/admin/users/${u2.id}/role`)
      .set('Cookie', user1Cookie).send({ role: 'planner' }); // legacy role no longer valid
    expect(res.status).toBe(400);
  });

  test('writes user.role_changed audit entry with from/to metadata', async () => {
    const u2 = db.prepare("SELECT id FROM users WHERE email = 'user2@test.com'").get();
    await request(app).put(`/api/admin/users/${u2.id}/role`)
      .set('Cookie', user1Cookie).send({ role: 'super' });

    const entry = db.prepare(
      `SELECT action, target_id, meta FROM audit_log WHERE action = 'user.role_changed' AND target_id = ?`
    ).get(u2.id);
    expect(entry).toBeDefined();
    const meta = JSON.parse(entry.meta);
    expect(meta.from).toBe('user');
    expect(meta.to).toBe('super');
  });
});

describe('DELETE /api/admin/users/:id', () => {
  test('cannot delete self', async () => {
    const u1 = db.prepare("SELECT id FROM users WHERE email = 'user1@test.com'").get();
    const res = await request(app).delete(`/api/admin/users/${u1.id}`).set('Cookie', user1Cookie);
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/own account/i);
  });

  test('a super can delete a different super (when more than one exists)', async () => {
    const u2 = db.prepare("SELECT id FROM users WHERE email = 'user2@test.com'").get();
    db.prepare("UPDATE users SET role = 'super' WHERE id = ?").run(u2.id);

    const res = await request(app).delete(`/api/admin/users/${u2.id}`).set('Cookie', user1Cookie);
    expect(res.status).toBe(200);
    const remaining = db.prepare("SELECT id FROM users WHERE id = ?").get(u2.id);
    expect(remaining).toBeUndefined();
  });

  // Note: the "delete the last super" guard is defensive — it's not reachable
  // through the current API surface (self-delete is blocked first, and only
  // a different super can call the delete route, which means a second super
  // must already exist). We don't add a test for the unreachable branch.

  test('writes user.deleted audit entry', async () => {
    await request(app).post('/api/auth/register')
      .send({ email: 'doomed@test.com', password: 'Password123!', name: 'Doomed', role: 'user' });
    const target = db.prepare("SELECT id FROM users WHERE email = 'doomed@test.com'").get();

    const res = await request(app).delete(`/api/admin/users/${target.id}`).set('Cookie', user1Cookie);
    expect(res.status).toBe(200);

    const entry = db.prepare(
      `SELECT action, target_id FROM audit_log WHERE action = 'user.deleted' AND target_id = ?`
    ).get(target.id);
    expect(entry).toBeDefined();
  });
});

describe('POST /api/admin/users', () => {
  test('rejects invalid role', async () => {
    const res = await request(app).post('/api/admin/users').set('Cookie', user1Cookie)
      .send({ email: 'new@test.com', password: 'Password123!', name: 'New', role: 'planner' });
    expect(res.status).toBe(400);
  });

  test('accepts valid role and writes user.created audit', async () => {
    const res = await request(app).post('/api/admin/users').set('Cookie', user1Cookie)
      .send({ email: 'fresh@test.com', password: 'Password123!', name: 'Fresh', role: 'user' });
    expect(res.status).toBe(201);

    const entry = db.prepare(
      `SELECT action, target_id, meta FROM audit_log WHERE action = 'user.created' AND target_id = ?`
    ).get(res.body.user.id);
    expect(entry).toBeDefined();
    const meta = JSON.parse(entry.meta);
    expect(meta.email).toBe('fresh@test.com');
    expect(meta.role).toBe('user');
  });
});

describe('Admin filter endpoints', () => {
  // Helper: build a stake with two child wards, members in each, and an event in one ward.
  async function setupHierarchy() {
    const stakeRes = await request(app).post('/api/groups').set('Cookie', user1Cookie)
      .send({ name: 'Test Stake', type: 'stake', stake: 'Test Stake' });
    const stakeId = stakeRes.body.group.id;

    const ward1Res = await request(app).post('/api/groups').set('Cookie', user1Cookie)
      .send({ name: 'Alpha Ward', type: 'ward', parent_id: stakeId, ward: 'Alpha Ward' });
    const ward1Id = ward1Res.body.group.id;

    const ward2Res = await request(app).post('/api/groups').set('Cookie', user1Cookie)
      .send({ name: 'Beta Ward', type: 'ward', parent_id: stakeId, ward: 'Beta Ward' });
    const ward2Id = ward2Res.body.group.id;

    // Sibling stake (should be excluded by stake filter)
    const otherStakeRes = await request(app).post('/api/groups').set('Cookie', user1Cookie)
      .send({ name: 'Other Stake', type: 'stake', stake: 'Other Stake' });
    const otherStakeId = otherStakeRes.body.group.id;

    // Add user2 to ward1 directly (creator user1 is auto-admin)
    db.prepare(
      `INSERT INTO group_members (id, group_id, user_id, role) VALUES (?, ?, (SELECT id FROM users WHERE email = ?), 'member')`
    ).run('gm-w1-u2', ward1Id, 'user2@test.com');

    // Create a third user only in the other stake
    await request(app).post('/api/auth/register')
      .send({ email: 'outsider@test.com', password: 'Password123!', name: 'Outsider', role: 'user' });
    db.prepare(
      `INSERT INTO group_members (id, group_id, user_id, role) VALUES (?, ?, (SELECT id FROM users WHERE email = ?), 'member')`
    ).run('gm-os-out', otherStakeId, 'outsider@test.com');

    // Create an event in ward1
    const eventRes = await request(app).post('/api/events').set('Cookie', user1Cookie).send({
      event_name: 'Alpha Camp', event_dates: 'June 1-3, 2026',
      event_description: 'Test', ward: 'Alpha Ward', stake: 'Test Stake',
      leader_name: 'L', leader_phone: '555', leader_email: 'l@test.com',
      group_id: ward1Id,
    });
    const eventId = eventRes.body.event.id;
    // group_id may not be persisted by /api/events POST — set directly
    db.prepare('UPDATE events SET group_id = ? WHERE id = ?').run(ward1Id, eventId);

    return { stakeId, ward1Id, ward2Id, otherStakeId, eventId };
  }

  test('GET /admin/groups-tree returns hierarchical flat list with depth', async () => {
    await setupHierarchy();
    const res = await request(app).get('/api/admin/groups-tree').set('Cookie', user1Cookie);
    expect(res.status).toBe(200);
    expect(res.body.groups.length).toBeGreaterThanOrEqual(4);
    const stake = res.body.groups.find(g => g.name === 'Test Stake');
    const ward = res.body.groups.find(g => g.name === 'Alpha Ward');
    expect(stake.depth).toBe(0);
    expect(ward.depth).toBe(1);
    expect(ward.parent_id).toBe(stake.id);
  });

  test('GET /admin/users with stake filter includes members of child wards', async () => {
    const { stakeId } = await setupHierarchy();
    const res = await request(app).get(`/api/admin/users?groupId=${stakeId}`).set('Cookie', user1Cookie);
    expect(res.status).toBe(200);
    const emails = res.body.users.map(u => u.email).sort();
    // user1 is admin of stake (and auto-added), user2 in ward1 → stake filter sees both
    expect(emails).toContain('user1@test.com');
    expect(emails).toContain('user2@test.com');
    expect(emails).not.toContain('outsider@test.com');
  });

  test('GET /admin/users with ward filter excludes sibling-ward members', async () => {
    const { ward1Id } = await setupHierarchy();
    const res = await request(app).get(`/api/admin/users?groupId=${ward1Id}`).set('Cookie', user1Cookie);
    expect(res.status).toBe(200);
    const emails = res.body.users.map(u => u.email);
    expect(emails).toContain('user2@test.com');
    expect(emails).not.toContain('outsider@test.com');
  });

  test('GET /admin/stats with stake filter narrows counts to stake+wards', async () => {
    const { stakeId } = await setupHierarchy();
    const res = await request(app).get(`/api/admin/stats?groupId=${stakeId}`).set('Cookie', user1Cookie);
    expect(res.status).toBe(200);
    expect(res.body.stats.eventCount).toBe(1);
    // outsider not counted
    expect(res.body.stats.userCount).toBeLessThanOrEqual(2);
  });

  test('GET /admin/activities with stake filter returns only activities in scope', async () => {
    const { stakeId, otherStakeId } = await setupHierarchy();
    const inScope = await request(app).get(`/api/admin/activities?groupId=${stakeId}`).set('Cookie', user1Cookie);
    expect(inScope.body.activities).toHaveLength(1);
    expect(inScope.body.activities[0].event_name).toBe('Alpha Camp');

    const outOfScope = await request(app).get(`/api/admin/activities?groupId=${otherStakeId}`).set('Cookie', user1Cookie);
    expect(outOfScope.body.activities).toHaveLength(0);
  });

  test('GET /admin/submissions narrows to activity', async () => {
    const { eventId, ward1Id } = await setupHierarchy();
    // Insert a submission directly
    db.prepare(
      `INSERT INTO submissions (id, event_id, participant_name, participant_dob, participant_age, participant_signature_type, participant_signature_date)
       VALUES (?, ?, 'Sam', '2010-01-01', 16, 'typed', '2026-01-01')`
    ).run('sub-1', eventId);

    const byActivity = await request(app).get(`/api/admin/submissions?activityId=${eventId}`).set('Cookie', user1Cookie);
    expect(byActivity.body.submissions).toHaveLength(1);
    expect(byActivity.body.submissions[0].participant_name).toBe('Sam');

    const byWard = await request(app).get(`/api/admin/submissions?groupId=${ward1Id}`).set('Cookie', user1Cookie);
    expect(byWard.body.submissions).toHaveLength(1);
  });

  test('non-super gets 403 on filter endpoints', async () => {
    const tree = await request(app).get('/api/admin/groups-tree').set('Cookie', user2Cookie);
    expect(tree.status).toBe(403);
    const acts = await request(app).get('/api/admin/activities').set('Cookie', user2Cookie);
    expect(acts.status).toBe(403);
    const subs = await request(app).get('/api/admin/submissions').set('Cookie', user2Cookie);
    expect(subs.status).toBe(403);
    const profs = await request(app).get('/api/admin/profiles').set('Cookie', user2Cookie);
    expect(profs.status).toBe(403);
  });

  test('unknown groupId returns empty results', async () => {
    const res = await request(app).get('/api/admin/users?groupId=does-not-exist').set('Cookie', user1Cookie);
    expect(res.status).toBe(200);
    expect(res.body.users).toEqual([]);
  });
});

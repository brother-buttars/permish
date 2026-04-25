const request = require('supertest');
const app = require('../src/index');
const { createTestDb } = require('./setup');

let db;
let userCookie, user2Cookie;

beforeEach(async () => {
  db = createTestDb();
  app.locals.db = db;

  const res1 = await request(app).post('/api/auth/register')
    .send({ email: 'user1@test.com', password: 'Password123!', name: 'User One', role: 'user' });
  userCookie = res1.headers['set-cookie'];

  const res2 = await request(app).post('/api/auth/register')
    .send({ email: 'user2@test.com', password: 'Password123!', name: 'User Two', role: 'user' });
  user2Cookie = res2.headers['set-cookie'];
});
afterEach(() => db.close());

describe('POST /api/groups', () => {
  test('rejects non-super creating top-level group', async () => {
    const res = await request(app).post('/api/groups').set('Cookie', userCookie)
      .send({ name: 'Cedar Stake', type: 'stake' });
    expect(res.status).toBe(403);
  });

  test('super can create top-level group', async () => {
    // Make user1 a super admin
    db.prepare("UPDATE users SET role = 'super' WHERE email = 'user1@test.com'").run();
    // Re-login to get updated token
    const loginRes = await request(app).post('/api/auth/login')
      .send({ email: 'user1@test.com', password: 'Password123!' });
    const superCookie = loginRes.headers['set-cookie'];

    const res = await request(app).post('/api/groups').set('Cookie', superCookie)
      .send({ name: 'Cedar Stake', type: 'stake', stake: 'Cedar Stake' });
    expect(res.status).toBe(201);
    expect(res.body.group.name).toBe('Cedar Stake');
    expect(res.body.group.type).toBe('stake');
    expect(res.body.group.invite_code).toBeDefined();
    expect(res.body.group.invite_code).toHaveLength(8);
  });

  test('group admin can create subgroup', async () => {
    // Make user1 super, create stake, then create ward as admin
    db.prepare("UPDATE users SET role = 'super' WHERE email = 'user1@test.com'").run();
    const loginRes = await request(app).post('/api/auth/login')
      .send({ email: 'user1@test.com', password: 'Password123!' });
    const superCookie = loginRes.headers['set-cookie'];

    const stakeRes = await request(app).post('/api/groups').set('Cookie', superCookie)
      .send({ name: 'Cedar Stake', type: 'stake', stake: 'Cedar Stake' });
    const stakeId = stakeRes.body.group.id;

    const wardRes = await request(app).post('/api/groups').set('Cookie', superCookie)
      .send({ name: 'Maple Ward', type: 'ward', parent_id: stakeId, ward: 'Maple Ward' });
    expect(wardRes.status).toBe(201);
    expect(wardRes.body.group.parent_id).toBe(stakeId);
    expect(wardRes.body.group.stake).toBe('Cedar Stake');
  });

  test('rejects invalid group type', async () => {
    db.prepare("UPDATE users SET role = 'super' WHERE email = 'user1@test.com'").run();
    const loginRes = await request(app).post('/api/auth/login')
      .send({ email: 'user1@test.com', password: 'Password123!' });
    const superCookie = loginRes.headers['set-cookie'];

    const res = await request(app).post('/api/groups').set('Cookie', superCookie)
      .send({ name: 'Bad', type: 'invalid' });
    expect(res.status).toBe(400);
  });

  test('rejects unauthenticated', async () => {
    const res = await request(app).post('/api/groups')
      .send({ name: 'Cedar Stake', type: 'stake' });
    expect(res.status).toBe(401);
  });
});

describe('POST /api/groups/join', () => {
  let inviteCode, groupId;

  beforeEach(async () => {
    db.prepare("UPDATE users SET role = 'super' WHERE email = 'user1@test.com'").run();
    const loginRes = await request(app).post('/api/auth/login')
      .send({ email: 'user1@test.com', password: 'Password123!' });
    const superCookie = loginRes.headers['set-cookie'];

    const groupRes = await request(app).post('/api/groups').set('Cookie', superCookie)
      .send({ name: 'Cedar Stake', type: 'stake', stake: 'Cedar Stake' });
    inviteCode = groupRes.body.group.invite_code;
    groupId = groupRes.body.group.id;
  });

  test('user joins group with invite code', async () => {
    const res = await request(app).post('/api/groups/join').set('Cookie', user2Cookie)
      .send({ invite_code: inviteCode });
    expect(res.status).toBe(200);
    expect(res.body.group.name).toBe('Cedar Stake');
  });

  test('case-insensitive invite code', async () => {
    const res = await request(app).post('/api/groups/join').set('Cookie', user2Cookie)
      .send({ invite_code: inviteCode.toLowerCase() });
    expect(res.status).toBe(200);
  });

  test('rejects invalid invite code', async () => {
    const res = await request(app).post('/api/groups/join').set('Cookie', user2Cookie)
      .send({ invite_code: 'ZZZZZZZZ' });
    expect(res.status).toBe(404);
  });

  test('rejects duplicate join', async () => {
    await request(app).post('/api/groups/join').set('Cookie', user2Cookie)
      .send({ invite_code: inviteCode });
    const res = await request(app).post('/api/groups/join').set('Cookie', user2Cookie)
      .send({ invite_code: inviteCode });
    expect(res.status).toBe(409);
  });
});

describe('GET /api/groups', () => {
  test('lists groups user belongs to', async () => {
    db.prepare("UPDATE users SET role = 'super' WHERE email = 'user1@test.com'").run();
    const loginRes = await request(app).post('/api/auth/login')
      .send({ email: 'user1@test.com', password: 'Password123!' });
    const superCookie = loginRes.headers['set-cookie'];

    await request(app).post('/api/groups').set('Cookie', superCookie)
      .send({ name: 'Cedar Stake', type: 'stake' });

    const res = await request(app).get('/api/groups').set('Cookie', superCookie);
    expect(res.status).toBe(200);
    expect(res.body.groups).toHaveLength(1);
    expect(res.body.groups[0].member_role).toBe('admin');
    expect(res.body.groups[0].member_count).toBe(1);
  });

  test('user with no groups gets empty list', async () => {
    const res = await request(app).get('/api/groups').set('Cookie', user2Cookie);
    expect(res.status).toBe(200);
    expect(res.body.groups).toHaveLength(0);
  });
});

describe('GET /api/groups/:id', () => {
  let groupId;

  beforeEach(async () => {
    db.prepare("UPDATE users SET role = 'super' WHERE email = 'user1@test.com'").run();
    const loginRes = await request(app).post('/api/auth/login')
      .send({ email: 'user1@test.com', password: 'Password123!' });
    const superCookie = loginRes.headers['set-cookie'];

    const groupRes = await request(app).post('/api/groups').set('Cookie', superCookie)
      .send({ name: 'Cedar Stake', type: 'stake' });
    groupId = groupRes.body.group.id;
  });

  test('member can view group details', async () => {
    db.prepare("UPDATE users SET role = 'super' WHERE email = 'user1@test.com'").run();
    const loginRes = await request(app).post('/api/auth/login')
      .send({ email: 'user1@test.com', password: 'Password123!' });
    const superCookie = loginRes.headers['set-cookie'];

    const res = await request(app).get(`/api/groups/${groupId}`).set('Cookie', superCookie);
    expect(res.status).toBe(200);
    expect(res.body.group.members).toHaveLength(1);
    expect(res.body.group.members[0].role).toBe('admin');
  });

  test('non-member cannot view group', async () => {
    const res = await request(app).get(`/api/groups/${groupId}`).set('Cookie', user2Cookie);
    expect(res.status).toBe(403);
  });
});

describe('PUT /api/groups/:id', () => {
  let groupId;

  beforeEach(async () => {
    db.prepare("UPDATE users SET role = 'super' WHERE email = 'user1@test.com'").run();
    const loginRes = await request(app).post('/api/auth/login')
      .send({ email: 'user1@test.com', password: 'Password123!' });
    const superCookie = loginRes.headers['set-cookie'];

    const groupRes = await request(app).post('/api/groups').set('Cookie', superCookie)
      .send({ name: 'Cedar Stake', type: 'stake', stake: 'Cedar Stake' });
    groupId = groupRes.body.group.id;
  });

  test('admin can update group', async () => {
    db.prepare("UPDATE users SET role = 'super' WHERE email = 'user1@test.com'").run();
    const loginRes = await request(app).post('/api/auth/login')
      .send({ email: 'user1@test.com', password: 'Password123!' });
    const superCookie = loginRes.headers['set-cookie'];

    const res = await request(app).put(`/api/groups/${groupId}`).set('Cookie', superCookie)
      .send({ name: 'Updated Stake', leader_name: 'John Smith' });
    expect(res.status).toBe(200);
    expect(res.body.group.name).toBe('Updated Stake');
    expect(res.body.group.leader_name).toBe('John Smith');
  });

  test('non-admin cannot update group', async () => {
    // Add user2 as member
    const group = db.prepare('SELECT invite_code FROM groups WHERE id = ?').get(groupId);
    await request(app).post('/api/groups/join').set('Cookie', user2Cookie)
      .send({ invite_code: group.invite_code });

    const res = await request(app).put(`/api/groups/${groupId}`).set('Cookie', user2Cookie)
      .send({ name: 'Hacked' });
    expect(res.status).toBe(403);
  });
});

describe('POST /api/groups/:id/invite', () => {
  let groupId;

  beforeEach(async () => {
    db.prepare("UPDATE users SET role = 'super' WHERE email = 'user1@test.com'").run();
    const loginRes = await request(app).post('/api/auth/login')
      .send({ email: 'user1@test.com', password: 'Password123!' });
    const superCookie = loginRes.headers['set-cookie'];

    const groupRes = await request(app).post('/api/groups').set('Cookie', superCookie)
      .send({ name: 'Cedar Stake', type: 'stake' });
    groupId = groupRes.body.group.id;
  });

  test('admin invites user by email — creates pending tokenized invite', async () => {
    db.prepare("UPDATE users SET role = 'super' WHERE email = 'user1@test.com'").run();
    const loginRes = await request(app).post('/api/auth/login')
      .send({ email: 'user1@test.com', password: 'Password123!' });
    const superCookie = loginRes.headers['set-cookie'];

    const res = await request(app).post(`/api/groups/${groupId}/invite`).set('Cookie', superCookie)
      .send({ email: 'user2@test.com' });
    expect(res.status).toBe(200);
    expect(res.body.invite).toBeDefined();
    expect(res.body.invite.email).toBe('user2@test.com');
    expect(res.body.invite.role).toBe('member');
    expect(res.body.invite.token).toBeDefined();
  });

  test('email invite works for unregistered users (creates pending invite)', async () => {
    db.prepare("UPDATE users SET role = 'super' WHERE email = 'user1@test.com'").run();
    const loginRes = await request(app).post('/api/auth/login')
      .send({ email: 'user1@test.com', password: 'Password123!' });
    const superCookie = loginRes.headers['set-cookie'];

    const res = await request(app).post(`/api/groups/${groupId}/invite`).set('Cookie', superCookie)
      .send({ email: 'nobody@test.com' });
    expect(res.status).toBe(200);
    expect(res.body.invite.email).toBe('nobody@test.com');
  });
});

describe('POST /api/groups/:id/invites + /api/invites/:token', () => {
  let superCookie, groupId;

  beforeEach(async () => {
    db.prepare("UPDATE users SET role = 'super' WHERE email = 'user1@test.com'").run();
    const loginRes = await request(app).post('/api/auth/login')
      .send({ email: 'user1@test.com', password: 'Password123!' });
    superCookie = loginRes.headers['set-cookie'];
    const groupRes = await request(app).post('/api/groups').set('Cookie', superCookie)
      .send({ name: 'Cedar Stake', type: 'stake' });
    groupId = groupRes.body.group.id;
  });

  test('admin mints an admin-role shareable invite', async () => {
    const res = await request(app).post(`/api/groups/${groupId}/invites`).set('Cookie', superCookie)
      .send({ role: 'admin', max_uses: 3 });
    expect(res.status).toBe(201);
    expect(res.body.invite.role).toBe('admin');
    expect(res.body.invite.code).toBeDefined();
    expect(res.body.invite.token).toBeDefined();
    expect(res.body.invite.max_uses).toBe(3);
  });

  test('joining via admin invite code grants admin role', async () => {
    const mintRes = await request(app).post(`/api/groups/${groupId}/invites`).set('Cookie', superCookie)
      .send({ role: 'admin' });
    const code = mintRes.body.invite.code;

    const joinRes = await request(app).post('/api/groups/join').set('Cookie', user2Cookie)
      .send({ invite_code: code });
    expect(joinRes.status).toBe(200);

    const user2 = db.prepare("SELECT id FROM users WHERE email = 'user2@test.com'").get();
    const member = db.prepare('SELECT role FROM group_members WHERE group_id = ? AND user_id = ?').get(groupId, user2.id);
    expect(member.role).toBe('admin');
  });

  test('preview by token returns group info; accept joins user', async () => {
    const mintRes = await request(app).post(`/api/groups/${groupId}/invites`).set('Cookie', superCookie)
      .send({ role: 'member' });
    const token = mintRes.body.invite.token;

    const preview = await request(app).get(`/api/invites/${token}`);
    expect(preview.status).toBe(200);
    expect(preview.body.group.name).toBe('Cedar Stake');

    const accept = await request(app).post(`/api/invites/${token}/accept`).set('Cookie', user2Cookie);
    expect(accept.status).toBe(200);
    expect(accept.body.group.id).toBe(groupId);
  });

  test('revoked invite cannot be used', async () => {
    const mintRes = await request(app).post(`/api/groups/${groupId}/invites`).set('Cookie', superCookie)
      .send({ role: 'member' });
    const inviteId = mintRes.body.invite.id;
    const code = mintRes.body.invite.code;

    const revoke = await request(app).delete(`/api/groups/${groupId}/invites/${inviteId}`)
      .set('Cookie', superCookie);
    expect(revoke.status).toBe(200);

    const join = await request(app).post('/api/groups/join').set('Cookie', user2Cookie)
      .send({ invite_code: code });
    expect(join.status).toBe(410);
  });

  test('exhausted single-use invite is rejected', async () => {
    const mintRes = await request(app).post(`/api/groups/${groupId}/invites`).set('Cookie', superCookie)
      .send({ role: 'member', max_uses: 1 });
    const code = mintRes.body.invite.code;

    const a = await request(app).post('/api/groups/join').set('Cookie', user2Cookie)
      .send({ invite_code: code });
    expect(a.status).toBe(200);

    // user2 already joined; mint a fresh single-use invite for someone else
    const mint2 = await request(app).post(`/api/groups/${groupId}/invites`).set('Cookie', superCookie)
      .send({ role: 'member', max_uses: 1 });
    const code2 = mint2.body.invite.code;

    // Register a third user
    const reg3 = await request(app).post('/api/auth/register')
      .send({ email: 'user3@test.com', password: 'Password123!', name: 'User Three', role: 'user' });
    const user3Cookie = reg3.headers['set-cookie'];
    await request(app).post('/api/auth/register')
      .send({ email: 'user4@test.com', password: 'Password123!', name: 'User Four', role: 'user' });

    const r1 = await request(app).post('/api/groups/join').set('Cookie', user3Cookie)
      .send({ invite_code: code2 });
    expect(r1.status).toBe(200);

    // user3 already used it; user4 trying same code should fail (exhausted)
    const loginUser4 = await request(app).post('/api/auth/login')
      .send({ email: 'user4@test.com', password: 'Password123!' });
    const user4Cookie = loginUser4.headers['set-cookie'];
    const r2 = await request(app).post('/api/groups/join').set('Cookie', user4Cookie)
      .send({ invite_code: code2 });
    expect(r2.status).toBe(410);
  });
});

describe('DELETE /api/groups/:id/members/:userId', () => {
  let groupId;

  beforeEach(async () => {
    db.prepare("UPDATE users SET role = 'super' WHERE email = 'user1@test.com'").run();
    const loginRes = await request(app).post('/api/auth/login')
      .send({ email: 'user1@test.com', password: 'Password123!' });
    const superCookie = loginRes.headers['set-cookie'];

    const groupRes = await request(app).post('/api/groups').set('Cookie', superCookie)
      .send({ name: 'Cedar Stake', type: 'stake' });
    groupId = groupRes.body.group.id;
  });

  test('user can leave group (self-remove)', async () => {
    // Add user2 to group first
    const group = db.prepare('SELECT invite_code FROM groups WHERE id = ?').get(groupId);
    await request(app).post('/api/groups/join').set('Cookie', user2Cookie)
      .send({ invite_code: group.invite_code });

    const user2 = db.prepare("SELECT id FROM users WHERE email = 'user2@test.com'").get();
    const res = await request(app).delete(`/api/groups/${groupId}/members/${user2.id}`)
      .set('Cookie', user2Cookie);
    expect(res.status).toBe(200);
  });
});

describe('POST /api/groups/:id/regenerate-invite', () => {
  let groupId, originalCode;

  beforeEach(async () => {
    db.prepare("UPDATE users SET role = 'super' WHERE email = 'user1@test.com'").run();
    const loginRes = await request(app).post('/api/auth/login')
      .send({ email: 'user1@test.com', password: 'Password123!' });
    const superCookie = loginRes.headers['set-cookie'];

    const groupRes = await request(app).post('/api/groups').set('Cookie', superCookie)
      .send({ name: 'Cedar Stake', type: 'stake' });
    groupId = groupRes.body.group.id;
    originalCode = groupRes.body.group.invite_code;
  });

  test('admin regenerates invite code', async () => {
    db.prepare("UPDATE users SET role = 'super' WHERE email = 'user1@test.com'").run();
    const loginRes = await request(app).post('/api/auth/login')
      .send({ email: 'user1@test.com', password: 'Password123!' });
    const superCookie = loginRes.headers['set-cookie'];

    const res = await request(app).post(`/api/groups/${groupId}/regenerate-invite`)
      .set('Cookie', superCookie);
    expect(res.status).toBe(200);
    expect(res.body.invite_code).toBeDefined();
    expect(res.body.invite_code).not.toBe(originalCode);
  });
});

describe('Events with group_id', () => {
  let groupId;
  let superCookie;

  const eventData = {
    event_name: 'Ward Camp',
    event_dates: 'July 10-12',
    event_description: 'Ward camping trip',
    ward: 'Maple Ward',
    stake: 'Cedar Stake',
    leader_name: 'John',
    leader_phone: '555-1234',
    leader_email: 'john@test.com',
  };

  beforeEach(async () => {
    db.prepare("UPDATE users SET role = 'super' WHERE email = 'user1@test.com'").run();
    const loginRes = await request(app).post('/api/auth/login')
      .send({ email: 'user1@test.com', password: 'Password123!' });
    superCookie = loginRes.headers['set-cookie'];

    const groupRes = await request(app).post('/api/groups').set('Cookie', superCookie)
      .send({ name: 'Maple Ward', type: 'ward' });
    groupId = groupRes.body.group.id;
  });

  test('creates event with group_id', async () => {
    const res = await request(app).post('/api/events').set('Cookie', superCookie)
      .send({ ...eventData, group_id: groupId });
    expect(res.status).toBe(201);
    expect(res.body.event.group_id).toBe(groupId);
  });

  test('group member sees group events in list', async () => {
    // Create event as super
    await request(app).post('/api/events').set('Cookie', superCookie)
      .send({ ...eventData, group_id: groupId });

    // Add user2 to group
    const group = db.prepare('SELECT invite_code FROM groups WHERE id = ?').get(groupId);
    await request(app).post('/api/groups/join').set('Cookie', user2Cookie)
      .send({ invite_code: group.invite_code });

    // user2 should see the group event
    const res = await request(app).get('/api/events').set('Cookie', user2Cookie);
    expect(res.status).toBe(200);
    expect(res.body.events).toHaveLength(1);
    expect(res.body.events[0].group_id).toBe(groupId);
  });

  test('non-member does not see group events', async () => {
    await request(app).post('/api/events').set('Cookie', superCookie)
      .send({ ...eventData, group_id: groupId });

    // user2 is NOT a member
    const res = await request(app).get('/api/events').set('Cookie', user2Cookie);
    expect(res.status).toBe(200);
    expect(res.body.events).toHaveLength(0);
  });

  test('rejects event creation with invalid group_id', async () => {
    const res = await request(app).post('/api/events').set('Cookie', superCookie)
      .send({ ...eventData, group_id: 'nonexistent-id' });
    expect(res.status).toBe(400);
  });
});

// =============================================================================
// Coverage sweep — hierarchical admin, guards, propagation, leader invites,
// accept-invite edge cases, regenerate-invite revokes prior, effective_admin.
// =============================================================================

describe('Hierarchical admin authority', () => {
  // We use a dedicated stake admin who is NOT a direct ward admin to isolate
  // the claim that stake-level admin grants authority over child wards.
  let stakeAdminCookie, otherCookie, stakeId, wardId, stakeAdminUserId, wardMemberUserId;

  beforeEach(async () => {
    // user1 is super, builds the hierarchy
    db.prepare("UPDATE users SET role = 'super' WHERE email = 'user1@test.com'").run();
    const superLogin = await request(app).post('/api/auth/login')
      .send({ email: 'user1@test.com', password: 'Password123!' });
    const superCookie = superLogin.headers['set-cookie'];

    const stakeRes = await request(app).post('/api/groups').set('Cookie', superCookie)
      .send({ name: 'Saratoga Stake', type: 'stake' });
    stakeId = stakeRes.body.group.id;
    const wardRes = await request(app).post('/api/groups').set('Cookie', superCookie)
      .send({ name: 'Saratoga 1st Ward', type: 'ward', parent_id: stakeId });
    wardId = wardRes.body.group.id;

    // Register a stake-admin-only user (not a ward member)
    const stakeAdminReg = await request(app).post('/api/auth/register')
      .send({ email: 'stakeadmin@test.com', password: 'Password123!', name: 'Stake Admin', role: 'user' });
    stakeAdminCookie = stakeAdminReg.headers['set-cookie'];
    stakeAdminUserId = db.prepare("SELECT id FROM users WHERE email = 'stakeadmin@test.com'").get().id;
    // Add them as admin of the stake only
    db.prepare(`INSERT INTO group_members (id, group_id, user_id, role) VALUES (?, ?, ?, 'admin')`)
      .run(require('crypto').randomUUID(), stakeId, stakeAdminUserId);

    // user2 joins the ward as a member via the ward code
    const wardCode = db.prepare('SELECT invite_code FROM groups WHERE id = ?').get(wardId).invite_code;
    await request(app).post('/api/groups/join').set('Cookie', user2Cookie)
      .send({ invite_code: wardCode });
    wardMemberUserId = db.prepare("SELECT id FROM users WHERE email = 'user2@test.com'").get().id;

    // Outsider — not in either group
    const reg3 = await request(app).post('/api/auth/register')
      .send({ email: 'outsider@test.com', password: 'Password123!', name: 'Outsider', role: 'user' });
    otherCookie = reg3.headers['set-cookie'];
  });

  test('stake admin can promote a ward member without explicit ward admin', async () => {
    // Confirm stakeadmin has no direct ward membership
    const wardMembership = db.prepare('SELECT role FROM group_members WHERE group_id = ? AND user_id = ?').get(wardId, stakeAdminUserId);
    expect(wardMembership).toBeUndefined();

    const res = await request(app).put(`/api/groups/${wardId}/members/${wardMemberUserId}/role`)
      .set('Cookie', stakeAdminCookie).send({ role: 'admin' });
    expect(res.status).toBe(200);
    const updated = db.prepare('SELECT role FROM group_members WHERE group_id = ? AND user_id = ?').get(wardId, wardMemberUserId);
    expect(updated.role).toBe('admin');
  });

  test('non-admin outsider cannot manage child ward members', async () => {
    const res = await request(app).put(`/api/groups/${wardId}/members/${wardMemberUserId}/role`)
      .set('Cookie', otherCookie).send({ role: 'admin' });
    expect(res.status).toBe(403);
  });

  test('GET /:id returns effective_admin true for stake admin viewing child ward', async () => {
    const res = await request(app).get(`/api/groups/${wardId}`).set('Cookie', stakeAdminCookie);
    expect(res.status).toBe(200);
    expect(res.body.group.effective_admin).toBe(true);
  });
});

describe('Last-admin guards', () => {
  let superCookie, groupId;

  beforeEach(async () => {
    db.prepare("UPDATE users SET role = 'super' WHERE email = 'user1@test.com'").run();
    const login = await request(app).post('/api/auth/login')
      .send({ email: 'user1@test.com', password: 'Password123!' });
    superCookie = login.headers['set-cookie'];
    const groupRes = await request(app).post('/api/groups').set('Cookie', superCookie)
      .send({ name: 'Solo Stake', type: 'stake' });
    groupId = groupRes.body.group.id;
    db.prepare("UPDATE users SET role = 'user' WHERE email = 'user1@test.com'").run();
  });

  test('cannot demote the last admin', async () => {
    const u1 = db.prepare("SELECT id FROM users WHERE email = 'user1@test.com'").get();
    // Re-login since role changed
    const login = await request(app).post('/api/auth/login')
      .send({ email: 'user1@test.com', password: 'Password123!' });
    const cookie = login.headers['set-cookie'];

    const res = await request(app).put(`/api/groups/${groupId}/members/${u1.id}/role`)
      .set('Cookie', cookie).send({ role: 'member' });
    expect(res.status).toBe(409);
    expect(res.body.error).toMatch(/last admin/i);
  });

  test('cannot remove the last admin', async () => {
    const u1 = db.prepare("SELECT id FROM users WHERE email = 'user1@test.com'").get();
    const login = await request(app).post('/api/auth/login')
      .send({ email: 'user1@test.com', password: 'Password123!' });
    const cookie = login.headers['set-cookie'];

    const res = await request(app).delete(`/api/groups/${groupId}/members/${u1.id}`)
      .set('Cookie', cookie);
    expect(res.status).toBe(409);
  });
});

describe('Parent-stake propagation', () => {
  let stakeId, wardId;

  beforeEach(async () => {
    db.prepare("UPDATE users SET role = 'super' WHERE email = 'user1@test.com'").run();
    const login = await request(app).post('/api/auth/login')
      .send({ email: 'user1@test.com', password: 'Password123!' });
    const superCookie = login.headers['set-cookie'];
    const stakeRes = await request(app).post('/api/groups').set('Cookie', superCookie)
      .send({ name: 'Cedar Stake', type: 'stake' });
    stakeId = stakeRes.body.group.id;
    const wardRes = await request(app).post('/api/groups').set('Cookie', superCookie)
      .send({ name: 'Cedar 5th Ward', type: 'ward', parent_id: stakeId });
    wardId = wardRes.body.group.id;
  });

  test('joining a ward via code auto-adds user to parent stake', async () => {
    const wardCode = db.prepare('SELECT invite_code FROM groups WHERE id = ?').get(wardId).invite_code;
    await request(app).post('/api/groups/join').set('Cookie', user2Cookie)
      .send({ invite_code: wardCode });

    const u2 = db.prepare("SELECT id FROM users WHERE email = 'user2@test.com'").get();
    const wardMember = db.prepare('SELECT role FROM group_members WHERE group_id = ? AND user_id = ?').get(wardId, u2.id);
    const stakeMember = db.prepare('SELECT role FROM group_members WHERE group_id = ? AND user_id = ?').get(stakeId, u2.id);
    expect(wardMember).toBeDefined();
    expect(stakeMember).toBeDefined();
    expect(stakeMember.role).toBe('member');
  });

  test('accepting a tokenized ward invite propagates to parent stake', async () => {
    db.prepare("UPDATE users SET role = 'super' WHERE email = 'user1@test.com'").run();
    const login = await request(app).post('/api/auth/login')
      .send({ email: 'user1@test.com', password: 'Password123!' });
    const superCookie = login.headers['set-cookie'];

    const mint = await request(app).post(`/api/groups/${wardId}/invites`).set('Cookie', superCookie)
      .send({ role: 'member' });
    const token = mint.body.invite.token;

    const accept = await request(app).post(`/api/invites/${token}/accept`).set('Cookie', user2Cookie);
    expect(accept.status).toBe(200);

    const u2 = db.prepare("SELECT id FROM users WHERE email = 'user2@test.com'").get();
    const stakeMember = db.prepare('SELECT role FROM group_members WHERE group_id = ? AND user_id = ?').get(stakeId, u2.id);
    expect(stakeMember).toBeDefined();
  });
});

describe('leader_email auto-invite on group create', () => {
  test('with send_leader_invite, mints an admin-role tokenized invite for the leader', async () => {
    db.prepare("UPDATE users SET role = 'super' WHERE email = 'user1@test.com'").run();
    const login = await request(app).post('/api/auth/login')
      .send({ email: 'user1@test.com', password: 'Password123!' });
    const superCookie = login.headers['set-cookie'];

    const res = await request(app).post('/api/groups').set('Cookie', superCookie).send({
      name: 'Pine Stake', type: 'stake',
      leader_email: 'newleader@test.com',
      send_leader_invite: true,
    });
    expect(res.status).toBe(201);

    const invites = db.prepare(
      `SELECT role, email, max_uses FROM group_invites WHERE group_id = ? AND email = ?`
    ).all(res.body.group.id, 'newleader@test.com');
    expect(invites).toHaveLength(1);
    expect(invites[0].role).toBe('admin');
    expect(invites[0].max_uses).toBe(1);
  });

  test('without send_leader_invite, no leader invite is created', async () => {
    db.prepare("UPDATE users SET role = 'super' WHERE email = 'user1@test.com'").run();
    const login = await request(app).post('/api/auth/login')
      .send({ email: 'user1@test.com', password: 'Password123!' });
    const superCookie = login.headers['set-cookie'];

    const res = await request(app).post('/api/groups').set('Cookie', superCookie).send({
      name: 'Maple Stake', type: 'stake',
      leader_email: 'leader@test.com',
    });
    const invites = db.prepare('SELECT role FROM group_invites WHERE group_id = ? AND email IS NOT NULL').all(res.body.group.id);
    expect(invites).toHaveLength(0);
  });
});

describe('Regenerate invite — revokes prior default codes', () => {
  test('previously valid code becomes unusable after regenerate', async () => {
    db.prepare("UPDATE users SET role = 'super' WHERE email = 'user1@test.com'").run();
    const login = await request(app).post('/api/auth/login')
      .send({ email: 'user1@test.com', password: 'Password123!' });
    const superCookie = login.headers['set-cookie'];

    const create = await request(app).post('/api/groups').set('Cookie', superCookie)
      .send({ name: 'Birch Stake', type: 'stake' });
    const groupId = create.body.group.id;
    const oldCode = create.body.group.invite_code;

    const regen = await request(app).post(`/api/groups/${groupId}/regenerate-invite`).set('Cookie', superCookie);
    expect(regen.status).toBe(200);
    expect(regen.body.invite_code).not.toBe(oldCode);

    // Old code should now be revoked → 410
    const join = await request(app).post('/api/groups/join').set('Cookie', user2Cookie)
      .send({ invite_code: oldCode });
    expect(join.status).toBe(410);

    // New code should work
    const join2 = await request(app).post('/api/groups/join').set('Cookie', user2Cookie)
      .send({ invite_code: regen.body.invite_code });
    expect(join2.status).toBe(200);
  });
});

describe('Accept invite — wrong email', () => {
  test('email-targeted invite rejects accept by a different email', async () => {
    db.prepare("UPDATE users SET role = 'super' WHERE email = 'user1@test.com'").run();
    const login = await request(app).post('/api/auth/login')
      .send({ email: 'user1@test.com', password: 'Password123!' });
    const superCookie = login.headers['set-cookie'];

    const create = await request(app).post('/api/groups').set('Cookie', superCookie)
      .send({ name: 'Walnut Stake', type: 'stake' });
    const groupId = create.body.group.id;

    const mint = await request(app).post(`/api/groups/${groupId}/invites`).set('Cookie', superCookie)
      .send({ role: 'member', email: 'someone-else@test.com' });
    const token = mint.body.invite.token;

    const accept = await request(app).post(`/api/invites/${token}/accept`).set('Cookie', user2Cookie);
    expect(accept.status).toBe(403);
    expect(accept.body.error).toMatch(/different email/i);
  });
});

describe('Audit log', () => {
  let superCookie, groupId;

  beforeEach(async () => {
    db.prepare("UPDATE users SET role = 'super' WHERE email = 'user1@test.com'").run();
    const login = await request(app).post('/api/auth/login')
      .send({ email: 'user1@test.com', password: 'Password123!' });
    superCookie = login.headers['set-cookie'];
    const groupRes = await request(app).post('/api/groups').set('Cookie', superCookie)
      .send({ name: 'Oak Stake', type: 'stake' });
    groupId = groupRes.body.group.id;
  });

  test('records group.create and member.added on creation', async () => {
    const res = await request(app).get(`/api/groups/${groupId}/audit`).set('Cookie', superCookie);
    expect(res.status).toBe(200);
    const actions = res.body.entries.map((e) => e.action);
    expect(actions).toContain('group.create');
    expect(actions).toContain('member.added');
  });

  test('records invite.created with role/email metadata', async () => {
    await request(app).post(`/api/groups/${groupId}/invites`).set('Cookie', superCookie)
      .send({ role: 'admin', email: 'newadmin@test.com' });

    const res = await request(app).get(`/api/groups/${groupId}/audit`).set('Cookie', superCookie);
    const inviteEntries = res.body.entries.filter((e) => e.action === 'invite.created');
    expect(inviteEntries.length).toBeGreaterThan(0);
    const matching = inviteEntries.find((e) => e.meta && e.meta.email === 'newadmin@test.com');
    expect(matching).toBeDefined();
    expect(matching.meta.role).toBe('admin');
  });

  test('records member.role_changed and member.removed', async () => {
    const wardCode = db.prepare('SELECT invite_code FROM groups WHERE id = ?').get(groupId).invite_code;
    await request(app).post('/api/groups/join').set('Cookie', user2Cookie)
      .send({ invite_code: wardCode });
    const u2 = db.prepare("SELECT id FROM users WHERE email = 'user2@test.com'").get();

    await request(app).put(`/api/groups/${groupId}/members/${u2.id}/role`).set('Cookie', superCookie)
      .send({ role: 'admin' });
    await request(app).delete(`/api/groups/${groupId}/members/${u2.id}`).set('Cookie', superCookie);

    const res = await request(app).get(`/api/groups/${groupId}/audit`).set('Cookie', superCookie);
    const actions = res.body.entries.map((e) => e.action);
    expect(actions).toContain('member.role_changed');
    expect(actions).toContain('member.removed');
  });

  test('non-admin cannot read audit log', async () => {
    const res = await request(app).get(`/api/groups/${groupId}/audit`).set('Cookie', user2Cookie);
    expect(res.status).toBe(403);
  });

  test('stake admin sees descendant-ward activity', async () => {
    const wardRes = await request(app).post('/api/groups').set('Cookie', superCookie)
      .send({ name: 'Oak 1st Ward', type: 'ward', parent_id: groupId });
    const wardId = wardRes.body.group.id;

    const res = await request(app).get(`/api/groups/${groupId}/audit`).set('Cookie', superCookie);
    const groupCreateEntries = res.body.entries.filter((e) => e.action === 'group.create');
    const wardCreate = groupCreateEntries.find((e) => e.target_id === wardId);
    expect(wardCreate).toBeDefined();
  });

  test('audit entries are returned newest-first with actor name joined', async () => {
    await request(app).post(`/api/groups/${groupId}/invites`).set('Cookie', superCookie)
      .send({ role: 'member' });

    const res = await request(app).get(`/api/groups/${groupId}/audit`).set('Cookie', superCookie);
    const entries = res.body.entries;
    expect(entries.length).toBeGreaterThan(1);
    // Each entry should have actor_name joined
    for (const e of entries) {
      if (e.actor_id) expect(e.actor_name).toBeDefined();
    }
    // Newest first: descending created_at
    for (let i = 1; i < entries.length; i++) {
      expect(entries[i - 1].created_at >= entries[i].created_at).toBe(true);
    }
  });
});

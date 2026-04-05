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

  test('admin invites user by email', async () => {
    db.prepare("UPDATE users SET role = 'super' WHERE email = 'user1@test.com'").run();
    const loginRes = await request(app).post('/api/auth/login')
      .send({ email: 'user1@test.com', password: 'Password123!' });
    const superCookie = loginRes.headers['set-cookie'];

    const res = await request(app).post(`/api/groups/${groupId}/invite`).set('Cookie', superCookie)
      .send({ email: 'user2@test.com' });
    expect(res.status).toBe(200);
    expect(res.body.member.email).toBe('user2@test.com');
    expect(res.body.member.role).toBe('member');
  });

  test('rejects invite of non-existent user', async () => {
    db.prepare("UPDATE users SET role = 'super' WHERE email = 'user1@test.com'").run();
    const loginRes = await request(app).post('/api/auth/login')
      .send({ email: 'user1@test.com', password: 'Password123!' });
    const superCookie = loginRes.headers['set-cookie'];

    const res = await request(app).post(`/api/groups/${groupId}/invite`).set('Cookie', superCookie)
      .send({ email: 'nobody@test.com' });
    expect(res.status).toBe(404);
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

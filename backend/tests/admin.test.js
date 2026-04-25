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

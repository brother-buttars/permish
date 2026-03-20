const request = require('supertest');
const app = require('../src/index');
const { createTestDb } = require('./setup');

let db;
beforeEach(() => {
  db = createTestDb();
  app.locals.db = db;
});
afterEach(() => db.close());

describe('POST /api/auth/register', () => {
  test('registers a new planner', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ email: 'planner@test.com', password: 'Password123!', name: 'Test Planner', role: 'planner' });
    expect(res.status).toBe(201);
    expect(res.body.user.email).toBe('planner@test.com');
    expect(res.body.user.role).toBe('planner');
    expect(res.body.user).not.toHaveProperty('password_hash');
  });

  test('registers a new parent', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ email: 'parent@test.com', password: 'Password123!', name: 'Test Parent', role: 'parent' });
    expect(res.status).toBe(201);
    expect(res.body.user.role).toBe('parent');
  });

  test('rejects duplicate email', async () => {
    await request(app)
      .post('/api/auth/register')
      .send({ email: 'dupe@test.com', password: 'Password123!', name: 'User1', role: 'parent' });
    const res = await request(app)
      .post('/api/auth/register')
      .send({ email: 'dupe@test.com', password: 'Password123!', name: 'User2', role: 'parent' });
    expect(res.status).toBe(409);
  });

  test('rejects invalid role', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ email: 'bad@test.com', password: 'Password123!', name: 'Bad', role: 'admin' });
    expect(res.status).toBe(400);
  });
});

describe('POST /api/auth/login', () => {
  beforeEach(async () => {
    await request(app)
      .post('/api/auth/register')
      .send({ email: 'login@test.com', password: 'Password123!', name: 'Login User', role: 'planner' });
  });

  test('logs in with correct credentials and sets cookie', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'login@test.com', password: 'Password123!' });
    expect(res.status).toBe(200);
    expect(res.headers['set-cookie']).toBeDefined();
    expect(res.body.user.email).toBe('login@test.com');
  });

  test('rejects wrong password', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'login@test.com', password: 'WrongPassword!' });
    expect(res.status).toBe(401);
  });
});

describe('GET /api/auth/me', () => {
  test('returns user when authenticated', async () => {
    await request(app)
      .post('/api/auth/register')
      .send({ email: 'me@test.com', password: 'Password123!', name: 'Me User', role: 'parent' });
    const loginRes = await request(app)
      .post('/api/auth/login')
      .send({ email: 'me@test.com', password: 'Password123!' });
    const cookie = loginRes.headers['set-cookie'];

    const res = await request(app)
      .get('/api/auth/me')
      .set('Cookie', cookie);
    expect(res.status).toBe(200);
    expect(res.body.user.email).toBe('me@test.com');
  });

  test('returns 401 when not authenticated', async () => {
    const res = await request(app).get('/api/auth/me');
    expect(res.status).toBe(401);
  });
});

describe('POST /api/auth/logout', () => {
  test('clears the auth cookie', async () => {
    const res = await request(app).post('/api/auth/logout');
    expect(res.status).toBe(200);
    const cookie = res.headers['set-cookie'][0];
    expect(cookie).toMatch(/token=;/);
  });
});

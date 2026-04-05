const request = require('supertest');
const app = require('../src/index');
const { createTestDb } = require('./setup');

let db;
let plannerCookie;
let parentCookie;

const plannerData = { email: 'planner@test.com', password: 'Password123!', name: 'Planner', role: 'planner' };
const parentData = { email: 'parent@test.com', password: 'Password123!', name: 'Parent', role: 'parent' };

const eventData = {
  event_name: 'Youth Camp',
  event_dates: 'June 15-18, 2026',
  event_description: 'Annual youth camp at Lake Powell',
  ward: 'Maple Ward',
  stake: 'Cedar Stake',
  leader_name: 'John Smith',
  leader_phone: '555-123-4567',
  leader_email: 'john@example.com',
  notify_email: 'notify@example.com',
};

beforeEach(async () => {
  db = createTestDb();
  app.locals.db = db;
  const plannerRes = await request(app).post('/api/auth/register').send(plannerData);
  plannerCookie = plannerRes.headers['set-cookie'];
  const parentRes = await request(app).post('/api/auth/register').send(parentData);
  parentCookie = parentRes.headers['set-cookie'];
});
afterEach(() => db.close());

describe('POST /api/events', () => {
  test('planner creates event', async () => {
    const res = await request(app).post('/api/events').set('Cookie', plannerCookie).send(eventData);
    expect(res.status).toBe(201);
    expect(res.body.event.event_name).toBe('Youth Camp');
    expect(res.body.event.id).toBeDefined();
    expect(res.body.formUrl).toContain(res.body.event.id);
  });
  test('any authenticated user can create event', async () => {
    const res = await request(app).post('/api/events').set('Cookie', parentCookie).send(eventData);
    expect(res.status).toBe(201);
    expect(res.body.event.event_name).toBe('Youth Camp');
  });
  test('unauthenticated cannot create event', async () => {
    const res = await request(app).post('/api/events').send(eventData);
    expect(res.status).toBe(401);
  });
});

describe('GET /api/events', () => {
  test('planner lists own events', async () => {
    await request(app).post('/api/events').set('Cookie', plannerCookie).send(eventData);
    const res = await request(app).get('/api/events').set('Cookie', plannerCookie);
    expect(res.status).toBe(200);
    expect(res.body.events).toHaveLength(1);
  });
});

describe('GET /api/events/:id', () => {
  test('planner gets event details', async () => {
    const createRes = await request(app).post('/api/events').set('Cookie', plannerCookie).send(eventData);
    const id = createRes.body.event.id;
    const res = await request(app).get(`/api/events/${id}`).set('Cookie', plannerCookie);
    expect(res.status).toBe(200);
    expect(res.body.event.event_name).toBe('Youth Camp');
  });
});

describe('PUT /api/events/:id', () => {
  test('planner updates event', async () => {
    const createRes = await request(app).post('/api/events').set('Cookie', plannerCookie).send(eventData);
    const id = createRes.body.event.id;
    const res = await request(app).put(`/api/events/${id}`).set('Cookie', plannerCookie)
      .send({ ...eventData, event_name: 'Updated Camp' });
    expect(res.status).toBe(200);
    expect(res.body.event.event_name).toBe('Updated Camp');
  });
});

describe('DELETE /api/events/:id', () => {
  test('soft-deletes event (sets is_active to false)', async () => {
    const createRes = await request(app).post('/api/events').set('Cookie', plannerCookie).send(eventData);
    const id = createRes.body.event.id;
    const res = await request(app).delete(`/api/events/${id}`).set('Cookie', plannerCookie);
    expect(res.status).toBe(200);
    const listRes = await request(app).get('/api/events').set('Cookie', plannerCookie);
    expect(listRes.body.events).toHaveLength(0);
  });
});

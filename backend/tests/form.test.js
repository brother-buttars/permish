const request = require('supertest');
const app = require('../src/index');
const { createTestDb } = require('./setup');

let db, plannerCookie, parentCookie, eventId;

beforeEach(async () => {
  db = createTestDb();
  app.locals.db = db;

  const plannerRes = await request(app).post('/api/auth/register')
    .send({ email: 'planner@test.com', password: 'Password123!', name: 'Planner', role: 'planner' });
  plannerCookie = plannerRes.headers['set-cookie'];

  const parentRes = await request(app).post('/api/auth/register')
    .send({ email: 'parent@test.com', password: 'Password123!', name: 'Parent', role: 'parent' });
  parentCookie = parentRes.headers['set-cookie'];

  const eventRes = await request(app).post('/api/events').set('Cookie', plannerCookie).send({
    event_name: 'Youth Camp', event_dates: 'June 15-18', event_description: 'Camp',
    ward: 'Maple', stake: 'Cedar', leader_name: 'John', leader_phone: '555-1234', leader_email: 'john@test.com',
  });
  eventId = eventRes.body.event.id;
});
afterEach(() => db.close());

describe('GET /api/events/:id/form', () => {
  test('returns event details for active event', async () => {
    const res = await request(app).get(`/api/events/${eventId}/form`);
    expect(res.status).toBe(200);
    expect(res.body.event.event_name).toBe('Youth Camp');
    expect(res.body.event).not.toHaveProperty('notify_email');
  });

  test('returns 410 for inactive event', async () => {
    db.prepare('UPDATE events SET is_active = 0 WHERE id = ?').run(eventId);
    const res = await request(app).get(`/api/events/${eventId}/form`);
    expect(res.status).toBe(410);
  });
});

describe('POST /api/events/:id/submit', () => {
  const submissionData = {
    participant_name: 'Jane Doe',
    participant_dob: '2014-05-15',
    participant_phone: '555-111-2222',
    address: '123 Main St',
    city: 'Springfield',
    state_province: 'UT',
    emergency_contact: 'John Doe',
    emergency_phone_primary: '555-333-4444',
    special_diet: false,
    allergies: false,
    chronic_illness: false,
    recent_surgery: false,
    participant_signature: 'Jane Doe',
    participant_signature_type: 'typed',
    participant_signature_date: '2026-06-10',
    guardian_signature: 'John Doe',
    guardian_signature_type: 'typed',
    guardian_signature_date: '2026-06-10',
  };

  test('anonymous user submits form', async () => {
    const res = await request(app).post(`/api/events/${eventId}/submit`).send(submissionData);
    expect(res.status).toBe(201);
    expect(res.body.submission.participant_name).toBe('Jane Doe');
    expect(res.body.submission.participant_age).toBeDefined();
  });

  test('authenticated parent submits form', async () => {
    const res = await request(app).post(`/api/events/${eventId}/submit`)
      .set('Cookie', parentCookie).send(submissionData);
    expect(res.status).toBe(201);
    expect(res.body.submission.submitted_by).toBeDefined();
  });

  test('rejects submission on inactive event', async () => {
    db.prepare('UPDATE events SET is_active = 0 WHERE id = ?').run(eventId);
    const res = await request(app).post(`/api/events/${eventId}/submit`).send(submissionData);
    expect(res.status).toBe(410);
  });

  test('rejects submission missing participant_name', async () => {
    const { participant_name, ...data } = submissionData;
    const res = await request(app).post(`/api/events/${eventId}/submit`).send(data);
    expect(res.status).toBe(400);
    expect(res.body.error).toContain('required');
  });

  test('rejects submission missing participant_dob', async () => {
    const { participant_dob, ...data } = submissionData;
    const res = await request(app).post(`/api/events/${eventId}/submit`).send(data);
    expect(res.status).toBe(400);
  });

  test('rejects submission missing signature type', async () => {
    const { participant_signature_type, ...data } = submissionData;
    const res = await request(app).post(`/api/events/${eventId}/submit`).send(data);
    expect(res.status).toBe(400);
  });

  test('rejects submission missing signature date', async () => {
    const { participant_signature_date, ...data } = submissionData;
    const res = await request(app).post(`/api/events/${eventId}/submit`).send(data);
    expect(res.status).toBe(400);
  });

  test('rejects oversized participant signature', async () => {
    const res = await request(app).post(`/api/events/${eventId}/submit`).send({
      ...submissionData,
      participant_signature: 'x'.repeat(800000),
    });
    expect(res.status).toBe(400);
    expect(res.body.error).toContain('Signature too large');
  });

  test('rejects oversized guardian signature', async () => {
    const res = await request(app).post(`/api/events/${eventId}/submit`).send({
      ...submissionData,
      guardian_signature: 'x'.repeat(800000),
    });
    expect(res.status).toBe(400);
    expect(res.body.error.toLowerCase()).toContain('signature too large');
  });

  test('allows hand signature type without signature data', async () => {
    const res = await request(app).post(`/api/events/${eventId}/submit`).send({
      ...submissionData,
      participant_signature: null,
      participant_signature_type: 'hand',
    });
    expect(res.status).toBe(201);
    expect(res.body.submission.participant_signature_type).toBe('hand');
  });

  test('rejects typed signature without signature data', async () => {
    const res = await request(app).post(`/api/events/${eventId}/submit`).send({
      ...submissionData,
      participant_signature: null,
      participant_signature_type: 'typed',
    });
    expect(res.status).toBe(400);
    expect(res.body.error).toContain('signature is required');
  });

  test('returns 404 for nonexistent event', async () => {
    const res = await request(app).post('/api/events/nonexistent/submit').send(submissionData);
    expect(res.status).toBe(404);
  });
});

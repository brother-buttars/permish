const request = require('supertest');
const app = require('../src/index');
const { createTestDb } = require('./setup');

let db, plannerCookie, parentCookie, otherPlannerCookie, eventId, submissionId;

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

beforeEach(async () => {
  db = createTestDb();
  app.locals.db = db;

  // Create planner who owns the event
  const plannerRes = await request(app).post('/api/auth/register')
    .send({ email: 'planner@test.com', password: 'Password123!', name: 'Planner', role: 'planner' });
  plannerCookie = plannerRes.headers['set-cookie'];

  // Create a second planner who does NOT own the event
  const otherPlannerRes = await request(app).post('/api/auth/register')
    .send({ email: 'other@test.com', password: 'Password123!', name: 'Other Planner', role: 'planner' });
  otherPlannerCookie = otherPlannerRes.headers['set-cookie'];

  // Create parent who will submit
  const parentRes = await request(app).post('/api/auth/register')
    .send({ email: 'parent@test.com', password: 'Password123!', name: 'Parent', role: 'parent' });
  parentCookie = parentRes.headers['set-cookie'];

  // Create event
  const eventRes = await request(app).post('/api/events').set('Cookie', plannerCookie).send({
    event_name: 'Youth Camp', event_dates: 'June 15-18', event_description: 'Camp',
    ward: 'Maple', stake: 'Cedar', leader_name: 'John', leader_phone: '555-1234', leader_email: 'john@test.com',
  });
  eventId = eventRes.body.event.id;

  // Submit form as parent
  const submitRes = await request(app).post(`/api/events/${eventId}/submit`)
    .set('Cookie', parentCookie).send(submissionData);
  submissionId = submitRes.body.submission.id;
});

afterEach(() => db.close());

describe('GET /api/submissions/mine', () => {
  test('returns submissions for authenticated parent', async () => {
    const res = await request(app).get('/api/submissions/mine').set('Cookie', parentCookie);
    expect(res.status).toBe(200);
    expect(res.body.submissions).toHaveLength(1);
    expect(res.body.submissions[0].participant_name).toBe('Jane Doe');
  });

  test('returns empty array for user with no submissions', async () => {
    const res = await request(app).get('/api/submissions/mine').set('Cookie', otherPlannerCookie);
    expect(res.status).toBe(200);
    expect(res.body.submissions).toHaveLength(0);
  });

  test('requires authentication', async () => {
    const res = await request(app).get('/api/submissions/mine');
    expect(res.status).toBe(401);
  });
});

describe('GET /api/submissions/:id', () => {
  test('planner who owns event can view submission', async () => {
    const res = await request(app).get(`/api/submissions/${submissionId}`).set('Cookie', plannerCookie);
    expect(res.status).toBe(200);
    expect(res.body.submission.participant_name).toBe('Jane Doe');
  });

  test('parent who submitted can view their own submission', async () => {
    const res = await request(app).get(`/api/submissions/${submissionId}`).set('Cookie', parentCookie);
    expect(res.status).toBe(200);
  });

  test('other planner cannot view submission they do not own', async () => {
    const res = await request(app).get(`/api/submissions/${submissionId}`).set('Cookie', otherPlannerCookie);
    expect(res.status).toBe(403);
  });

  test('returns 404 for nonexistent submission', async () => {
    const res = await request(app).get('/api/submissions/nonexistent').set('Cookie', plannerCookie);
    expect(res.status).toBe(404);
  });

  test('requires authentication', async () => {
    const res = await request(app).get(`/api/submissions/${submissionId}`);
    expect(res.status).toBe(401);
  });
});

describe('GET /api/submissions/:id/pdf', () => {
  test('other planner cannot download PDF', async () => {
    const res = await request(app).get(`/api/submissions/${submissionId}/pdf`).set('Cookie', otherPlannerCookie);
    expect(res.status).toBe(403);
  });

  test('returns 404 for nonexistent submission', async () => {
    const res = await request(app).get('/api/submissions/nonexistent/pdf').set('Cookie', plannerCookie);
    expect(res.status).toBe(404);
  });
});

describe('PUT /api/submissions/:id', () => {
  test('planner can update a submission', async () => {
    const res = await request(app).put(`/api/submissions/${submissionId}`)
      .set('Cookie', plannerCookie)
      .send({ ...submissionData, participant_name: 'Jane Updated' });
    expect(res.status).toBe(200);
    expect(res.body.submission.participant_name).toBe('Jane Updated');
  });

  test('submitter can update their own submission', async () => {
    const res = await request(app).put(`/api/submissions/${submissionId}`)
      .set('Cookie', parentCookie)
      .send({ ...submissionData, city: 'New City' });
    expect(res.status).toBe(200);
    expect(res.body.submission.city).toBe('New City');
  });

  test('other planner cannot update submission', async () => {
    const res = await request(app).put(`/api/submissions/${submissionId}`)
      .set('Cookie', otherPlannerCookie)
      .send(submissionData);
    expect(res.status).toBe(403);
  });

  test('returns 404 for nonexistent submission', async () => {
    const res = await request(app).put('/api/submissions/nonexistent')
      .set('Cookie', plannerCookie)
      .send(submissionData);
    expect(res.status).toBe(404);
  });
});

describe('DELETE /api/submissions/:id', () => {
  test('planner who owns event can delete submission', async () => {
    const res = await request(app).delete(`/api/submissions/${submissionId}`).set('Cookie', plannerCookie);
    expect(res.status).toBe(200);
    expect(res.body.message).toBe('Submission deleted');

    // Verify it's actually gone
    const check = await request(app).get(`/api/submissions/${submissionId}`).set('Cookie', plannerCookie);
    expect(check.status).toBe(404);
  });

  test('parent (submitter) cannot delete submission', async () => {
    const res = await request(app).delete(`/api/submissions/${submissionId}`).set('Cookie', parentCookie);
    expect(res.status).toBe(403);
  });

  test('other planner cannot delete submission', async () => {
    const res = await request(app).delete(`/api/submissions/${submissionId}`).set('Cookie', otherPlannerCookie);
    expect(res.status).toBe(403);
  });

  test('returns 404 for nonexistent submission', async () => {
    const res = await request(app).delete('/api/submissions/nonexistent').set('Cookie', plannerCookie);
    expect(res.status).toBe(404);
  });
});

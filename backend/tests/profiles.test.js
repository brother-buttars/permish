const request = require('supertest');
const app = require('../src/index');
const { createTestDb } = require('./setup');

let db, parentCookie;

const profileData = {
  participant_name: 'Jane Doe',
  participant_dob: '2014-05-15',
  participant_phone: '555-111-2222',
  address: '123 Main St',
  city: 'Springfield',
  state_province: 'UT',
  emergency_contact: 'John Doe',
  emergency_phone_primary: '555-333-4444',
  emergency_phone_secondary: '555-555-6666',
  special_diet: false,
  allergies: true,
  allergies_details: 'Peanuts',
  medications: 'None',
  can_self_administer_meds: true,
  chronic_illness: false,
  recent_surgery: false,
  activity_limitations: null,
  other_accommodations: null,
};

beforeEach(async () => {
  db = createTestDb();
  app.locals.db = db;
  const res = await request(app).post('/api/auth/register')
    .send({ email: 'parent@test.com', password: 'Password123!', name: 'Parent', role: 'parent' });
  parentCookie = res.headers['set-cookie'];
});
afterEach(() => db.close());

describe('POST /api/profiles', () => {
  test('creates a child profile', async () => {
    const res = await request(app).post('/api/profiles').set('Cookie', parentCookie).send(profileData);
    expect(res.status).toBe(201);
    expect(res.body.profile.participant_name).toBe('Jane Doe');
  });
  test('requires auth', async () => {
    const res = await request(app).post('/api/profiles').send(profileData);
    expect(res.status).toBe(401);
  });
});

describe('GET /api/profiles', () => {
  test('lists own profiles', async () => {
    await request(app).post('/api/profiles').set('Cookie', parentCookie).send(profileData);
    const res = await request(app).get('/api/profiles').set('Cookie', parentCookie);
    expect(res.status).toBe(200);
    expect(res.body.profiles).toHaveLength(1);
  });
});

describe('PUT /api/profiles/:id', () => {
  test('updates a profile', async () => {
    const createRes = await request(app).post('/api/profiles').set('Cookie', parentCookie).send(profileData);
    const id = createRes.body.profile.id;
    const res = await request(app).put(`/api/profiles/${id}`).set('Cookie', parentCookie)
      .send({ ...profileData, participant_name: 'Jane Updated' });
    expect(res.status).toBe(200);
    expect(res.body.profile.participant_name).toBe('Jane Updated');
  });
});

describe('DELETE /api/profiles/:id', () => {
  test('deletes a profile', async () => {
    const createRes = await request(app).post('/api/profiles').set('Cookie', parentCookie).send(profileData);
    const id = createRes.body.profile.id;
    const res = await request(app).delete(`/api/profiles/${id}`).set('Cookie', parentCookie);
    expect(res.status).toBe(200);
    const listRes = await request(app).get('/api/profiles').set('Cookie', parentCookie);
    expect(listRes.body.profiles).toHaveLength(0);
  });
});

import { describe, it, expect, beforeAll } from 'bun:test';
import { createDb, bootstrapSuperAdmin } from '../src/db.ts';
import { createApp } from '../src/app.ts';

// Exercises the full ported surface (form/submit/PDF, profiles, groups, invites,
// admin) end-to-end in-process, proving the Bun server matches the Express contract.

let app: ReturnType<typeof createApp>;

function jar() {
  let cookie = '';
  return {
    async req(path: string, init: RequestInit = {}) {
      const headers = new Headers(init.headers);
      if (cookie) headers.set('Cookie', cookie);
      if (init.body && !(init.body instanceof FormData)) headers.set('Content-Type', 'application/json');
      const res = await app.request(path, { ...init, headers });
      const set = res.headers.get('set-cookie');
      if (set) cookie = set.split(';')[0]!;
      return res;
    },
  };
}

async function registerPlanner(email: string) {
  const c = jar();
  await c.req('/api/auth/register', { method: 'POST', body: JSON.stringify({ email, password: 'password123', name: email, role: 'user' }) });
  return c;
}

async function loginSuper() {
  const c = jar();
  await c.req('/api/auth/login', { method: 'POST', body: JSON.stringify({ email: 'jesus@permish.app', password: 'childofgod' }) });
  return c;
}

beforeAll(async () => {
  const db = createDb(':memory:');
  await bootstrapSuperAdmin(db);
  app = createApp(db);
});

describe('public form + submit + PDF', () => {
  it('loads a form publicly and accepts an anonymous submission that generates a PDF', async () => {
    const planner = await registerPlanner('formowner@test.app');
    const created = await planner.req('/api/events', {
      method: 'POST',
      body: JSON.stringify({
        event_name: 'Temple Trip', event_dates: '5 April 2026', event_description: 'Baptisms',
        ward: 'Oak Ward', stake: 'Provo Stake', leader_name: 'Sis Jones',
        leader_phone: '801-555-0000', leader_email: 'jones@test.app',
      }),
    });
    const { event } = await created.json();

    // Public form load — no cookie.
    const formRes = await app.request(`/api/events/${event.id}/form`);
    expect(formRes.status).toBe(200);
    const form = await formRes.json();
    expect(form.event.event_name).toBe('Temple Trip');
    expect(form.event).not.toHaveProperty('is_active');

    // Public submit — no cookie.
    const submitRes = await app.request(`/api/events/${event.id}/submit`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        participant_name: 'Timmy Youth', participant_dob: '2012-06-01',
        participant_signature_type: 'hand', participant_signature_date: '2026-04-01',
      }),
    });
    expect(submitRes.status).toBe(201);
    const { submission } = await submitRes.json();
    expect(submission.participant_name).toBe('Timmy Youth');
    expect(submission.participant_age).toBe(14); // DOB 2012-06-01, today 2026-07-13
    expect(submission.pdf_path).toBeTruthy();

    // Planner can list + read the submission; PDF downloads.
    const list = await planner.req(`/api/events/${event.id}/submissions`);
    expect((await list.json()).submissions).toHaveLength(1);
    const pdf = await planner.req(`/api/submissions/${submission.id}/pdf`);
    expect(pdf.status).toBe(200);
    expect(pdf.headers.get('content-type')).toBe('application/pdf');
  });

  it('rejects a submission missing required fields', async () => {
    const planner = await registerPlanner('formowner2@test.app');
    const { event } = await (await planner.req('/api/events', {
      method: 'POST',
      body: JSON.stringify({ event_name: 'X', event_dates: 'Y', event_description: 'Z', ward: 'W', stake: 'S', leader_name: 'L', leader_phone: '1234567', leader_email: 'l@t.co' }),
    })).json();
    const res = await app.request(`/api/events/${event.id}/submit`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ participant_name: 'No DOB' }),
    });
    expect(res.status).toBe(400);
  });
});

describe('profiles', () => {
  it('creates, lists, updates, deletes a youth profile', async () => {
    const c = await registerPlanner('parent@test.app');
    const create = await c.req('/api/profiles', { method: 'POST', body: JSON.stringify({ participant_name: 'Sally', participant_dob: '2013-01-01', allergies: true, allergies_details: 'peanuts' }) });
    expect(create.status).toBe(201);
    const { profile } = await create.json();
    expect(profile.allergies).toBe(1);

    const list = await c.req('/api/profiles');
    expect((await list.json()).profiles).toHaveLength(1);

    const upd = await c.req(`/api/profiles/${profile.id}`, { method: 'PUT', body: JSON.stringify({ participant_name: 'Sally B', participant_dob: '2013-01-01' }) });
    expect((await upd.json()).profile.participant_name).toBe('Sally B');

    const del = await c.req(`/api/profiles/${profile.id}`, { method: 'DELETE' });
    expect(del.status).toBe(200);
  });
});

describe('groups + invites', () => {
  it('rejects top-level group creation by a non-super (matches Express)', async () => {
    const normal = await registerPlanner('groupnope@test.app');
    const res = await normal.req('/api/groups', { method: 'POST', body: JSON.stringify({ name: 'Nope Stake', type: 'stake' }) });
    expect(res.status).toBe(403);
  });

  it('super creates a group, mints an invite, and a second user accepts it', async () => {
    const owner = await loginSuper();
    const create = await owner.req('/api/groups', { method: 'POST', body: JSON.stringify({ name: 'Provo Stake', type: 'stake' }) });
    expect(create.status).toBe(201);
    const { group } = await create.json();

    const inviteRes = await owner.req(`/api/groups/${group.id}/invites`, { method: 'POST', body: JSON.stringify({ role: 'member' }) });
    expect(inviteRes.status).toBe(201);
    const { invite } = await inviteRes.json();

    // Public preview.
    const preview = await app.request(`/api/invites/${invite.token}`);
    expect(preview.status).toBe(200);
    expect((await preview.json()).group.name).toBe('Provo Stake');

    // Second user accepts.
    const joiner = await registerPlanner('joiner@test.app');
    const accept = await joiner.req(`/api/invites/${invite.token}/accept`, { method: 'POST' });
    expect(accept.status).toBe(200);
    const joinerGroups = await joiner.req('/api/groups');
    expect((await joinerGroups.json()).groups.map((g: any) => g.name)).toContain('Provo Stake');
  });

  it('blocks a non-admin from reading a group they do not belong to', async () => {
    const owner = await loginSuper();
    const { group } = await (await owner.req('/api/groups', { method: 'POST', body: JSON.stringify({ name: 'Secret Stake', type: 'stake' }) })).json();
    const outsider = await registerPlanner('outsider@test.app');
    const res = await outsider.req(`/api/groups/${group.id}`);
    expect(res.status).toBe(403);
  });
});

describe('admin (super only)', () => {
  it('rejects non-super and serves stats to super', async () => {
    const normal = await registerPlanner('normal@test.app');
    expect((await normal.req('/api/admin/stats')).status).toBe(403);

    const superJar = jar();
    const login = await superJar.req('/api/auth/login', { method: 'POST', body: JSON.stringify({ email: 'jesus@permish.app', password: 'childofgod' }) });
    expect(login.status).toBe(200);
    const stats = await superJar.req('/api/admin/stats');
    expect(stats.status).toBe(200);
    const { stats: s } = await stats.json();
    expect(s.userCount).toBeGreaterThan(0);
    expect(s).toHaveProperty('submissionCount');
  });

  it('deletes a user who owns an event, reassigning the event to the deleting admin', async () => {
    const planner = await registerPlanner('deleteme@test.app');
    const me = await (await planner.req('/api/auth/me')).json();
    const created = await planner.req('/api/events', {
      method: 'POST',
      body: JSON.stringify({
        event_name: 'Orphan Event', event_dates: '1 May 2026', event_description: 'x',
        ward: 'W', stake: 'S', leader_name: 'L', leader_phone: '801-555-0000', leader_email: 'l@test.app',
      }),
    });
    const { event } = await created.json();

    const superJar = await loginSuper();
    const superMe = await (await superJar.req('/api/auth/me')).json();

    const del = await superJar.req(`/api/admin/users/${me.user.id}`, { method: 'DELETE' });
    expect(del.status).toBe(200);
    expect((await del.json()).reassignedEvents).toBe(1);

    // The user is gone but their event survives, now owned by the admin.
    expect((await superJar.req(`/api/admin/users/${me.user.id}`)).status).toBe(404);
    const eventRes = await superJar.req(`/api/events/${event.id}`);
    expect(eventRes.status).toBe(200);
    expect((await eventRes.json()).event.created_by).toBe(superMe.user.id);
  });
});

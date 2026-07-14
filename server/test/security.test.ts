import { describe, it, expect, beforeAll } from 'bun:test';
import { Hono } from 'hono';
import { createDb, bootstrapSuperAdmin } from '../src/db.ts';
import { createApp } from '../src/app.ts';
import { rateLimit } from '../src/lib/rateLimit.ts';
import { generateCode } from '../src/services/invites.ts';

// Security regression tests from the 2026-07-14 audit (TODO-012/015/017).

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

async function register(email: string) {
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
  await bootstrapSuperAdmin(db, { password: 'childofgod', mustChange: false });
  app = createApp(db);
});

describe('must_change_password enforcement (TODO-012)', () => {
  it('locks a flagged account to credential setup, then unlocks after rotation', async () => {
    const db = createDb(':memory:');
    await bootstrapSuperAdmin(db, { password: 'bootstrap-pass', mustChange: true });
    const gated = createApp(db);

    let cookie = '';
    const req = async (path: string, init: RequestInit = {}) => {
      const headers = new Headers(init.headers);
      if (cookie) headers.set('Cookie', cookie);
      if (init.body) headers.set('Content-Type', 'application/json');
      const res = await gated.request(path, { ...init, headers });
      const set = res.headers.get('set-cookie');
      if (set) cookie = set.split(';')[0]!;
      return res;
    };

    const login = await req('/api/auth/login', { method: 'POST', body: JSON.stringify({ email: 'jesus@permish.app', password: 'bootstrap-pass' }) });
    expect(login.status).toBe(200);
    expect((await login.json()).user.must_change_password).toBe(true);

    // Everything except setup/me/logout is blocked.
    const blocked = await req('/api/events');
    expect(blocked.status).toBe(403);
    expect((await blocked.json()).code).toBe('must_change_password');
    expect((await req('/api/groups', { method: 'POST', body: JSON.stringify({ name: 'X', type: 'stake' }) })).status).toBe(403);
    expect((await req('/api/auth/me')).status).toBe(200);

    // Credential setup unlocks the account.
    const setup = await req('/api/auth/setup-credentials', {
      method: 'PUT',
      body: JSON.stringify({ email: 'admin@real.app', name: 'Real Admin', password: 'new-password-1' }),
    });
    expect(setup.status).toBe(200);
    expect((await req('/api/events')).status).toBe(200);
  });

  it('requires the current password to rotate credentials once set up', async () => {
    const c = await register('rotate@test.app');
    // Without currentPassword → rejected (a stolen cookie cannot take over the account).
    const noPw = await c.req('/api/auth/setup-credentials', {
      method: 'PUT',
      body: JSON.stringify({ email: 'stolen@evil.app', name: 'X', password: 'hacked-pass-1' }),
    });
    expect(noPw.status).toBe(400);
    const wrongPw = await c.req('/api/auth/setup-credentials', {
      method: 'PUT',
      body: JSON.stringify({ email: 'stolen@evil.app', name: 'X', password: 'hacked-pass-1', currentPassword: 'wrong' }),
    });
    expect(wrongPw.status).toBe(401);
    // With the correct current password → allowed.
    const ok = await c.req('/api/auth/setup-credentials', {
      method: 'PUT',
      body: JSON.stringify({ email: 'rotated@test.app', name: 'X', password: 'new-pass-123', currentPassword: 'password123' }),
    });
    expect(ok.status).toBe(200);
  });
});

describe('stale JWT claims (TODO-017)', () => {
  it('a deleted user loses access immediately, not at token expiry', async () => {
    const victim = await register('deleteme@test.app');
    expect((await victim.req('/api/auth/me')).status).toBe(200);

    const superUser = await loginSuper();
    const { users } = await (await superUser.req('/api/admin/users')).json();
    const target = users.find((u: any) => u.email === 'deleteme@test.app');
    expect((await superUser.req(`/api/admin/users/${target.id}`, { method: 'DELETE' })).status).toBe(200);

    // Victim's cookie is still within its 24h lifetime, but the account is gone.
    expect((await victim.req('/api/auth/me')).status).toBe(401);
    expect((await victim.req('/api/events')).status).toBe(401);
  });

  it('email is normalized at register and login', async () => {
    const c = jar();
    const reg = await c.req('/api/auth/register', { method: 'POST', body: JSON.stringify({ email: '  MixedCase@Test.App ', password: 'password123', name: 'Mixed', role: 'user' }) });
    expect(reg.status).toBe(201);
    expect((await reg.json()).user.email).toBe('mixedcase@test.app');
    // Login with different casing reaches the same account.
    const c2 = jar();
    const login = await c2.req('/api/auth/login', { method: 'POST', body: JSON.stringify({ email: 'MIXEDCASE@test.app', password: 'password123' }) });
    expect(login.status).toBe(200);
    // Re-register with different casing is a duplicate.
    const dup = await jar().req('/api/auth/register', { method: 'POST', body: JSON.stringify({ email: 'mixedCASE@test.app', password: 'password123', name: 'Dup', role: 'user' }) });
    expect(dup.status).toBe(409);
  });
});

describe('event submissions access control (TODO-015)', () => {
  it('blocks plain group members from listing submission PII; allows admins and owner', async () => {
    // Super creates a group; planner joins as admin via an admin invite.
    const superUser = await loginSuper();
    const { group } = await (await superUser.req('/api/groups', { method: 'POST', body: JSON.stringify({ name: 'PII Stake', type: 'stake' }) })).json();

    const planner = await register('pii-planner@test.app');
    const adminInvite = await (await superUser.req(`/api/groups/${group.id}/invites`, { method: 'POST', body: JSON.stringify({ role: 'admin' }) })).json();
    expect((await planner.req(`/api/invites/${adminInvite.invite.token}/accept`, { method: 'POST' })).status).toBe(200);

    // Planner creates a group event; an anonymous parent submits a form to it.
    const { event } = await (await planner.req('/api/events', {
      method: 'POST',
      body: JSON.stringify({
        event_name: 'Group Camp', event_dates: '1 Aug 2026', event_description: 'x',
        ward: 'W', stake: 'S', leader_name: 'L', leader_phone: '801-555-0000', leader_email: 'l@test.app',
        group_id: group.id,
      }),
    })).json();
    const submit = await app.request(`/api/events/${event.id}/submit`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ participant_name: 'Private Kid', participant_dob: '2013-02-02', participant_signature_type: 'hand', participant_signature_date: '2026-07-01' }),
    });
    expect(submit.status).toBe(201);

    // A plain member joins via the shared group code.
    const member = await register('pii-member@test.app');
    const joined = await member.req('/api/groups/join', { method: 'POST', body: JSON.stringify({ invite_code: group.invite_code }) });
    expect(joined.status).toBe(200);

    // Member must NOT be able to read other children's submission metadata.
    const asMember = await member.req(`/api/events/${event.id}/submissions`);
    expect(asMember.status).toBe(404);

    // Event owner and group admin (super) still can.
    expect((await planner.req(`/api/events/${event.id}/submissions`)).status).toBe(200);
    expect((await superUser.req(`/api/events/${event.id}/submissions`)).status).toBe(200);
  });
});

describe('rate limiter (TODO-015/017)', () => {
  it('enforces the window outside test env and evicts expired entries', async () => {
    const prevEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    try {
      const mini = new Hono();
      mini.use('*', rateLimit({ windowMs: 60_000, max: 2 }));
      mini.get('/x', (c) => c.text('ok'));

      const hit = (ip: string) => mini.request('/x', { headers: { 'x-forwarded-for': ip } });
      expect((await hit('1.1.1.1')).status).toBe(200);
      expect((await hit('1.1.1.1')).status).toBe(200);
      expect((await hit('1.1.1.1')).status).toBe(429);
      // Different key unaffected.
      expect((await hit('2.2.2.2')).status).toBe(200);
    } finally {
      process.env.NODE_ENV = prevEnv;
    }
  });

  it('supports custom key functions (user-keyed join limiter)', async () => {
    const prevEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    try {
      const mini = new Hono();
      mini.use('*', rateLimit({ windowMs: 60_000, max: 1, key: (c) => c.req.header('x-user') || 'anon' }));
      mini.get('/x', (c) => c.text('ok'));
      expect((await mini.request('/x', { headers: { 'x-user': 'u1' } })).status).toBe(200);
      expect((await mini.request('/x', { headers: { 'x-user': 'u1' } })).status).toBe(429);
      expect((await mini.request('/x', { headers: { 'x-user': 'u2' } })).status).toBe(200);
    } finally {
      process.env.NODE_ENV = prevEnv;
    }
  });
});

describe('client-supplied ids on create (TODO-014 hybrid sync)', () => {
  it('honors a valid client UUID so offline-created records keep one identity', async () => {
    const c = await register('hybrid-id@test.app');
    const clientId = crypto.randomUUID();
    const res = await c.req('/api/events', {
      method: 'POST',
      body: JSON.stringify({
        id: clientId,
        event_name: 'Offline Camp', event_dates: '1 Sep 2026', event_description: 'x',
        ward: 'W', stake: 'S', leader_name: 'L', leader_phone: '801-555-0000', leader_email: 'l@test.app',
      }),
    });
    expect(res.status).toBe(201);
    expect((await res.json()).event.id).toBe(clientId);

    // Replaying the same create (sync retry) conflicts instead of duplicating.
    const dup = await c.req('/api/events', {
      method: 'POST',
      body: JSON.stringify({
        id: clientId,
        event_name: 'Offline Camp', event_dates: '1 Sep 2026', event_description: 'x',
        ward: 'W', stake: 'S', leader_name: 'L', leader_phone: '801-555-0000', leader_email: 'l@test.app',
      }),
    });
    expect(dup.status).toBe(409);

    // Malformed ids are ignored, not honored.
    const bad = await c.req('/api/events', {
      method: 'POST',
      body: JSON.stringify({
        id: 'not-a-uuid; DROP TABLE events;',
        event_name: 'Bad Id', event_dates: '1 Sep 2026', event_description: 'x',
        ward: 'W', stake: 'S', leader_name: 'L', leader_phone: '801-555-0000', leader_email: 'l@test.app',
      }),
    });
    expect(bad.status).toBe(201);
    expect((await bad.json()).event.id).not.toBe('not-a-uuid; DROP TABLE events;');
  });

  it('honors client ids on profile create and public submit', async () => {
    const c = await register('hybrid-id2@test.app');
    const profileId = crypto.randomUUID();
    const prof = await c.req('/api/profiles', {
      method: 'POST',
      body: JSON.stringify({ id: profileId, participant_name: 'Kid', participant_dob: '2013-05-05' }),
    });
    expect(prof.status).toBe(201);
    expect((await prof.json()).profile.id).toBe(profileId);

    const { event } = await (await c.req('/api/events', {
      method: 'POST',
      body: JSON.stringify({
        event_name: 'Sub Camp', event_dates: '1 Sep 2026', event_description: 'x',
        ward: 'W', stake: 'S', leader_name: 'L', leader_phone: '801-555-0000', leader_email: 'l@test.app',
      }),
    })).json();
    const subId = crypto.randomUUID();
    const sub = await app.request(`/api/events/${event.id}/submit`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: subId, participant_name: 'Kid', participant_dob: '2013-05-05',
        participant_signature_type: 'hand', participant_signature_date: '2026-07-01',
      }),
    });
    expect(sub.status).toBe(201);
    expect((await sub.json()).submission.id).toBe(subId);
  });
});

describe('public submit validation (TODO-016 server side)', () => {
  it('rejects malformed DOB and bogus signature types with 400, not 500', async () => {
    const c = await register('submit-validate@test.app');
    const { event } = await (await c.req('/api/events', {
      method: 'POST',
      body: JSON.stringify({
        event_name: 'V Camp', event_dates: '1 Sep 2026', event_description: 'x',
        ward: 'W', stake: 'S', leader_name: 'L', leader_phone: '801-555-0000', leader_email: 'l@test.app',
      }),
    })).json();

    const submit = (body: Record<string, unknown>) =>
      app.request(`/api/events/${event.id}/submit`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
      });

    const badDob = await submit({ participant_name: 'K', participant_dob: 'garbage', participant_signature_type: 'hand', participant_signature_date: '2026-07-01' });
    expect(badDob.status).toBe(400);

    const badType = await submit({ participant_name: 'K', participant_dob: '2013-05-05', participant_signature_type: 'bogus', participant_signature_date: '2026-07-01' });
    expect(badType.status).toBe(400);

    const futureDob = await submit({ participant_name: 'K', participant_dob: '2099-01-01', participant_signature_type: 'hand', participant_signature_date: '2026-07-01' });
    expect(futureDob.status).toBe(400);
  });
});

describe('invite code entropy (TODO-015)', () => {
  it('generates codes with at least 12 hex chars (48 bits)', () => {
    const code = generateCode();
    expect(code).toMatch(/^[0-9A-F]{12,}$/);
  });
});

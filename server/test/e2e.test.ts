import { describe, it, expect, beforeAll } from 'bun:test';
import { createDb, bootstrapSuperAdmin } from '../src/db.ts';
import { createApp } from '../src/app.ts';

// Exercises the Bun + Hono server in-process against an in-memory SQLite DB.
// Proves the Phase 0 model: auth via JWT cookie + full events CRUD, matching
// the contract the frontend Express adapter expects.

let app: ReturnType<typeof createApp>;

/** Minimal cookie jar: threads the Set-Cookie from one response into the next request. */
function jar() {
  let cookie = '';
  return {
    async req(path: string, init: RequestInit = {}) {
      const headers = new Headers(init.headers);
      if (cookie) headers.set('Cookie', cookie);
      if (init.body) headers.set('Content-Type', 'application/json');
      const res = await app.request(path, { ...init, headers });
      const set = res.headers.get('set-cookie');
      if (set) cookie = set.split(';')[0]!;
      return res;
    },
  };
}

beforeAll(async () => {
  const db = createDb(':memory:');
  await bootstrapSuperAdmin(db);
  app = createApp(db);
});

describe('Phase 0 Bun+Hono server', () => {
  it('serves health', async () => {
    const res = await app.request('/health');
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true, mode: 'bun+hono+sqlite' });
  });

  it('rejects unauthenticated event access with 401', async () => {
    const res = await app.request('/api/events');
    expect(res.status).toBe(401);
  });

  it('registers, authenticates, and runs full events CRUD via the cookie', async () => {
    const c = jar();

    const reg = await c.req('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify({ email: 'planner@test.app', password: 'password123', name: 'Test Planner', role: 'user' }),
    });
    expect(reg.status).toBe(201);
    expect((await reg.json()).user).toMatchObject({ email: 'planner@test.app', role: 'user' });

    const me = await c.req('/api/auth/me');
    expect(me.status).toBe(200);
    expect((await me.json()).user.email).toBe('planner@test.app');

    const created = await c.req('/api/events', {
      method: 'POST',
      body: JSON.stringify({
        event_name: 'Youth Camp',
        event_dates: '20-22 March 2026',
        event_description: 'Annual camp',
        ward: 'Maple Ward',
        stake: 'Provo Stake',
        leader_name: 'Bro Smith',
        leader_phone: '801-555-1234',
        leader_email: 'smith@test.app',
        organizations: ['deacons', 'teachers'],
      }),
    });
    expect(created.status).toBe(201);
    const { event, formUrl } = await created.json();
    expect(event.event_name).toBe('Youth Camp');
    expect(event.organizations).toBe('["deacons","teachers"]');
    expect(formUrl).toContain(`/form/${event.id}`);

    const list = await c.req('/api/events');
    const { events } = await list.json();
    expect(events).toHaveLength(1);
    expect(events[0].submission_count).toBe(0);

    const byId = await c.req(`/api/events/${event.id}`);
    expect((await byId.json()).event.id).toBe(event.id);

    const updated = await c.req(`/api/events/${event.id}`, {
      method: 'PUT',
      body: JSON.stringify({ event_name: 'Youth Camp (Updated)' }),
    });
    expect((await updated.json()).event.event_name).toBe('Youth Camp (Updated)');

    const del = await c.req(`/api/events/${event.id}`, { method: 'DELETE' });
    expect(del.status).toBe(200);
    // Deactivated: no longer in the default (active-only) list.
    const afterDelete = await c.req('/api/events');
    expect((await afterDelete.json()).events).toHaveLength(0);
    // ...but visible with all=1.
    const all = await c.req('/api/events?all=1');
    expect((await all.json()).events).toHaveLength(1);
  });

  it('rejects login with a bad password', async () => {
    const res = await app.request('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'planner@test.app', password: 'wrong' }),
    });
    expect(res.status).toBe(401);
  });
});

import { describe, it, expect, beforeAll } from 'bun:test';
import { createDb, bootstrapSuperAdmin, type DB } from '../src/db.ts';
import { createApp } from '../src/app.ts';

// Wave-4 hardening regressions from the 2026-07-14 audit (TODO-019):
// global JSON error contract, security headers, attachment content checks,
// and admin password-reset auditing.

let db: DB;
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

beforeAll(async () => {
  db = createDb(':memory:');
  await bootstrapSuperAdmin(db, { password: 'childofgod', mustChange: false });
  app = createApp(db);
});

describe('JSON error contract', () => {
  it('returns {error} JSON for unknown routes', async () => {
    const res = await app.request('/api/definitely-not-a-route');
    expect(res.status).toBe(404);
    expect(res.headers.get('content-type')).toContain('application/json');
    expect(await res.json()).toEqual({ error: 'Not found' });
  });

  it('returns {error} JSON when a route throws', async () => {
    const boomDb = createDb(':memory:');
    await bootstrapSuperAdmin(boomDb, { password: 'childofgod', mustChange: false });
    const boomApp = createApp(boomDb);
    boomApp.get('/boom', () => {
      throw new Error('kaboom');
    });

    const res = await boomApp.request('/boom');
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: 'Internal server error' });
  });
});

describe('security headers', () => {
  it('sets nosniff/frame/referrer headers on responses', async () => {
    const res = await app.request('/health');
    expect(res.headers.get('x-content-type-options')).toBe('nosniff');
    expect(res.headers.get('x-frame-options')).toBe('DENY');
    expect(res.headers.get('referrer-policy')).toBe('no-referrer');
  });

  it('sets them on error responses too', async () => {
    const res = await app.request('/api/definitely-not-a-route');
    expect(res.headers.get('x-content-type-options')).toBe('nosniff');
  });
});

describe('attachment upload hardening', () => {
  async function makeEvent() {
    const c = jar();
    await c.req('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify({ email: `planner-${crypto.randomUUID()}@t.app`, password: 'password123', name: 'P', role: 'user' }),
    });
    const created = await c.req('/api/events', {
      method: 'POST',
      body: JSON.stringify({
        event_name: 'Camp', event_dates: '1 Aug 2026', event_description: 'x',
        ward: 'W', stake: 'S', leader_name: 'L', leader_phone: '555', leader_email: 'l@t.app',
      }),
    });
    const { event } = await created.json();
    return { c, eventId: event.id as string };
  }

  it('rejects a file whose bytes do not match its claimed type', async () => {
    const { c, eventId } = await makeEvent();
    const form = new FormData();
    form.append('file', new File(['hello, not a pdf'], 'evil.pdf', { type: 'application/pdf' }));

    const res = await c.req(`/api/events/${eventId}/attachments`, { method: 'POST', body: form });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('File content does not match its type');
  });

  it('accepts a file with matching magic bytes (and deletes it)', async () => {
    const { c, eventId } = await makeEvent();
    const form = new FormData();
    form.append('file', new File(['%PDF-1.4\n%fake minimal pdf'], 'ok.pdf', { type: 'application/pdf' }));

    const res = await c.req(`/api/events/${eventId}/attachments`, { method: 'POST', body: form });
    expect(res.status).toBe(201);
    const { attachment } = await res.json();
    expect(attachment.original_name).toBe('ok.pdf');

    // Delete via the API so test runs don't accumulate files in uploads/.
    const del = await c.req(`/api/events/${eventId}/attachments/${attachment.id}`, { method: 'DELETE' });
    expect(del.status).toBe(200);
  });

  it('rejects an oversized request before parsing the body', async () => {
    const { c, eventId } = await makeEvent();
    const res = await c.req(`/api/events/${eventId}/attachments`, {
      method: 'POST',
      headers: { 'content-length': String(50 * 1024 * 1024) },
    });
    expect(res.status).toBe(413);
    expect((await res.json()).error).toBe('File too large');
  });

  it('rejects a text file smuggling binary content', async () => {
    const { c, eventId } = await makeEvent();
    const form = new FormData();
    form.append('file', new File([new Uint8Array([0x4d, 0x5a, 0x00, 0x01])], 'notes.txt', { type: 'text/plain' }));

    const res = await c.req(`/api/events/${eventId}/attachments`, { method: 'POST', body: form });
    expect(res.status).toBe(400);
  });
});

describe('admin password reset auditing', () => {
  it('writes an audit row when a super resets a password', async () => {
    const u = jar();
    const reg = await u.req('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify({ email: 'reset-target@t.app', password: 'password123', name: 'Target', role: 'user' }),
    });
    const targetId = (await reg.json()).user.id as string;

    const admin = jar();
    await admin.req('/api/auth/login', { method: 'POST', body: JSON.stringify({ email: 'jesus@permish.app', password: 'childofgod' }) });
    const res = await admin.req(`/api/admin/users/${targetId}/password`, {
      method: 'PUT',
      body: JSON.stringify({ newPassword: 'brand-new-pass' }),
    });
    expect(res.status).toBe(200);

    const row = db
      .query<{ action: string; target_id: string }, [string]>(
        "SELECT action, target_id FROM audit_log WHERE action = 'user.password_reset' AND target_id = ?"
      )
      .get(targetId);
    expect(row).toBeTruthy();
    expect(row!.target_id).toBe(targetId);
  });
});

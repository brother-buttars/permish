import { Hono } from 'hono';
import { mkdirSync, existsSync, unlinkSync } from 'node:fs';
import { extname, resolve } from 'node:path';
import type { DB } from '../db.ts';
import { type AppEnv, requireAuth, currentUser } from '../lib/auth.ts';
import { sanitizeString, validateEmail, validatePhone } from '../lib/validate.ts';
import { collectGroupAndDescendantIds } from '../services/audit.ts';
import { config } from '../config.ts';

type Row = Record<string, any>;

const ALLOWED_ATTACHMENT_TYPES = new Set([
  'application/pdf',
  'image/jpeg', 'image/png', 'image/gif', 'image/webp',
  'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'text/plain',
]);
const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024;

export function createEventRoutes(db: DB) {
  const app = new Hono<AppEnv>();
  app.use('*', requireAuth);

  // Events visible to the current user via their group memberships (walk UP to ancestors).
  app.get('/for-me', (c) => {
    const { id: userId } = currentUser(c);
    const rootIds = db
      .query<{ group_id: string }, [string]>('SELECT group_id FROM group_members WHERE user_id = ?')
      .all(userId)
      .map((r) => r.group_id);
    if (rootIds.length === 0) return c.json({ events: [] });

    const seen = new Set(rootIds);
    for (const id of rootIds) {
      let cursor: string | null = id;
      while (cursor) {
        const row = db.query<{ parent_id: string | null }, [string]>('SELECT parent_id FROM groups WHERE id = ?').get(cursor);
        if (!row || !row.parent_id || seen.has(row.parent_id)) break;
        seen.add(row.parent_id);
        cursor = row.parent_id;
      }
    }
    const groupIds = [...seen];
    const placeholders = groupIds.map(() => '?').join(',');
    const events = db
      .query(
        `SELECT e.*, g.name as group_name,
          (SELECT COUNT(*) FROM submissions s WHERE s.event_id = e.id) as submission_count
         FROM events e
         LEFT JOIN groups g ON g.id = e.group_id
         WHERE e.group_id IN (${placeholders})
         ORDER BY e.event_start ASC, e.created_at DESC`
      )
      .all(...groupIds);
    return c.json({ events });
  });

  app.post('/', async (c) => {
    const me = currentUser(c);
    const b = await c.req.json().catch(() => ({}));
    const {
      event_name, event_dates, event_start, event_end, event_description, ward, stake,
      leader_name, leader_phone, leader_email, notify_email, notify_phone, notify_carrier,
      organizations, additional_details, group_id,
    } = b;

    if (!event_name || !event_dates || !event_description || !ward || !stake || !leader_name || !leader_phone || !leader_email) {
      return c.json({ error: 'All event detail fields are required' }, 400);
    }
    if (!validateEmail(leader_email)) return c.json({ error: 'Invalid leader email address' }, 400);
    if (notify_email && !validateEmail(notify_email)) return c.json({ error: 'Invalid notification email address' }, 400);
    if (notify_phone && !validatePhone(notify_phone)) return c.json({ error: 'Invalid notification phone number' }, 400);

    if (group_id) {
      const group = db.query<{ id: string }, [string]>('SELECT id FROM groups WHERE id = ?').get(group_id);
      if (!group) return c.json({ error: 'Group not found' }, 400);
      const membership = db
        .query<{ role: string }, [string, string]>('SELECT role FROM group_members WHERE group_id = ? AND user_id = ?')
        .get(group_id, me.id);
      if (!membership && me.role !== 'super') {
        return c.json({ error: 'Must be a member of the group to create events for it' }, 403);
      }
    }

    const id = crypto.randomUUID();
    db.query(
      `INSERT INTO events (id, created_by, event_name, event_dates, event_start, event_end, event_description, ward, stake, leader_name, leader_phone, leader_email, notify_email, notify_phone, notify_carrier, organizations, additional_details, group_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      id, me.id,
      sanitizeString(event_name) as string,
      sanitizeString(event_dates) as string,
      event_start || null, event_end || null,
      sanitizeString(event_description, 1000) as string,
      sanitizeString(ward) as string,
      sanitizeString(stake) as string,
      sanitizeString(leader_name) as string,
      sanitizeString(leader_phone) as string,
      sanitizeString(leader_email) as string,
      notify_email || null, notify_phone || null, notify_carrier || null,
      JSON.stringify(organizations || []),
      additional_details ? (sanitizeString(additional_details, 5000) as string) : null,
      group_id || null
    );

    const event = db.query('SELECT * FROM events WHERE id = ?').get(id);
    return c.json({ event, formUrl: `${config.frontendUrl}/form/${id}` }, 201);
  });

  app.get('/', (c) => {
    const me = currentUser(c);
    const showAll = c.req.query('all') === '1';
    const activeFilter = showAll ? '' : 'AND e.is_active = 1';

    let events: Row[];
    if (me.role === 'super') {
      events = db
        .query(
          `SELECT DISTINCT e.*, COALESCE(sc.count, 0) AS submission_count
           FROM events e
           LEFT JOIN (SELECT event_id, COUNT(*) AS count FROM submissions GROUP BY event_id) sc ON sc.event_id = e.id
           WHERE 1=1 ${activeFilter}
           ORDER BY e.created_at DESC`
        )
        .all() as Row[];
    } else {
      events = db
        .query(
          `SELECT DISTINCT e.*, COALESCE(sc.count, 0) AS submission_count
           FROM events e
           LEFT JOIN (SELECT event_id, COUNT(*) AS count FROM submissions GROUP BY event_id) sc ON sc.event_id = e.id
           WHERE (e.created_by = ? OR e.group_id IN (SELECT group_id FROM group_members WHERE user_id = ?))
             ${activeFilter}
           ORDER BY e.created_at DESC`
        )
        .all(me.id, me.id) as Row[];
    }

    const now = new Date();
    const eventsWithPast = events.map((event) => {
      const endStr = (event.event_end || event.event_start) as string | null;
      const is_past = endStr ? new Date(endStr) < now : false;
      if (event.group_id) {
        event.group = db.query('SELECT id, name, type FROM groups WHERE id = ?').get(event.group_id as string);
      }
      return { ...event, is_past };
    });
    return c.json({ events: eventsWithPast });
  });

  // All submissions the caller may manage, optionally scoped by group (with its
  // descendants) or a single activity — powers the folded Submissions page for
  // super users (the group filter that used to live on /admin/submissions).
  app.get('/all-submissions', (c) => {
    const me = currentUser(c);
    const where: string[] = [];
    const params: any[] = [];

    if (me.role !== 'super') {
      where.push('e.created_by = ?');
      params.push(me.id);
    }

    const groupId = c.req.query('groupId');
    if (groupId) {
      const exists = db.query('SELECT id FROM groups WHERE id = ?').get(groupId);
      if (!exists) return c.json({ submissions: [] });
      const scope = collectGroupAndDescendantIds(db, groupId);
      where.push(`e.group_id IN (${scope.map(() => '?').join(',')})`);
      params.push(...scope);
    }
    const activityId = c.req.query('activityId');
    if (activityId) {
      where.push('s.event_id = ?');
      params.push(activityId);
    }

    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const submissions = db
      .query(
        `SELECT s.id, s.participant_name, s.participant_dob, s.participant_age,
           s.emergency_contact, s.emergency_phone_primary, s.submitted_at, s.pdf_path,
           s.event_id, e.event_name, e.event_dates, e.organizations, e.group_id, g.name AS group_name
         FROM submissions s
         JOIN events e ON s.event_id = e.id
         LEFT JOIN groups g ON g.id = e.group_id
         ${whereSql}
         ORDER BY s.submitted_at DESC`
      )
      .all(...params);
    return c.json({ submissions });
  });

  // Resolve an event the current user may access (owner, super, or group member).
  function accessibleEvent(c: Parameters<typeof currentUser>[0], eventId: string, adminOnly = false): Row | null {
    const me = currentUser(c);
    if (me.role === 'super') return db.query('SELECT * FROM events WHERE id = ?').get(eventId) as Row | null;
    let event = db.query('SELECT * FROM events WHERE id = ? AND created_by = ?').get(eventId, me.id) as Row | null;
    if (!event) {
      const roleClause = adminOnly ? "AND gm.role = 'admin'" : '';
      event = db
        .query(
          `SELECT e.* FROM events e JOIN group_members gm ON gm.group_id = e.group_id
           WHERE e.id = ? AND gm.user_id = ? ${roleClause}`
        )
        .get(eventId, me.id) as Row | null;
    }
    return event;
  }

  app.get('/:id', (c) => {
    const event = accessibleEvent(c, c.req.param('id'));
    if (!event) return c.json({ error: 'Event not found' }, 404);
    if (event.group_id) {
      event.group = db.query('SELECT id, name, type FROM groups WHERE id = ?').get(event.group_id as string);
    }
    return c.json({ event });
  });

  app.put('/:id', async (c) => {
    const id = c.req.param('id');
    const event = accessibleEvent(c, id, true);
    if (!event) return c.json({ error: 'Event not found' }, 404);

    const b = await c.req.json().catch(() => ({}));
    const {
      event_name, event_dates, event_start, event_end, event_description, ward, stake,
      leader_name, leader_phone, leader_email, notify_email, notify_phone, notify_carrier,
      is_active, organizations, additional_details,
    } = b;
    const val = <T>(field: T | undefined, fallback: T): T => (field !== undefined ? field : fallback);

    if (leader_email !== undefined && leader_email && !validateEmail(leader_email)) return c.json({ error: 'Invalid leader email address' }, 400);
    if (notify_email !== undefined && notify_email && !validateEmail(notify_email)) return c.json({ error: 'Invalid notification email address' }, 400);
    if (notify_phone !== undefined && notify_phone && !validatePhone(notify_phone)) return c.json({ error: 'Invalid notification phone number' }, 400);

    db.query(
      `UPDATE events SET event_name = ?, event_dates = ?, event_start = ?, event_end = ?, event_description = ?, ward = ?, stake = ?, leader_name = ?, leader_phone = ?, leader_email = ?, notify_email = ?, notify_phone = ?, notify_carrier = ?, is_active = ?, organizations = ?, additional_details = ? WHERE id = ?`
    ).run(
      sanitizeString(val(event_name, event.event_name)) as string,
      sanitizeString(val(event_dates, event.event_dates)) as string,
      event_start !== undefined ? event_start || null : (event.event_start as string | null),
      event_end !== undefined ? event_end || null : (event.event_end as string | null),
      sanitizeString(val(event_description, event.event_description), 1000) as string,
      sanitizeString(val(ward, event.ward)) as string,
      sanitizeString(val(stake, event.stake)) as string,
      sanitizeString(val(leader_name, event.leader_name)) as string,
      sanitizeString(val(leader_phone, event.leader_phone)) as string,
      sanitizeString(val(leader_email, event.leader_email)) as string,
      notify_email !== undefined ? notify_email || null : (event.notify_email as string | null),
      notify_phone !== undefined ? notify_phone || null : (event.notify_phone as string | null),
      notify_carrier !== undefined ? notify_carrier || null : (event.notify_carrier as string | null),
      is_active !== undefined ? (is_active ? 1 : 0) : (event.is_active as number),
      JSON.stringify(organizations || (event.organizations ? JSON.parse(event.organizations as string) : [])),
      additional_details !== undefined ? (additional_details ? (sanitizeString(additional_details, 5000) as string) : null) : (event.additional_details as string | null),
      id
    );
    const updated = db.query('SELECT * FROM events WHERE id = ?').get(id);
    return c.json({ event: updated });
  });

  app.delete('/:id', (c) => {
    const id = c.req.param('id');
    const event = accessibleEvent(c, id, true);
    if (!event) return c.json({ error: 'Event not found' }, 404);
    db.query('UPDATE events SET is_active = 0 WHERE id = ?').run(id);
    return c.json({ message: 'Event deactivated' });
  });

  app.get('/:id/submissions', (c) => {
    const event = accessibleEvent(c, c.req.param('id'));
    if (!event) return c.json({ error: 'Event not found' }, 404);
    const submissions = db
      .query(
        'SELECT id, participant_name, participant_dob, participant_age, emergency_contact, emergency_phone_primary, submitted_at, pdf_path FROM submissions WHERE event_id = ? ORDER BY submitted_at DESC'
      )
      .all(c.req.param('id'));
    return c.json({ submissions });
  });

  // --- Attachments (planner-owned; public read/serve lives in the form routes) ---

  app.post('/:id/attachments', async (c) => {
    const me = currentUser(c);
    const eventId = c.req.param('id');
    const event = db.query('SELECT id FROM events WHERE id = ? AND created_by = ?').get(eventId, me.id);
    if (!event) return c.json({ error: 'Event not found' }, 404);

    const existing = db.query<{ count: number }, [string]>('SELECT COUNT(*) as count FROM event_attachments WHERE event_id = ?').get(eventId)!;
    if (existing.count >= 10) return c.json({ error: 'Maximum 10 attachments per event' }, 400);

    const body = await c.req.parseBody();
    const file = body['file'];
    if (!(file instanceof File)) return c.json({ error: 'No file uploaded' }, 400);
    if (!ALLOWED_ATTACHMENT_TYPES.has(file.type)) return c.json({ error: 'File type not allowed' }, 400);
    if (file.size > MAX_ATTACHMENT_BYTES) return c.json({ error: 'File too large' }, 400);

    mkdirSync(config.uploadsDir, { recursive: true });
    const filename = `${crypto.randomUUID()}${extname(file.name)}`;
    await Bun.write(resolve(config.uploadsDir, filename), file);

    const id = crypto.randomUUID();
    const maxOrder = db.query<{ max_order: number | null }, [string]>('SELECT MAX(display_order) as max_order FROM event_attachments WHERE event_id = ?').get(eventId)!;
    const order = (maxOrder?.max_order ?? -1) + 1;
    db.query('INSERT INTO event_attachments (id, event_id, filename, original_name, mime_type, size, display_order) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .run(id, eventId, filename, file.name, file.type, file.size, order);
    const attachment = db.query('SELECT * FROM event_attachments WHERE id = ?').get(id);
    return c.json({ attachment }, 201);
  });

  app.delete('/:id/attachments/:attachmentId', (c) => {
    const me = currentUser(c);
    const eventId = c.req.param('id');
    const event = db.query('SELECT id FROM events WHERE id = ? AND created_by = ?').get(eventId, me.id);
    if (!event) return c.json({ error: 'Event not found' }, 404);
    const attachment = db.query('SELECT * FROM event_attachments WHERE id = ? AND event_id = ?').get(c.req.param('attachmentId'), eventId) as Row | null;
    if (!attachment) return c.json({ error: 'Attachment not found' }, 404);

    const filePath = resolve(config.uploadsDir, attachment.filename);
    if (existsSync(filePath)) {
      try { unlinkSync(filePath); } catch { /* already gone */ }
    }
    db.query('DELETE FROM event_attachments WHERE id = ?').run(c.req.param('attachmentId'));
    return c.json({ message: 'Attachment deleted' });
  });

  return app;
}

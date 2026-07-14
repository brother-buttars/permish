import { Hono } from 'hono';
import bcrypt from 'bcryptjs';
import type { DB } from '../db.ts';
import { type AppEnv, requireAuth, currentUser } from '../lib/auth.ts';
import { sanitizeString, validateEmail } from '../lib/validate.ts';
import * as audit from '../services/audit.ts';

type Row = Record<string, any>;
const EMPTY_STATS = { userCount: 0, eventCount: 0, activeEventCount: 0, submissionCount: 0, profileCount: 0 };

function resolveGroupScope(db: DB, groupId?: string): string[] | null {
  if (!groupId) return null;
  const exists = db.query('SELECT id FROM groups WHERE id = ?').get(groupId);
  if (!exists) return [];
  return audit.collectGroupAndDescendantIds(db, groupId);
}
const ph = (arr: any[]) => arr.map(() => '?').join(',');

/** All admin routes require super. */
export function createAdminRoutes(db: DB) {
  const app = new Hono<AppEnv>();
  app.use('*', requireAuth);
  app.use('*', async (c, next) => {
    if (currentUser(c).role !== 'super') return c.json({ error: 'Admin access required' }, 403);
    return next();
  });

  app.get('/users', (c) => {
    const groupId = c.req.query('groupId');
    const activityId = c.req.query('activityId');
    const scope = resolveGroupScope(db, groupId);
    if (scope && scope.length === 0) return c.json({ users: [] });

    let activity: Row | null = null;
    if (activityId) {
      activity = db.query('SELECT id, group_id FROM events WHERE id = ?').get(activityId) as Row | null;
      if (!activity) return c.json({ users: [] });
    }

    let sql = 'SELECT DISTINCT u.id, u.email, u.name, u.role, u.phone, u.city, u.state_province, u.created_at FROM users u';
    const joinParams: any[] = [];
    const whereParams: any[] = [];
    const where: string[] = [];
    if (scope) {
      sql += ' INNER JOIN group_members gm ON gm.user_id = u.id';
      where.push(`gm.group_id IN (${ph(scope)})`);
      whereParams.push(...scope);
    }
    if (activity) {
      sql += ' LEFT JOIN submissions s ON s.submitted_by = u.id AND s.event_id = ?';
      sql += ' LEFT JOIN group_invites gi ON gi.accepted_by = u.id AND gi.group_id = ?';
      joinParams.push(activity.id, activity.group_id);
      where.push('(s.id IS NOT NULL OR gi.id IS NOT NULL)');
    }
    if (where.length) sql += ' WHERE ' + where.join(' AND ');
    sql += ' ORDER BY u.created_at DESC';
    const users = db.query(sql).all(...joinParams, ...whereParams);
    return c.json({ users });
  });

  app.get('/users/:id', (c) => {
    const user = db.query('SELECT id, email, name, role, phone, address, city, state_province, created_at FROM users WHERE id = ?').get(c.req.param('id'));
    if (!user) return c.json({ error: 'User not found' }, 404);
    return c.json({ user });
  });

  app.put('/users/:id/role', async (c) => {
    const me = currentUser(c);
    const { role } = await c.req.json().catch(() => ({}));
    if (!['super', 'user'].includes(role)) return c.json({ error: 'Invalid role' }, 400);
    const user = db.query<{ id: string; role: string }, [string]>('SELECT id, role FROM users WHERE id = ?').get(c.req.param('id'));
    if (!user) return c.json({ error: 'User not found' }, 404);
    if (user.role === 'super' && role !== 'super') {
      const n = db.query<{ count: number }, []>("SELECT COUNT(*) as count FROM users WHERE role = 'super'").get()!.count;
      if (n <= 1) return c.json({ error: 'Cannot remove the last super admin' }, 400);
    }
    db.query('UPDATE users SET role = ? WHERE id = ?').run(role, c.req.param('id'));
    const updated = db.query('SELECT id, email, name, role, created_at FROM users WHERE id = ?').get(c.req.param('id'));
    audit.record(db, { actorId: me.id, action: 'user.role_changed', targetType: 'user', targetId: c.req.param('id'), meta: { from: user.role, to: role } });
    return c.json({ user: updated });
  });

  app.post('/users', async (c) => {
    const me = currentUser(c);
    const { email, password, name, role, assignments } = await c.req.json().catch(() => ({}));
    if (!email || !password || !name || !role) return c.json({ error: 'Email, password, name, and role are required' }, 400);
    if (!validateEmail(email)) return c.json({ error: 'Invalid email address' }, 400);
    if (password.length < 8) return c.json({ error: 'Password must be at least 8 characters' }, 400);
    if (!['super', 'user'].includes(role)) return c.json({ error: 'Invalid role' }, 400);

    const validated: { groupId: string; role: string }[] = [];
    if (assignments !== undefined && assignments !== null) {
      if (!Array.isArray(assignments)) return c.json({ error: 'assignments must be an array' }, 400);
      const seen = new Set<string>();
      for (const a of assignments) {
        if (!a || typeof a.groupId !== 'string' || !['admin', 'member'].includes(a.role)) return c.json({ error: 'Each assignment needs a groupId and role of admin or member' }, 400);
        if (seen.has(a.groupId)) return c.json({ error: 'Duplicate group in assignments' }, 400);
        seen.add(a.groupId);
        if (!db.query('SELECT id FROM groups WHERE id = ?').get(a.groupId)) return c.json({ error: `Unknown group: ${a.groupId}` }, 400);
        validated.push({ groupId: a.groupId, role: a.role });
      }
    }

    if (db.query('SELECT id FROM users WHERE email = ?').get(email)) return c.json({ error: 'Email already registered' }, 409);
    const id = crypto.randomUUID();
    const password_hash = await bcrypt.hash(password, 10);
    db.transaction(() => {
      db.query('INSERT INTO users (id, email, password_hash, name, role) VALUES (?, ?, ?, ?, ?)').run(id, email, password_hash, sanitizeString(name) as string, role);
      for (const a of validated) db.query('INSERT INTO group_members (id, group_id, user_id, role) VALUES (?, ?, ?, ?)').run(crypto.randomUUID(), a.groupId, id, a.role);
    })();

    const user = db.query('SELECT id, email, name, role, created_at FROM users WHERE id = ?').get(id);
    audit.record(db, { actorId: me.id, action: 'user.created', targetType: 'user', targetId: id, meta: { email, role, assignments: validated } });
    return c.json({ user }, 201);
  });

  app.delete('/users/:id', (c) => {
    const me = currentUser(c);
    const id = c.req.param('id');
    const user = db.query<{ id: string; role: string }, [string]>('SELECT id, role FROM users WHERE id = ?').get(id);
    if (!user) return c.json({ error: 'User not found' }, 404);
    if (user.id === me.id) return c.json({ error: 'Cannot delete your own account' }, 400);
    if (user.role === 'super') {
      const n = db.query<{ count: number }, []>("SELECT COUNT(*) as count FROM users WHERE role = 'super'").get()!.count;
      if (n <= 1) return c.json({ error: 'Cannot delete the last super admin' }, 400);
    }

    // The user is referenced by rows whose FKs to users(id) don't cascade
    // (foreign_keys is ON), so a bare DELETE would fail. Reassign their events
    // to the deleting admin and clean up their own records, all atomically.
    const reassignedEvents = db.query<{ count: number }, [string]>('SELECT COUNT(*) as count FROM events WHERE created_by = ?').get(id)!.count;
    db.transaction(() => {
      db.query('UPDATE events SET created_by = ? WHERE created_by = ?').run(me.id, id);
      db.query('UPDATE submissions SET submitted_by = NULL WHERE submitted_by = ?').run(id);
      db.query('DELETE FROM child_profiles WHERE user_id = ?').run(id);
      db.query('DELETE FROM password_reset_tokens WHERE user_id = ?').run(id);
      db.query('DELETE FROM users WHERE id = ?').run(id);
    })();

    audit.record(db, { actorId: me.id, action: 'user.deleted', targetType: 'user', targetId: id, meta: { role: user.role, reassignedEvents } });
    return c.json({ message: 'User deleted', reassignedEvents });
  });

  app.put('/users/:id/password', async (c) => {
    const me = currentUser(c);
    const { newPassword } = await c.req.json().catch(() => ({}));
    if (!newPassword || newPassword.length < 8) return c.json({ error: 'Password must be at least 8 characters' }, 400);
    if (!db.query('SELECT id FROM users WHERE id = ?').get(c.req.param('id'))) return c.json({ error: 'User not found' }, 404);
    const password_hash = await bcrypt.hash(newPassword, 10);
    db.query('UPDATE users SET password_hash = ? WHERE id = ?').run(password_hash, c.req.param('id'));
    audit.record(db, { actorId: me.id, action: 'user.password_reset', targetType: 'user', targetId: c.req.param('id') });
    return c.json({ message: 'Password reset successfully' });
  });

  app.get('/stats', (c) => {
    const groupId = c.req.query('groupId');
    const activityId = c.req.query('activityId');
    const scope = resolveGroupScope(db, groupId);
    if (scope && scope.length === 0) return c.json({ stats: EMPTY_STATS });
    const count = (sql: string, ...p: any[]) => (db.query<{ count: number }, any[]>(sql).get(...p)?.count ?? 0);

    if (activityId) {
      const event = db.query('SELECT id, group_id, is_active FROM events WHERE id = ?').get(activityId) as Row | null;
      if (!event) return c.json({ stats: EMPTY_STATS });
      if (scope && !scope.includes(event.group_id)) return c.json({ stats: EMPTY_STATS });
      const submissionCount = count('SELECT COUNT(*) as count FROM submissions WHERE event_id = ?', activityId);
      const userCount = count(
        `SELECT COUNT(DISTINCT u.id) as count FROM users u
         LEFT JOIN submissions s ON s.submitted_by = u.id AND s.event_id = ?
         LEFT JOIN group_invites gi ON gi.accepted_by = u.id AND gi.group_id = ?
         WHERE s.id IS NOT NULL OR gi.id IS NOT NULL`,
        activityId, event.group_id
      );
      const profileCount = count(
        `SELECT COUNT(DISTINCT cp.id) as count FROM child_profiles cp INNER JOIN submissions s ON s.submitted_by = cp.user_id WHERE s.event_id = ?`,
        activityId
      );
      return c.json({ stats: { userCount, eventCount: 1, activeEventCount: event.is_active ? 1 : 0, submissionCount, profileCount } });
    }

    if (scope) {
      const p = ph(scope);
      return c.json({
        stats: {
          userCount: count(`SELECT COUNT(DISTINCT user_id) as count FROM group_members WHERE group_id IN (${p})`, ...scope),
          eventCount: count(`SELECT COUNT(*) as count FROM events WHERE group_id IN (${p})`, ...scope),
          activeEventCount: count(`SELECT COUNT(*) as count FROM events WHERE group_id IN (${p}) AND is_active = 1`, ...scope),
          submissionCount: count(`SELECT COUNT(*) as count FROM submissions s INNER JOIN events e ON e.id = s.event_id WHERE e.group_id IN (${p})`, ...scope),
          profileCount: count(`SELECT COUNT(DISTINCT cp.id) as count FROM child_profiles cp INNER JOIN group_members gm ON gm.user_id = cp.user_id WHERE gm.group_id IN (${p})`, ...scope),
        },
      });
    }

    return c.json({
      stats: {
        userCount: count('SELECT COUNT(*) as count FROM users'),
        eventCount: count('SELECT COUNT(*) as count FROM events'),
        activeEventCount: count('SELECT COUNT(*) as count FROM events WHERE is_active = 1'),
        submissionCount: count('SELECT COUNT(*) as count FROM submissions'),
        profileCount: count('SELECT COUNT(*) as count FROM child_profiles'),
      },
    });
  });

  app.get('/groups-tree', (c) => {
    const all = db.query('SELECT id, name, type, parent_id FROM groups').all() as Row[];
    const byParent = new Map<string | null, Row[]>();
    for (const g of all) {
      const key = g.parent_id || null;
      if (!byParent.has(key)) byParent.set(key, []);
      byParent.get(key)!.push(g);
    }
    for (const list of byParent.values()) list.sort((a, b) => String(a.name).localeCompare(String(b.name)));
    const out: Row[] = [];
    const walk = (parentId: string | null, depth: number) => {
      for (const g of byParent.get(parentId) || []) {
        out.push({ id: g.id, name: g.name, type: g.type, parent_id: g.parent_id, depth });
        walk(g.id, depth + 1);
      }
    };
    walk(null, 0);
    return c.json({ groups: out });
  });

  app.get('/activities', (c) => {
    const scope = resolveGroupScope(db, c.req.query('groupId'));
    if (scope && scope.length === 0) return c.json({ activities: [] });
    let sql = `SELECT e.id, e.event_name, e.event_dates, e.event_start, e.event_end, e.ward, e.stake, e.is_active, e.organizations, e.created_at, e.group_id, g.name as group_name,
               (SELECT COUNT(*) FROM submissions s WHERE s.event_id = e.id) as submission_count
               FROM events e LEFT JOIN groups g ON g.id = e.group_id`;
    const params: any[] = [];
    if (scope) {
      sql += ` WHERE e.group_id IN (${ph(scope)})`;
      params.push(...scope);
    }
    sql += ' ORDER BY e.created_at DESC';
    return c.json({ activities: db.query(sql).all(...params) });
  });

  app.get('/submissions', (c) => {
    const scope = resolveGroupScope(db, c.req.query('groupId'));
    const activityId = c.req.query('activityId');
    if (scope && scope.length === 0) return c.json({ submissions: [] });
    let sql = `SELECT s.id, s.event_id, s.participant_name, s.participant_age, s.submitted_at, s.submitted_by,
               e.event_name, e.event_dates, e.group_id, g.name as group_name, u.name as submitter_name, u.email as submitter_email
               FROM submissions s INNER JOIN events e ON e.id = s.event_id
               LEFT JOIN groups g ON g.id = e.group_id LEFT JOIN users u ON u.id = s.submitted_by`;
    const where: string[] = [];
    const params: any[] = [];
    if (scope) {
      where.push(`e.group_id IN (${ph(scope)})`);
      params.push(...scope);
    }
    if (activityId) {
      where.push('s.event_id = ?');
      params.push(activityId);
    }
    if (where.length) sql += ' WHERE ' + where.join(' AND ');
    sql += ' ORDER BY s.submitted_at DESC';
    return c.json({ submissions: db.query(sql).all(...params) });
  });

  app.get('/profiles', (c) => {
    const scope = resolveGroupScope(db, c.req.query('groupId'));
    const activityId = c.req.query('activityId');
    if (scope && scope.length === 0) return c.json({ profiles: [] });
    let sql = `SELECT DISTINCT cp.id, cp.user_id, cp.participant_name, cp.participant_dob, cp.youth_program, cp.updated_at,
               u.name as owner_name, u.email as owner_email
               FROM child_profiles cp INNER JOIN users u ON u.id = cp.user_id`;
    const joinParams: any[] = [];
    const whereParams: any[] = [];
    const where: string[] = [];
    if (activityId) {
      sql += ' INNER JOIN submissions s ON s.submitted_by = cp.user_id AND s.event_id = ?';
      joinParams.push(activityId);
    }
    if (scope) {
      sql += ' INNER JOIN group_members gm ON gm.user_id = cp.user_id';
      where.push(`gm.group_id IN (${ph(scope)})`);
      whereParams.push(...scope);
    }
    if (where.length) sql += ' WHERE ' + where.join(' AND ');
    sql += ' ORDER BY cp.updated_at DESC';
    return c.json({ profiles: db.query(sql).all(...joinParams, ...whereParams) });
  });

  return app;
}

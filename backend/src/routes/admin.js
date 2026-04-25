const { Router } = require('express');
const bcrypt = require('bcryptjs');
const { randomUUID } = require('crypto');
const { requireAuth, requireSuper } = require('../middleware/auth');
const { sanitizeString, validateEmail } = require('../middleware/validate');
const audit = require('../services/audit');

const router = Router();
router.use(requireAuth, requireSuper);

// Resolve a group filter into the set of group IDs to match against (the group itself
// plus all descendants — picking a stake includes its child wards).
function resolveGroupScope(db, groupId) {
  if (!groupId) return null;
  const exists = db.prepare('SELECT id FROM groups WHERE id = ?').get(groupId);
  if (!exists) return [];
  return audit.collectGroupAndDescendantIds(db, groupId);
}

function placeholders(arr) {
  return arr.map(() => '?').join(',');
}

// List users (optionally filtered by group / activity)
router.get('/users', (req, res) => {
  const db = req.app.locals.db;
  const { groupId, activityId } = req.query;
  const scope = resolveGroupScope(db, groupId);
  if (scope && scope.length === 0) return res.json({ users: [] });

  let activity = null;
  if (activityId) {
    activity = db.prepare('SELECT id, group_id FROM events WHERE id = ?').get(activityId);
    if (!activity) return res.json({ users: [] });
  }

  let sql = 'SELECT DISTINCT u.id, u.email, u.name, u.role, u.phone, u.city, u.state_province, u.created_at FROM users u';
  const joinParams = [];
  const whereParams = [];
  const where = [];

  if (scope) {
    sql += ' INNER JOIN group_members gm ON gm.user_id = u.id';
    where.push(`gm.group_id IN (${placeholders(scope)})`);
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

  const users = db.prepare(sql).all(...joinParams, ...whereParams);
  res.json({ users });
});

// Get single user
router.get('/users/:id', (req, res) => {
  const db = req.app.locals.db;
  const user = db.prepare('SELECT id, email, name, role, phone, address, city, state_province, created_at FROM users WHERE id = ?').get(req.params.id);
  if (!user) return res.status(404).json({ error: 'User not found' });
  res.json({ user });
});

// Update user role
router.put('/users/:id/role', (req, res) => {
  const db = req.app.locals.db;
  const { role } = req.body;
  if (!['super', 'user'].includes(role)) {
    return res.status(400).json({ error: 'Invalid role' });
  }

  const user = db.prepare('SELECT id, role FROM users WHERE id = ?').get(req.params.id);
  if (!user) return res.status(404).json({ error: 'User not found' });

  if (user.role === 'super' && role !== 'super') {
    const superCount = db.prepare("SELECT COUNT(*) as count FROM users WHERE role = 'super'").get();
    if (superCount.count <= 1) {
      return res.status(400).json({ error: 'Cannot remove the last super admin' });
    }
  }

  db.prepare('UPDATE users SET role = ? WHERE id = ?').run(role, req.params.id);
  const updated = db.prepare('SELECT id, email, name, role, created_at FROM users WHERE id = ?').get(req.params.id);
  audit.record(db, {
    actorId: req.user.id, action: 'user.role_changed', targetType: 'user', targetId: req.params.id,
    meta: { from: user.role, to: role },
  });
  res.json({ user: updated });
});

// Create user
router.post('/users', async (req, res) => {
  const db = req.app.locals.db;
  const { email, password, name, role } = req.body;

  if (!email || !password || !name || !role) {
    return res.status(400).json({ error: 'Email, password, name, and role are required' });
  }
  if (!validateEmail(email)) {
    return res.status(400).json({ error: 'Invalid email address' });
  }
  if (password.length < 8) {
    return res.status(400).json({ error: 'Password must be at least 8 characters' });
  }
  if (!['super', 'user'].includes(role)) {
    return res.status(400).json({ error: 'Invalid role' });
  }

  const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
  if (existing) return res.status(409).json({ error: 'Email already registered' });

  const id = randomUUID();
  const password_hash = await bcrypt.hash(password, 10);
  db.prepare('INSERT INTO users (id, email, password_hash, name, role) VALUES (?, ?, ?, ?, ?)')
    .run(id, email, password_hash, sanitizeString(name), role);

  const user = db.prepare('SELECT id, email, name, role, created_at FROM users WHERE id = ?').get(id);
  audit.record(db, {
    actorId: req.user.id, action: 'user.created', targetType: 'user', targetId: id,
    meta: { email, role },
  });
  res.status(201).json({ user });
});

// Delete user
router.delete('/users/:id', (req, res) => {
  const db = req.app.locals.db;
  const user = db.prepare('SELECT id, role FROM users WHERE id = ?').get(req.params.id);
  if (!user) return res.status(404).json({ error: 'User not found' });

  if (user.id === req.user.id) {
    return res.status(400).json({ error: 'Cannot delete your own account' });
  }

  if (user.role === 'super') {
    const superCount = db.prepare("SELECT COUNT(*) as count FROM users WHERE role = 'super'").get();
    if (superCount.count <= 1) {
      return res.status(400).json({ error: 'Cannot delete the last super admin' });
    }
  }

  db.prepare('DELETE FROM users WHERE id = ?').run(req.params.id);
  audit.record(db, {
    actorId: req.user.id, action: 'user.deleted', targetType: 'user', targetId: req.params.id,
    meta: { role: user.role },
  });
  res.json({ message: 'User deleted' });
});

// Reset user password
router.put('/users/:id/password', async (req, res) => {
  const db = req.app.locals.db;
  const { newPassword } = req.body;

  if (!newPassword || newPassword.length < 8) {
    return res.status(400).json({ error: 'Password must be at least 8 characters' });
  }

  const user = db.prepare('SELECT id FROM users WHERE id = ?').get(req.params.id);
  if (!user) return res.status(404).json({ error: 'User not found' });

  const password_hash = await bcrypt.hash(newPassword, 10);
  db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(password_hash, req.params.id);
  res.json({ message: 'Password reset successfully' });
});

// System stats (optionally filtered)
router.get('/stats', (req, res) => {
  const db = req.app.locals.db;
  const { groupId, activityId } = req.query;
  const scope = resolveGroupScope(db, groupId);
  if (scope && scope.length === 0) {
    return res.json({ stats: { userCount: 0, eventCount: 0, activeEventCount: 0, submissionCount: 0, profileCount: 0 } });
  }

  if (activityId) {
    const event = db.prepare('SELECT id, group_id, is_active FROM events WHERE id = ?').get(activityId);
    if (!event) {
      return res.json({ stats: { userCount: 0, eventCount: 0, activeEventCount: 0, submissionCount: 0, profileCount: 0 } });
    }
    if (scope && !scope.includes(event.group_id)) {
      return res.json({ stats: { userCount: 0, eventCount: 0, activeEventCount: 0, submissionCount: 0, profileCount: 0 } });
    }
    const submissionCount = db.prepare('SELECT COUNT(*) as count FROM submissions WHERE event_id = ?').get(activityId).count;
    const userCount = db.prepare(
      `SELECT COUNT(DISTINCT u.id) as count FROM users u
       LEFT JOIN submissions s ON s.submitted_by = u.id AND s.event_id = ?
       LEFT JOIN group_invites gi ON gi.accepted_by = u.id AND gi.group_id = ?
       WHERE s.id IS NOT NULL OR gi.id IS NOT NULL`
    ).get(activityId, event.group_id).count;
    const profileCount = db.prepare(
      `SELECT COUNT(DISTINCT cp.id) as count FROM child_profiles cp
       INNER JOIN submissions s ON s.submitted_by = cp.user_id WHERE s.event_id = ?`
    ).get(activityId).count;
    return res.json({ stats: { userCount, eventCount: 1, activeEventCount: event.is_active ? 1 : 0, submissionCount, profileCount } });
  }

  if (scope) {
    const ph = placeholders(scope);
    const userCount = db.prepare(
      `SELECT COUNT(DISTINCT user_id) as count FROM group_members WHERE group_id IN (${ph})`
    ).get(...scope).count;
    const eventCount = db.prepare(
      `SELECT COUNT(*) as count FROM events WHERE group_id IN (${ph})`
    ).get(...scope).count;
    const activeEventCount = db.prepare(
      `SELECT COUNT(*) as count FROM events WHERE group_id IN (${ph}) AND is_active = 1`
    ).get(...scope).count;
    const submissionCount = db.prepare(
      `SELECT COUNT(*) as count FROM submissions s INNER JOIN events e ON e.id = s.event_id WHERE e.group_id IN (${ph})`
    ).get(...scope).count;
    const profileCount = db.prepare(
      `SELECT COUNT(DISTINCT cp.id) as count FROM child_profiles cp INNER JOIN group_members gm ON gm.user_id = cp.user_id WHERE gm.group_id IN (${ph})`
    ).get(...scope).count;
    return res.json({ stats: { userCount, eventCount, activeEventCount, submissionCount, profileCount } });
  }

  const userCount = db.prepare('SELECT COUNT(*) as count FROM users').get().count;
  const eventCount = db.prepare('SELECT COUNT(*) as count FROM events').get().count;
  const activeEventCount = db.prepare('SELECT COUNT(*) as count FROM events WHERE is_active = 1').get().count;
  const submissionCount = db.prepare('SELECT COUNT(*) as count FROM submissions').get().count;
  const profileCount = db.prepare('SELECT COUNT(*) as count FROM child_profiles').get().count;
  res.json({ stats: { userCount, eventCount, activeEventCount, submissionCount, profileCount } });
});

// Groups tree (flat list with depth, for the admin filter dropdown)
router.get('/groups-tree', (req, res) => {
  const db = req.app.locals.db;
  const all = db.prepare('SELECT id, name, type, parent_id FROM groups').all();
  const byParent = new Map();
  for (const g of all) {
    const key = g.parent_id || null;
    if (!byParent.has(key)) byParent.set(key, []);
    byParent.get(key).push(g);
  }
  for (const list of byParent.values()) list.sort((a, b) => a.name.localeCompare(b.name));

  const out = [];
  function walk(parentId, depth) {
    const children = byParent.get(parentId) || [];
    for (const g of children) {
      out.push({ id: g.id, name: g.name, type: g.type, parent_id: g.parent_id, depth });
      walk(g.id, depth + 1);
    }
  }
  walk(null, 0);
  res.json({ groups: out });
});

// Activities (events) scoped to filter
router.get('/activities', (req, res) => {
  const db = req.app.locals.db;
  const { groupId } = req.query;
  const scope = resolveGroupScope(db, groupId);
  if (scope && scope.length === 0) return res.json({ activities: [] });

  let sql = `SELECT e.id, e.event_name, e.event_dates, e.event_start, e.event_end, e.ward, e.stake, e.is_active, e.created_at, e.group_id, g.name as group_name,
             (SELECT COUNT(*) FROM submissions s WHERE s.event_id = e.id) as submission_count
             FROM events e LEFT JOIN groups g ON g.id = e.group_id`;
  const params = [];
  if (scope) {
    sql += ` WHERE e.group_id IN (${placeholders(scope)})`;
    params.push(...scope);
  }
  sql += ' ORDER BY e.created_at DESC';
  const activities = db.prepare(sql).all(...params);
  res.json({ activities });
});

// Submissions scoped to filter
router.get('/submissions', (req, res) => {
  const db = req.app.locals.db;
  const { groupId, activityId } = req.query;
  const scope = resolveGroupScope(db, groupId);
  if (scope && scope.length === 0) return res.json({ submissions: [] });

  let sql = `SELECT s.id, s.event_id, s.participant_name, s.participant_age, s.submitted_at, s.submitted_by,
             e.event_name, e.event_dates, e.group_id, g.name as group_name, u.name as submitter_name, u.email as submitter_email
             FROM submissions s
             INNER JOIN events e ON e.id = s.event_id
             LEFT JOIN groups g ON g.id = e.group_id
             LEFT JOIN users u ON u.id = s.submitted_by`;
  const where = [];
  const params = [];
  if (scope) {
    where.push(`e.group_id IN (${placeholders(scope)})`);
    params.push(...scope);
  }
  if (activityId) {
    where.push('s.event_id = ?');
    params.push(activityId);
  }
  if (where.length) sql += ' WHERE ' + where.join(' AND ');
  sql += ' ORDER BY s.submitted_at DESC';
  const submissions = db.prepare(sql).all(...params);
  res.json({ submissions });
});

// Profiles scoped to filter
router.get('/profiles', (req, res) => {
  const db = req.app.locals.db;
  const { groupId, activityId } = req.query;
  const scope = resolveGroupScope(db, groupId);
  if (scope && scope.length === 0) return res.json({ profiles: [] });

  let sql = `SELECT DISTINCT cp.id, cp.user_id, cp.participant_name, cp.participant_dob, cp.youth_program, cp.updated_at,
             u.name as owner_name, u.email as owner_email
             FROM child_profiles cp
             INNER JOIN users u ON u.id = cp.user_id`;
  const joinParams = [];
  const whereParams = [];
  const where = [];

  if (activityId) {
    sql += ' INNER JOIN submissions s ON s.submitted_by = cp.user_id AND s.event_id = ?';
    joinParams.push(activityId);
  }
  if (scope) {
    sql += ' INNER JOIN group_members gm ON gm.user_id = cp.user_id';
    where.push(`gm.group_id IN (${placeholders(scope)})`);
    whereParams.push(...scope);
  }
  if (where.length) sql += ' WHERE ' + where.join(' AND ');
  sql += ' ORDER BY cp.updated_at DESC';
  const profiles = db.prepare(sql).all(...joinParams, ...whereParams);
  res.json({ profiles });
});

module.exports = router;

const { Router } = require('express');
const crypto = require('crypto');
const { requireAuth, requireSuper } = require('../middleware/auth');

const router = Router();
router.use(requireAuth);

// List groups the current user belongs to
router.get('/', (req, res) => {
  const db = req.app.locals.db;
  const groups = db.prepare(`
    SELECT g.*, gm.role as member_role,
      (SELECT COUNT(*) FROM group_members WHERE group_id = g.id) as member_count
    FROM groups g
    JOIN group_members gm ON gm.group_id = g.id
    WHERE gm.user_id = ?
    ORDER BY g.type, g.name
  `).all(req.user.id);

  // For each group, get parent info if it's a ward
  for (const group of groups) {
    if (group.parent_id) {
      group.parent = db.prepare('SELECT id, name, type, stake FROM groups WHERE id = ?').get(group.parent_id);
    }
    // Get subgroups if it's a stake
    if (group.type === 'stake') {
      group.subgroups = db.prepare('SELECT id, name, type, ward FROM groups WHERE parent_id = ?').all(group.id);
    }
  }

  res.json({ groups });
});

// Get a single group (must be a member)
router.get('/:id', (req, res) => {
  const db = req.app.locals.db;
  const membership = db.prepare('SELECT role FROM group_members WHERE group_id = ? AND user_id = ?').get(req.params.id, req.user.id);
  if (!membership && req.user.role !== 'super') {
    return res.status(403).json({ error: 'Not a member of this group' });
  }

  const group = db.prepare('SELECT * FROM groups WHERE id = ?').get(req.params.id);
  if (!group) return res.status(404).json({ error: 'Group not found' });

  // Get members
  group.members = db.prepare(`
    SELECT gm.id as membership_id, gm.role, gm.joined_at, u.id as user_id, u.name, u.email
    FROM group_members gm
    JOIN users u ON u.id = gm.user_id
    WHERE gm.group_id = ?
    ORDER BY gm.role, u.name
  `).all(req.params.id);

  // Get subgroups
  group.subgroups = db.prepare('SELECT id, name, type, ward FROM groups WHERE parent_id = ?').all(req.params.id);

  // Get parent
  if (group.parent_id) {
    group.parent = db.prepare('SELECT id, name, type, stake FROM groups WHERE id = ?').get(group.parent_id);
  }

  res.json({ group });
});

// Create a group (super only, OR creating a ward under a stake where user is admin)
router.post('/', (req, res) => {
  const db = req.app.locals.db;
  const { name, type, parent_id, ward, stake, leader_name, leader_phone, leader_email } = req.body;

  if (!name || !type) return res.status(400).json({ error: 'Name and type are required' });
  if (!['stake', 'ward', 'custom'].includes(type)) return res.status(400).json({ error: 'Invalid group type' });

  // Only super can create top-level groups (stakes)
  // Group admins can create wards under their stake
  if (!parent_id && req.user.role !== 'super') {
    return res.status(403).json({ error: 'Only administrators can create top-level groups' });
  }

  if (parent_id) {
    const parentMembership = db.prepare('SELECT role FROM group_members WHERE group_id = ? AND user_id = ?').get(parent_id, req.user.id);
    if (!parentMembership || parentMembership.role !== 'admin') {
      if (req.user.role !== 'super') {
        return res.status(403).json({ error: 'Must be a group admin to create subgroups' });
      }
    }
  }

  const id = crypto.randomUUID();
  const inviteCode = crypto.randomBytes(4).toString('hex').toUpperCase(); // 8-char code like "A1B2C3D4"

  db.prepare(`INSERT INTO groups (id, name, type, parent_id, ward, stake, leader_name, leader_phone, leader_email, invite_code)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(id, name, type, parent_id || null, ward || name, stake || null, leader_name || null, leader_phone || null, leader_email || null, inviteCode);

  // Creator becomes admin
  db.prepare('INSERT INTO group_members (id, group_id, user_id, role) VALUES (?, ?, ?, ?)')
    .run(crypto.randomUUID(), id, req.user.id, 'admin');

  // If creating a ward under a stake, inherit stake name
  if (parent_id) {
    const parent = db.prepare('SELECT name, stake FROM groups WHERE id = ?').get(parent_id);
    if (parent && !stake) {
      db.prepare('UPDATE groups SET stake = ? WHERE id = ?').run(parent.stake || parent.name, id);
    }
  }

  const group = db.prepare('SELECT * FROM groups WHERE id = ?').get(id);
  res.status(201).json({ group });
});

// Update a group (admin only)
router.put('/:id', (req, res) => {
  const db = req.app.locals.db;
  const membership = db.prepare('SELECT role FROM group_members WHERE group_id = ? AND user_id = ?').get(req.params.id, req.user.id);
  if ((!membership || membership.role !== 'admin') && req.user.role !== 'super') {
    return res.status(403).json({ error: 'Must be a group admin' });
  }

  const group = db.prepare('SELECT * FROM groups WHERE id = ?').get(req.params.id);
  if (!group) return res.status(404).json({ error: 'Group not found' });

  const { name, ward, stake, leader_name, leader_phone, leader_email } = req.body;

  db.prepare(`UPDATE groups SET name = ?, ward = ?, stake = ?, leader_name = ?, leader_phone = ?, leader_email = ?, updated_at = datetime('now') WHERE id = ?`)
    .run(name || group.name, ward || group.ward, stake || group.stake, leader_name ?? group.leader_name, leader_phone ?? group.leader_phone, leader_email ?? group.leader_email, req.params.id);

  const updated = db.prepare('SELECT * FROM groups WHERE id = ?').get(req.params.id);
  res.json({ group: updated });
});

// Join a group via invite code
router.post('/join', (req, res) => {
  const db = req.app.locals.db;
  const { invite_code } = req.body;
  if (!invite_code) return res.status(400).json({ error: 'Invite code is required' });

  const group = db.prepare('SELECT * FROM groups WHERE invite_code = ?').get(invite_code.toUpperCase());
  if (!group) return res.status(404).json({ error: 'Invalid invite code' });

  // Check if already a member
  const existing = db.prepare('SELECT id FROM group_members WHERE group_id = ? AND user_id = ?').get(group.id, req.user.id);
  if (existing) return res.status(409).json({ error: 'Already a member of this group' });

  db.prepare('INSERT INTO group_members (id, group_id, user_id, role) VALUES (?, ?, ?, ?)')
    .run(crypto.randomUUID(), group.id, req.user.id, 'member');

  // Also add to parent group if it's a ward
  if (group.parent_id) {
    const parentExisting = db.prepare('SELECT id FROM group_members WHERE group_id = ? AND user_id = ?').get(group.parent_id, req.user.id);
    if (!parentExisting) {
      db.prepare('INSERT INTO group_members (id, group_id, user_id, role) VALUES (?, ?, ?, ?)')
        .run(crypto.randomUUID(), group.parent_id, req.user.id, 'member');
    }
  }

  res.json({ group, message: `Joined ${group.name}` });
});

// Invite a user (admin only) -- add by email
router.post('/:id/invite', (req, res) => {
  const db = req.app.locals.db;
  const membership = db.prepare('SELECT role FROM group_members WHERE group_id = ? AND user_id = ?').get(req.params.id, req.user.id);
  if ((!membership || membership.role !== 'admin') && req.user.role !== 'super') {
    return res.status(403).json({ error: 'Must be a group admin to invite' });
  }

  const { email, role } = req.body;
  if (!email) return res.status(400).json({ error: 'Email is required' });

  const user = db.prepare('SELECT id, name, email FROM users WHERE email = ?').get(email);
  if (!user) return res.status(404).json({ error: 'User not found. They need to register first.' });

  const existing = db.prepare('SELECT id FROM group_members WHERE group_id = ? AND user_id = ?').get(req.params.id, user.id);
  if (existing) return res.status(409).json({ error: 'User is already a member' });

  const memberRole = (role === 'admin') ? 'admin' : 'member';
  db.prepare('INSERT INTO group_members (id, group_id, user_id, role) VALUES (?, ?, ?, ?)')
    .run(crypto.randomUUID(), req.params.id, user.id, memberRole);

  res.json({ message: `${user.name} added to group`, member: { user_id: user.id, name: user.name, email: user.email, role: memberRole } });
});

// Update a member's role (admin only)
router.put('/:id/members/:userId/role', (req, res) => {
  const db = req.app.locals.db;
  const membership = db.prepare('SELECT role FROM group_members WHERE group_id = ? AND user_id = ?').get(req.params.id, req.user.id);
  if ((!membership || membership.role !== 'admin') && req.user.role !== 'super') {
    return res.status(403).json({ error: 'Must be a group admin' });
  }

  const { role } = req.body;
  if (!['admin', 'member'].includes(role)) return res.status(400).json({ error: 'Invalid role' });

  db.prepare('UPDATE group_members SET role = ? WHERE group_id = ? AND user_id = ?')
    .run(role, req.params.id, req.params.userId);

  res.json({ message: 'Role updated' });
});

// Remove a member (admin only, or self-leave)
router.delete('/:id/members/:userId', (req, res) => {
  const db = req.app.locals.db;
  const isSelf = req.params.userId === req.user.id;

  if (!isSelf) {
    const membership = db.prepare('SELECT role FROM group_members WHERE group_id = ? AND user_id = ?').get(req.params.id, req.user.id);
    if ((!membership || membership.role !== 'admin') && req.user.role !== 'super') {
      return res.status(403).json({ error: 'Must be a group admin to remove members' });
    }
  }

  db.prepare('DELETE FROM group_members WHERE group_id = ? AND user_id = ?')
    .run(req.params.id, req.params.userId);

  res.json({ message: 'Member removed' });
});

// Regenerate invite code (admin only)
router.post('/:id/regenerate-invite', (req, res) => {
  const db = req.app.locals.db;
  const membership = db.prepare('SELECT role FROM group_members WHERE group_id = ? AND user_id = ?').get(req.params.id, req.user.id);
  if ((!membership || membership.role !== 'admin') && req.user.role !== 'super') {
    return res.status(403).json({ error: 'Must be a group admin' });
  }

  const newCode = crypto.randomBytes(4).toString('hex').toUpperCase();
  db.prepare('UPDATE groups SET invite_code = ? WHERE id = ?').run(newCode, req.params.id);

  res.json({ invite_code: newCode });
});

module.exports = router;

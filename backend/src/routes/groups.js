const { Router } = require('express');
const crypto = require('crypto');
const { requireAuth, requireSuper } = require('../middleware/auth');
const config = require('../config');
const { createTransport, sendGroupInvite, sendRemovalNotice } = require('../services/email');
const { generateCode, generateToken, isInviteUsable, inviteUrl, addMembershipWithPropagation } = require('../services/invites');
const audit = require('../services/audit');

const router = Router();
router.use(requireAuth);

function emailConfigured() {
  return !!(config.email && config.email.fromAddress && (config.email.resendApiKey || (config.email.smtp && config.email.smtp.user)));
}

function trySendInviteEmail(invite, group, inviter) {
  if (!invite.email) return;
  const url = inviteUrl(invite.token);
  if (!emailConfigured()) {
    console.log(`[invite] no email transport configured; would have sent to ${invite.email}: ${url}`);
    return;
  }
  try {
    const transport = createTransport(config.email);
    sendGroupInvite(transport, {
      to: invite.email,
      groupName: group.name,
      role: invite.role,
      inviteUrl: url,
      inviterName: inviter && inviter.name,
      fromName: config.email.fromName,
      fromAddress: config.email.fromAddress,
    }).catch((err) => console.warn('[invite email] send failed:', err.message));
  } catch (err) {
    console.warn('[invite email] transport error:', err.message);
  }
}

function trySendRemovalEmail(toEmail, groupName) {
  if (!toEmail) return;
  if (!emailConfigured()) {
    console.log(`[removal] no email transport configured; would have notified ${toEmail} of removal from "${groupName}"`);
    return;
  }
  try {
    const transport = createTransport(config.email);
    sendRemovalNotice(transport, {
      to: toEmail,
      groupName,
      fromName: config.email.fromName,
      fromAddress: config.email.fromAddress,
    }).catch((err) => console.warn('[removal email] send failed:', err.message));
  } catch (err) {
    console.warn('[removal email] transport error:', err.message);
  }
}

// Returns true if the user is admin of `groupId` OR admin of any ancestor group,
// OR has the system-level `super` role. Used to enforce hierarchical authority
// (stake admins manage their child wards).
function isEffectiveGroupAdmin(db, groupId, userId, userRole) {
  if (userRole === 'super') return true;
  let currentId = groupId;
  const visited = new Set();
  while (currentId && !visited.has(currentId)) {
    visited.add(currentId);
    const m = db.prepare('SELECT role FROM group_members WHERE group_id = ? AND user_id = ?').get(currentId, userId);
    if (m && m.role === 'admin') return true;
    const g = db.prepare('SELECT parent_id FROM groups WHERE id = ?').get(currentId);
    currentId = g && g.parent_id ? g.parent_id : null;
  }
  return false;
}

function countGroupAdmins(db, groupId) {
  const row = db.prepare("SELECT COUNT(*) as n FROM group_members WHERE group_id = ? AND role = 'admin'").get(groupId);
  return row ? row.n : 0;
}

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

// Get a single group (must be a member of the group OR admin of an ancestor)
router.get('/:id', (req, res) => {
  const db = req.app.locals.db;
  const membership = db.prepare('SELECT role FROM group_members WHERE group_id = ? AND user_id = ?').get(req.params.id, req.user.id);
  if (!membership && !isEffectiveGroupAdmin(db, req.params.id, req.user.id, req.user.role)) {
    return res.status(403).json({ error: 'Not a member of this group' });
  }

  const group = db.prepare('SELECT * FROM groups WHERE id = ?').get(req.params.id);
  if (!group) return res.status(404).json({ error: 'Group not found' });

  // Effective admin: direct admin of this group OR admin of any ancestor (or super)
  group.effective_admin = isEffectiveGroupAdmin(db, req.params.id, req.user.id, req.user.role);

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
  const { name, type, parent_id, ward, stake, leader_name, leader_phone, leader_email, send_leader_invite } = req.body;

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
  const inviteCode = generateCode();

  db.prepare(`INSERT INTO groups (id, name, type, parent_id, ward, stake, leader_name, leader_phone, leader_email, invite_code)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(id, name, type, parent_id || null, ward || name, stake || null, leader_name || null, leader_phone || null, leader_email || null, inviteCode);

  // Creator becomes admin
  db.prepare('INSERT INTO group_members (id, group_id, user_id, role) VALUES (?, ?, ?, ?)')
    .run(crypto.randomUUID(), id, req.user.id, 'admin');

  // Seed default member-role shareable invite
  db.prepare(
    `INSERT INTO group_invites (id, group_id, code, token, role, used_count, created_by)
     VALUES (?, ?, ?, ?, 'member', 0, ?)`
  ).run(crypto.randomUUID(), id, inviteCode, generateToken(), req.user.id);

  // If creating a ward under a stake, inherit stake name
  if (parent_id) {
    const parent = db.prepare('SELECT name, stake FROM groups WHERE id = ?').get(parent_id);
    if (parent && !stake) {
      db.prepare('UPDATE groups SET stake = ? WHERE id = ?').run(parent.stake || parent.name, id);
    }
  }

  // Optional: send admin-role invite to leader_email
  if (send_leader_invite && leader_email) {
    const inviteId = crypto.randomUUID();
    const token = generateToken();
    db.prepare(
      `INSERT INTO group_invites (id, group_id, code, token, role, email, max_uses, used_count, created_by)
       VALUES (?, ?, NULL, ?, 'admin', ?, 1, 0, ?)`
    ).run(inviteId, id, token, leader_email, req.user.id);
    const invite = db.prepare('SELECT * FROM group_invites WHERE id = ?').get(inviteId);
    const created = db.prepare('SELECT id, name FROM groups WHERE id = ?').get(id);
    trySendInviteEmail(invite, created, req.user);
    audit.record(db, {
      actorId: req.user.id, action: 'invite.created', targetType: 'invite', targetId: inviteId,
      groupId: id, meta: { role: 'admin', email: leader_email, source: 'leader_email' },
    });
  }

  audit.record(db, {
    actorId: req.user.id, action: 'group.create', targetType: 'group', targetId: id,
    groupId: id, meta: { name, type, parent_id: parent_id || null },
  });
  audit.record(db, {
    actorId: req.user.id, action: 'member.added', targetType: 'user', targetId: req.user.id,
    groupId: id, meta: { role: 'admin', source: 'group.create' },
  });

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
  audit.record(db, {
    actorId: req.user.id, action: 'group.update', targetType: 'group', targetId: req.params.id,
    groupId: req.params.id,
    meta: diffGroup(group, updated),
  });
  res.json({ group: updated });
});

function diffGroup(before, after) {
  const fields = ['name', 'ward', 'stake', 'leader_name', 'leader_phone', 'leader_email'];
  const out = {};
  for (const f of fields) {
    if ((before[f] ?? null) !== (after[f] ?? null)) {
      out[f] = { from: before[f] ?? null, to: after[f] ?? null };
    }
  }
  return out;
}

// Join a group via shareable invite code
router.post('/join', (req, res) => {
  const db = req.app.locals.db;
  const { invite_code } = req.body;
  if (!invite_code) return res.status(400).json({ error: 'Invite code is required' });
  const code = String(invite_code).toUpperCase();

  const invite = db.prepare('SELECT * FROM group_invites WHERE code = ?').get(code);
  const usable = isInviteUsable(invite);
  if (!usable.ok) {
    const status = usable.reason === 'not_found' ? 404 : 410;
    return res.status(status).json({ error: `Invite ${usable.reason}` });
  }

  const group = db.prepare('SELECT * FROM groups WHERE id = ?').get(invite.group_id);
  if (!group) return res.status(404).json({ error: 'Group not found' });

  const existing = db.prepare('SELECT id FROM group_members WHERE group_id = ? AND user_id = ?').get(group.id, req.user.id);
  if (existing) return res.status(409).json({ error: 'Already a member of this group' });

  addMembershipWithPropagation(db, group.id, req.user.id, invite.role);
  db.prepare('UPDATE group_invites SET used_count = used_count + 1 WHERE id = ?').run(invite.id);

  audit.record(db, {
    actorId: req.user.id, action: 'member.added', targetType: 'user', targetId: req.user.id,
    groupId: group.id, meta: { role: invite.role, source: 'invite.code', invite_id: invite.id },
  });
  audit.record(db, {
    actorId: req.user.id, action: 'invite.accepted', targetType: 'invite', targetId: invite.id,
    groupId: group.id, meta: { via: 'code' },
  });

  res.json({ group, message: `Joined ${group.name}` });
});

// List active invites for a group (admins only)
router.get('/:id/invites', (req, res) => {
  const db = req.app.locals.db;
  if (!isEffectiveGroupAdmin(db, req.params.id, req.user.id, req.user.role)) {
    return res.status(403).json({ error: 'Must be a group admin' });
  }
  const invites = db.prepare(
    `SELECT id, group_id, code, token, role, email, max_uses, used_count, expires_at, revoked_at, accepted_at, created_at
     FROM group_invites WHERE group_id = ? ORDER BY created_at DESC`
  ).all(req.params.id);
  res.json({ invites });
});

// Create an invite (shareable code or per-email tokenized link).
// Body: { role?: 'admin'|'member', email?: string, max_uses?: number, expires_at?: ISOString }
router.post('/:id/invites', (req, res) => {
  const db = req.app.locals.db;
  if (!isEffectiveGroupAdmin(db, req.params.id, req.user.id, req.user.role)) {
    return res.status(403).json({ error: 'Must be a group admin' });
  }
  const group = db.prepare('SELECT id, name FROM groups WHERE id = ?').get(req.params.id);
  if (!group) return res.status(404).json({ error: 'Group not found' });

  const { role, email, max_uses, expires_at } = req.body || {};
  const inviteRole = role === 'admin' ? 'admin' : 'member';
  const id = crypto.randomUUID();
  const isEmailInvite = !!email;
  const code = isEmailInvite ? null : generateCode();
  const token = generateToken();
  const maxUses = isEmailInvite ? 1 : (Number.isInteger(max_uses) && max_uses > 0 ? max_uses : null);
  const expires = expires_at ? new Date(expires_at).toISOString() : null;

  db.prepare(
    `INSERT INTO group_invites (id, group_id, code, token, role, email, max_uses, used_count, expires_at, created_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?, ?)`
  ).run(id, group.id, code, token, inviteRole, email || null, maxUses, expires, req.user.id);

  const invite = db.prepare('SELECT * FROM group_invites WHERE id = ?').get(id);
  trySendInviteEmail(invite, group, req.user);
  audit.record(db, {
    actorId: req.user.id, action: 'invite.created', targetType: 'invite', targetId: id,
    groupId: group.id,
    meta: { role: inviteRole, email: email || null, max_uses: maxUses, expires_at: expires, has_code: !!code },
  });

  res.status(201).json({ invite });
});

// Revoke an invite
router.delete('/:id/invites/:inviteId', (req, res) => {
  const db = req.app.locals.db;
  if (!isEffectiveGroupAdmin(db, req.params.id, req.user.id, req.user.role)) {
    return res.status(403).json({ error: 'Must be a group admin' });
  }
  const r = db.prepare(
    `UPDATE group_invites SET revoked_at = datetime('now')
     WHERE id = ? AND group_id = ? AND revoked_at IS NULL`
  ).run(req.params.inviteId, req.params.id);
  if (r.changes === 0) return res.status(404).json({ error: 'Invite not found' });
  audit.record(db, {
    actorId: req.user.id, action: 'invite.revoked', targetType: 'invite', targetId: req.params.inviteId,
    groupId: req.params.id,
  });
  res.json({ message: 'Invite revoked' });
});

// Legacy email-invite endpoint: now creates a tokenized invite (works for unregistered users)
router.post('/:id/invite', (req, res) => {
  const db = req.app.locals.db;
  if (!isEffectiveGroupAdmin(db, req.params.id, req.user.id, req.user.role)) {
    return res.status(403).json({ error: 'Must be a group admin to invite' });
  }
  const { email, role } = req.body || {};
  if (!email) return res.status(400).json({ error: 'Email is required' });
  const inviteRole = role === 'admin' ? 'admin' : 'member';

  const group = db.prepare('SELECT id, name FROM groups WHERE id = ?').get(req.params.id);
  if (!group) return res.status(404).json({ error: 'Group not found' });

  // If the user already exists AND is already a member, short-circuit
  const existingUser = db.prepare('SELECT id, name, email FROM users WHERE email = ?').get(email);
  if (existingUser) {
    const existingMember = db.prepare('SELECT id FROM group_members WHERE group_id = ? AND user_id = ?').get(group.id, existingUser.id);
    if (existingMember) return res.status(409).json({ error: 'User is already a member' });
  }

  const id = crypto.randomUUID();
  const token = generateToken();
  db.prepare(
    `INSERT INTO group_invites (id, group_id, code, token, role, email, max_uses, used_count, created_by)
     VALUES (?, ?, NULL, ?, ?, ?, 1, 0, ?)`
  ).run(id, group.id, token, inviteRole, email, req.user.id);
  const invite = db.prepare('SELECT * FROM group_invites WHERE id = ?').get(id);
  trySendInviteEmail(invite, group, req.user);
  audit.record(db, {
    actorId: req.user.id, action: 'invite.created', targetType: 'invite', targetId: id,
    groupId: group.id, meta: { role: inviteRole, email, source: 'legacy_invite' },
  });

  res.json({ message: `Invite sent to ${email}`, invite });
});

// Update a member's role (admin of group or any ancestor group)
router.put('/:id/members/:userId/role', (req, res) => {
  const db = req.app.locals.db;
  if (!isEffectiveGroupAdmin(db, req.params.id, req.user.id, req.user.role)) {
    return res.status(403).json({ error: 'Must be a group admin' });
  }

  const { role } = req.body;
  if (!['admin', 'member'].includes(role)) return res.status(400).json({ error: 'Invalid role' });

  const target = db.prepare('SELECT role FROM group_members WHERE group_id = ? AND user_id = ?').get(req.params.id, req.params.userId);
  if (!target) return res.status(404).json({ error: 'Member not found' });

  // Last-admin guard: refuse to demote the only remaining admin
  if (target.role === 'admin' && role === 'member' && countGroupAdmins(db, req.params.id) <= 1) {
    return res.status(409).json({ error: 'Cannot demote the last admin of this group' });
  }

  db.prepare('UPDATE group_members SET role = ? WHERE group_id = ? AND user_id = ?')
    .run(role, req.params.id, req.params.userId);

  audit.record(db, {
    actorId: req.user.id, action: 'member.role_changed', targetType: 'user', targetId: req.params.userId,
    groupId: req.params.id, meta: { from: target.role, to: role },
  });
  res.json({ message: 'Role updated' });
});

// Remove a member (admin of group or any ancestor group, or self-leave)
router.delete('/:id/members/:userId', (req, res) => {
  const db = req.app.locals.db;
  const isSelf = req.params.userId === req.user.id;

  if (!isSelf && !isEffectiveGroupAdmin(db, req.params.id, req.user.id, req.user.role)) {
    return res.status(403).json({ error: 'Must be a group admin to remove members' });
  }

  const target = db.prepare('SELECT role FROM group_members WHERE group_id = ? AND user_id = ?').get(req.params.id, req.params.userId);
  if (!target) return res.status(404).json({ error: 'Member not found' });

  // Last-admin guard: refuse to remove the only remaining admin
  if (target.role === 'admin' && countGroupAdmins(db, req.params.id) <= 1) {
    return res.status(409).json({ error: 'Cannot remove the last admin of this group' });
  }

  // Look up the removed user's email + group name for notification
  const removed = db.prepare('SELECT email FROM users WHERE id = ?').get(req.params.userId);
  const groupRow = db.prepare('SELECT name FROM groups WHERE id = ?').get(req.params.id);

  db.prepare('DELETE FROM group_members WHERE group_id = ? AND user_id = ?')
    .run(req.params.id, req.params.userId);

  if (!isSelf && removed && removed.email && groupRow) {
    trySendRemovalEmail(removed.email, groupRow.name);
  }

  audit.record(db, {
    actorId: req.user.id, action: 'member.removed', targetType: 'user', targetId: req.params.userId,
    groupId: req.params.id, meta: { self_leave: isSelf, role: target.role },
  });

  res.json({ message: 'Member removed' });
});

// Regenerate the default shareable invite code: revokes existing default code-bearing
// invites for this group and mints a new member-role one.
router.post('/:id/regenerate-invite', (req, res) => {
  const db = req.app.locals.db;
  if (!isEffectiveGroupAdmin(db, req.params.id, req.user.id, req.user.role)) {
    return res.status(403).json({ error: 'Must be a group admin' });
  }

  const newCode = generateCode();
  const tx = db.transaction(() => {
    db.prepare(
      `UPDATE group_invites SET revoked_at = datetime('now')
       WHERE group_id = ? AND code IS NOT NULL AND revoked_at IS NULL`
    ).run(req.params.id);
    db.prepare(
      `INSERT INTO group_invites (id, group_id, code, token, role, used_count, created_by)
       VALUES (?, ?, ?, ?, 'member', 0, ?)`
    ).run(crypto.randomUUID(), req.params.id, newCode, generateToken(), req.user.id);
  });
  tx();
  db.prepare('UPDATE groups SET invite_code = ? WHERE id = ?').run(newCode, req.params.id);

  audit.record(db, {
    actorId: req.user.id, action: 'invite.regenerated', targetType: 'group', targetId: req.params.id,
    groupId: req.params.id,
  });

  res.json({ invite_code: newCode });
});

// Audit log for a group (admins only). Includes events on descendant groups
// so a stake admin sees activity in their child wards.
router.get('/:id/audit', (req, res) => {
  const db = req.app.locals.db;
  if (!isEffectiveGroupAdmin(db, req.params.id, req.user.id, req.user.role)) {
    return res.status(403).json({ error: 'Must be a group admin' });
  }
  const limit = Math.min(parseInt(req.query.limit, 10) || 100, 500);
  const before = req.query.before || undefined;
  const entries = audit.listForGroup(db, req.params.id, { limit, before });
  res.json({ entries });
});

module.exports = router;

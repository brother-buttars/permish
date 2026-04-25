const { Router } = require('express');
const { requireAuth } = require('../middleware/auth');
const { isInviteUsable, addMembershipWithPropagation } = require('../services/invites');
const audit = require('../services/audit');

const router = Router();

// Preview an invite (public — no auth required so a recipient can see what they're accepting)
router.get('/:token', (req, res) => {
  const db = req.app.locals.db;
  const invite = db.prepare('SELECT * FROM group_invites WHERE token = ?').get(req.params.token);
  const usable = isInviteUsable(invite);
  if (!usable.ok) {
    const status = usable.reason === 'not_found' ? 404 : 410;
    return res.status(status).json({ error: `Invite ${usable.reason}` });
  }
  const group = db.prepare('SELECT id, name, type, ward, stake FROM groups WHERE id = ?').get(invite.group_id);
  res.json({
    invite: {
      role: invite.role,
      email: invite.email,
      expires_at: invite.expires_at,
    },
    group,
  });
});

// Accept an invite — requires auth, joins user as member with the invite's role
router.post('/:token/accept', requireAuth, (req, res) => {
  const db = req.app.locals.db;
  const invite = db.prepare('SELECT * FROM group_invites WHERE token = ?').get(req.params.token);
  const usable = isInviteUsable(invite);
  if (!usable.ok) {
    const status = usable.reason === 'not_found' ? 404 : 410;
    return res.status(status).json({ error: `Invite ${usable.reason}` });
  }

  // If this is an email-targeted invite, the accepting user's email should match
  if (invite.email && req.user.email && invite.email.toLowerCase() !== req.user.email.toLowerCase()) {
    return res.status(403).json({ error: 'This invite was sent to a different email address' });
  }

  const group = db.prepare('SELECT * FROM groups WHERE id = ?').get(invite.group_id);
  if (!group) return res.status(404).json({ error: 'Group not found' });

  const existing = db.prepare('SELECT id FROM group_members WHERE group_id = ? AND user_id = ?').get(group.id, req.user.id);
  if (existing) {
    // Mark accepted but report that they're already in
    db.prepare(`UPDATE group_invites SET accepted_at = datetime('now'), accepted_by = ? WHERE id = ?`)
      .run(req.user.id, invite.id);
    return res.status(200).json({ group, message: `Already a member of ${group.name}` });
  }

  const tx = db.transaction(() => {
    addMembershipWithPropagation(db, group.id, req.user.id, invite.role);
    db.prepare('UPDATE group_invites SET used_count = used_count + 1 WHERE id = ?').run(invite.id);
    // For single-use invites, also stamp accepted_at so they can't be reused
    if (invite.max_uses === 1) {
      db.prepare(`UPDATE group_invites SET accepted_at = datetime('now'), accepted_by = ? WHERE id = ?`)
        .run(req.user.id, invite.id);
    }
  });
  tx();

  audit.record(db, {
    actorId: req.user.id, action: 'member.added', targetType: 'user', targetId: req.user.id,
    groupId: group.id, meta: { role: invite.role, source: 'invite.token', invite_id: invite.id },
  });
  audit.record(db, {
    actorId: req.user.id, action: 'invite.accepted', targetType: 'invite', targetId: invite.id,
    groupId: group.id, meta: { via: 'token', email: invite.email || null },
  });

  res.json({ group, message: `Joined ${group.name}` });
});

module.exports = router;

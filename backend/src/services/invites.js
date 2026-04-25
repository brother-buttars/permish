const crypto = require('crypto');
const config = require('../config');

function generateCode() {
  return crypto.randomBytes(4).toString('hex').toUpperCase();
}

function generateToken() {
  return crypto.randomBytes(24).toString('base64url');
}

function isInviteUsable(invite, now = new Date()) {
  if (!invite) return { ok: false, reason: 'not_found' };
  if (invite.revoked_at) return { ok: false, reason: 'revoked' };
  if (invite.accepted_at) return { ok: false, reason: 'accepted' };
  if (invite.expires_at && new Date(invite.expires_at) < now) return { ok: false, reason: 'expired' };
  if (invite.max_uses != null && invite.used_count >= invite.max_uses) return { ok: false, reason: 'exhausted' };
  return { ok: true };
}

function inviteUrl(token) {
  const base = config.frontendUrl || 'http://localhost:3000';
  return `${base.replace(/\/$/, '')}/invite/${token}`;
}

// Add user as member; propagate to parent group(s) as plain member.
function addMembershipWithPropagation(db, groupId, userId, role) {
  const existing = db.prepare('SELECT id FROM group_members WHERE group_id = ? AND user_id = ?').get(groupId, userId);
  if (!existing) {
    db.prepare('INSERT INTO group_members (id, group_id, user_id, role) VALUES (?, ?, ?, ?)')
      .run(crypto.randomUUID(), groupId, userId, role);
  } else if (role === 'admin' && existing) {
    // If they're already a member, only upgrade if requested role is admin
    db.prepare('UPDATE group_members SET role = ? WHERE id = ?').run(role, existing.id);
  }
  // Walk parent chain, adding plain `member` rows where missing.
  const visited = new Set();
  let current = db.prepare('SELECT parent_id FROM groups WHERE id = ?').get(groupId);
  while (current && current.parent_id && !visited.has(current.parent_id)) {
    visited.add(current.parent_id);
    const parentId = current.parent_id;
    const parentExisting = db.prepare('SELECT id FROM group_members WHERE group_id = ? AND user_id = ?').get(parentId, userId);
    if (!parentExisting) {
      db.prepare('INSERT INTO group_members (id, group_id, user_id, role) VALUES (?, ?, ?, ?)')
        .run(crypto.randomUUID(), parentId, userId, 'member');
    }
    current = db.prepare('SELECT parent_id FROM groups WHERE id = ?').get(parentId);
  }
}

module.exports = { generateCode, generateToken, isInviteUsable, inviteUrl, addMembershipWithPropagation };

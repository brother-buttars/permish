import { Hono } from 'hono';
import type { DB } from '../db.ts';
import { type AppEnv, type AuthUser, requireAuth, currentUser } from '../lib/auth.ts';
import { isEffectiveGroupAdmin, countGroupAdmins } from '../lib/groups.ts';
import { config } from '../config.ts';
import { createTransport, sendGroupInvite, sendRemovalNotice } from '../services/email.ts';
import { generateCode, generateToken, isInviteUsable, inviteUrl, addMembershipWithPropagation, type InviteRow } from '../services/invites.ts';
import * as audit from '../services/audit.ts';

type Row = Record<string, any>;

function emailConfigured(): boolean {
  return !!(config.email && config.email.fromAddress && (config.email.resendApiKey || (config.email.smtp && config.email.smtp.user)));
}

function trySendInviteEmail(invite: InviteRow, group: { name: string }, inviter?: AuthUser) {
  if (!invite.email) return;
  const url = inviteUrl((invite as any).token);
  if (!emailConfigured()) {
    console.log(`[invite] no email transport configured; would have sent to ${invite.email}: ${url}`);
    return;
  }
  try {
    const transport = createTransport(config.email);
    sendGroupInvite(transport, {
      to: invite.email, groupName: group.name, role: invite.role, inviteUrl: url,
      inviterName: inviter?.name, fromName: config.email.fromName, fromAddress: config.email.fromAddress,
    }).catch((err) => console.warn('[invite email] send failed:', err.message));
  } catch (err) {
    console.warn('[invite email] transport error:', (err as Error).message);
  }
}

function trySendRemovalEmail(toEmail: string | undefined, groupName: string) {
  if (!toEmail) return;
  if (!emailConfigured()) {
    console.log(`[removal] no email transport configured; would have notified ${toEmail} of removal from "${groupName}"`);
    return;
  }
  try {
    const transport = createTransport(config.email);
    sendRemovalNotice(transport, { to: toEmail, groupName, fromName: config.email.fromName, fromAddress: config.email.fromAddress })
      .catch((err) => console.warn('[removal email] send failed:', err.message));
  } catch (err) {
    console.warn('[removal email] transport error:', (err as Error).message);
  }
}

function diffGroup(before: Row, after: Row) {
  const fields = ['name', 'ward', 'stake', 'leader_name', 'leader_phone', 'leader_email'];
  const out: Record<string, { from: unknown; to: unknown }> = {};
  for (const f of fields) {
    if ((before[f] ?? null) !== (after[f] ?? null)) out[f] = { from: before[f] ?? null, to: after[f] ?? null };
  }
  return out;
}

export function createGroupRoutes(db: DB) {
  const app = new Hono<AppEnv>();
  app.use('*', requireAuth);

  app.get('/', (c) => {
    const me = currentUser(c);
    const groups = db
      .query(
        `SELECT g.*, gm.role as member_role,
          (SELECT COUNT(*) FROM group_members WHERE group_id = g.id) as member_count
         FROM groups g JOIN group_members gm ON gm.group_id = g.id
         WHERE gm.user_id = ? ORDER BY g.type, g.name`
      )
      .all(me.id) as Row[];
    for (const group of groups) {
      if (group.parent_id) group.parent = db.query('SELECT id, name, type, stake FROM groups WHERE id = ?').get(group.parent_id);
      if (group.type === 'stake') group.subgroups = db.query('SELECT id, name, type, ward FROM groups WHERE parent_id = ?').all(group.id);
    }
    return c.json({ groups });
  });

  app.get('/:id', (c) => {
    const me = currentUser(c);
    const id = c.req.param('id');
    const membership = db.query('SELECT role FROM group_members WHERE group_id = ? AND user_id = ?').get(id, me.id);
    if (!membership && !isEffectiveGroupAdmin(db, id, me.id, me.role)) return c.json({ error: 'Not a member of this group' }, 403);

    const group = db.query('SELECT * FROM groups WHERE id = ?').get(id) as Row | null;
    if (!group) return c.json({ error: 'Group not found' }, 404);

    group.effective_admin = isEffectiveGroupAdmin(db, id, me.id, me.role);
    group.members = db
      .query(
        `SELECT gm.id as membership_id, gm.role, gm.joined_at, u.id as user_id, u.name, u.email
         FROM group_members gm JOIN users u ON u.id = gm.user_id
         WHERE gm.group_id = ? ORDER BY gm.role, u.name`
      )
      .all(id);
    group.subgroups = db.query('SELECT id, name, type, ward FROM groups WHERE parent_id = ?').all(id);
    if (group.parent_id) group.parent = db.query('SELECT id, name, type, stake FROM groups WHERE id = ?').get(group.parent_id);
    return c.json({ group });
  });

  app.post('/', async (c) => {
    const me = currentUser(c);
    const b = await c.req.json().catch(() => ({}));
    const { name, type, parent_id, ward, stake, leader_name, leader_phone, leader_email, send_leader_invite } = b;

    if (!name || !type) return c.json({ error: 'Name and type are required' }, 400);
    if (!['stake', 'ward', 'custom'].includes(type)) return c.json({ error: 'Invalid group type' }, 400);
    if (!parent_id && me.role !== 'super') return c.json({ error: 'Only administrators can create top-level groups' }, 403);
    if (parent_id) {
      const pm = db.query<{ role: string }, [string, string]>('SELECT role FROM group_members WHERE group_id = ? AND user_id = ?').get(parent_id, me.id);
      if ((!pm || pm.role !== 'admin') && me.role !== 'super') return c.json({ error: 'Must be a group admin to create subgroups' }, 403);
    }

    const id = crypto.randomUUID();
    const inviteCode = generateCode();
    db.query(
      `INSERT INTO groups (id, name, type, parent_id, ward, stake, leader_name, leader_phone, leader_email, invite_code)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(id, name, type, parent_id || null, ward || name, stake || null, leader_name || null, leader_phone || null, leader_email || null, inviteCode);
    db.query('INSERT INTO group_members (id, group_id, user_id, role) VALUES (?, ?, ?, ?)').run(crypto.randomUUID(), id, me.id, 'admin');
    db.query(`INSERT INTO group_invites (id, group_id, code, token, role, used_count, created_by) VALUES (?, ?, ?, ?, 'member', 0, ?)`)
      .run(crypto.randomUUID(), id, inviteCode, generateToken(), me.id);

    if (parent_id) {
      const parent = db.query('SELECT name, stake FROM groups WHERE id = ?').get(parent_id) as Row | null;
      if (parent && !stake) db.query('UPDATE groups SET stake = ? WHERE id = ?').run(parent.stake || parent.name, id);
    }

    if (send_leader_invite && leader_email) {
      const inviteId = crypto.randomUUID();
      db.query(`INSERT INTO group_invites (id, group_id, code, token, role, email, max_uses, used_count, created_by) VALUES (?, ?, NULL, ?, 'admin', ?, 1, 0, ?)`)
        .run(inviteId, id, generateToken(), leader_email, me.id);
      const invite = db.query('SELECT * FROM group_invites WHERE id = ?').get(inviteId) as InviteRow;
      const created = db.query('SELECT id, name FROM groups WHERE id = ?').get(id) as { id: string; name: string };
      trySendInviteEmail(invite, created, me);
      audit.record(db, { actorId: me.id, action: 'invite.created', targetType: 'invite', targetId: inviteId, groupId: id, meta: { role: 'admin', email: leader_email, source: 'leader_email' } });
    }

    audit.record(db, { actorId: me.id, action: 'group.create', targetType: 'group', targetId: id, groupId: id, meta: { name, type, parent_id: parent_id || null } });
    audit.record(db, { actorId: me.id, action: 'member.added', targetType: 'user', targetId: me.id, groupId: id, meta: { role: 'admin', source: 'group.create' } });

    const group = db.query('SELECT * FROM groups WHERE id = ?').get(id);
    return c.json({ group }, 201);
  });

  app.put('/:id', async (c) => {
    const me = currentUser(c);
    const id = c.req.param('id');
    const membership = db.query<{ role: string }, [string, string]>('SELECT role FROM group_members WHERE group_id = ? AND user_id = ?').get(id, me.id);
    if ((!membership || membership.role !== 'admin') && me.role !== 'super') return c.json({ error: 'Must be a group admin' }, 403);

    const group = db.query('SELECT * FROM groups WHERE id = ?').get(id) as Row | null;
    if (!group) return c.json({ error: 'Group not found' }, 404);

    const { name, ward, stake, leader_name, leader_phone, leader_email } = await c.req.json().catch(() => ({}));
    db.query(`UPDATE groups SET name = ?, ward = ?, stake = ?, leader_name = ?, leader_phone = ?, leader_email = ?, updated_at = datetime('now') WHERE id = ?`)
      .run(name || group.name, ward || group.ward, stake || group.stake, leader_name ?? group.leader_name, leader_phone ?? group.leader_phone, leader_email ?? group.leader_email, id);

    const updated = db.query('SELECT * FROM groups WHERE id = ?').get(id) as Row;
    audit.record(db, { actorId: me.id, action: 'group.update', targetType: 'group', targetId: id, groupId: id, meta: diffGroup(group, updated) });
    return c.json({ group: updated });
  });

  app.post('/join', async (c) => {
    const me = currentUser(c);
    const { invite_code } = await c.req.json().catch(() => ({}));
    if (!invite_code) return c.json({ error: 'Invite code is required' }, 400);
    const code = String(invite_code).toUpperCase();

    const invite = db.query('SELECT * FROM group_invites WHERE code = ?').get(code) as InviteRow | null;
    const usable = isInviteUsable(invite);
    if (!usable.ok) return c.json({ error: `Invite ${usable.reason}` }, usable.reason === 'not_found' ? 404 : 410);

    const group = db.query('SELECT * FROM groups WHERE id = ?').get(invite!.group_id) as Row | null;
    if (!group) return c.json({ error: 'Group not found' }, 404);
    const existing = db.query('SELECT id FROM group_members WHERE group_id = ? AND user_id = ?').get(group.id, me.id);
    if (existing) return c.json({ error: 'Already a member of this group' }, 409);

    addMembershipWithPropagation(db, group.id, me.id, invite!.role);
    db.query('UPDATE group_invites SET used_count = used_count + 1 WHERE id = ?').run(invite!.id);
    audit.record(db, { actorId: me.id, action: 'member.added', targetType: 'user', targetId: me.id, groupId: group.id, meta: { role: invite!.role, source: 'invite.code', invite_id: invite!.id } });
    audit.record(db, { actorId: me.id, action: 'invite.accepted', targetType: 'invite', targetId: invite!.id, groupId: group.id, meta: { via: 'code' } });
    return c.json({ group, message: `Joined ${group.name}` });
  });

  app.get('/:id/invites', (c) => {
    const me = currentUser(c);
    if (!isEffectiveGroupAdmin(db, c.req.param('id'), me.id, me.role)) return c.json({ error: 'Must be a group admin' }, 403);
    const invites = db
      .query(`SELECT id, group_id, code, token, role, email, max_uses, used_count, expires_at, revoked_at, accepted_at, created_at FROM group_invites WHERE group_id = ? ORDER BY created_at DESC`)
      .all(c.req.param('id'));
    return c.json({ invites });
  });

  app.post('/:id/invites', async (c) => {
    const me = currentUser(c);
    const id = c.req.param('id');
    if (!isEffectiveGroupAdmin(db, id, me.id, me.role)) return c.json({ error: 'Must be a group admin' }, 403);
    const group = db.query('SELECT id, name FROM groups WHERE id = ?').get(id) as { id: string; name: string } | null;
    if (!group) return c.json({ error: 'Group not found' }, 404);

    const { role, email, max_uses, expires_at } = await c.req.json().catch(() => ({}));
    const inviteRole = role === 'admin' ? 'admin' : 'member';
    const inviteId = crypto.randomUUID();
    const isEmailInvite = !!email;
    const code = isEmailInvite ? null : generateCode();
    const maxUses = isEmailInvite ? 1 : Number.isInteger(max_uses) && max_uses > 0 ? max_uses : null;
    const expires = expires_at ? new Date(expires_at).toISOString() : null;

    db.query(`INSERT INTO group_invites (id, group_id, code, token, role, email, max_uses, used_count, expires_at, created_by) VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?, ?)`)
      .run(inviteId, group.id, code, generateToken(), inviteRole, email || null, maxUses, expires, me.id);
    const invite = db.query('SELECT * FROM group_invites WHERE id = ?').get(inviteId) as InviteRow;
    trySendInviteEmail(invite, group, me);
    audit.record(db, { actorId: me.id, action: 'invite.created', targetType: 'invite', targetId: inviteId, groupId: group.id, meta: { role: inviteRole, email: email || null, max_uses: maxUses, expires_at: expires, has_code: !!code } });
    return c.json({ invite }, 201);
  });

  app.delete('/:id/invites/:inviteId', (c) => {
    const me = currentUser(c);
    if (!isEffectiveGroupAdmin(db, c.req.param('id'), me.id, me.role)) return c.json({ error: 'Must be a group admin' }, 403);
    const r = db.query(`UPDATE group_invites SET revoked_at = datetime('now') WHERE id = ? AND group_id = ? AND revoked_at IS NULL`).run(c.req.param('inviteId'), c.req.param('id'));
    if (r.changes === 0) return c.json({ error: 'Invite not found' }, 404);
    audit.record(db, { actorId: me.id, action: 'invite.revoked', targetType: 'invite', targetId: c.req.param('inviteId'), groupId: c.req.param('id') });
    return c.json({ message: 'Invite revoked' });
  });

  app.post('/:id/invite', async (c) => {
    const me = currentUser(c);
    const id = c.req.param('id');
    if (!isEffectiveGroupAdmin(db, id, me.id, me.role)) return c.json({ error: 'Must be a group admin to invite' }, 403);
    const { email, role } = await c.req.json().catch(() => ({}));
    if (!email) return c.json({ error: 'Email is required' }, 400);
    const inviteRole = role === 'admin' ? 'admin' : 'member';
    const group = db.query('SELECT id, name FROM groups WHERE id = ?').get(id) as { id: string; name: string } | null;
    if (!group) return c.json({ error: 'Group not found' }, 404);

    const existingUser = db.query('SELECT id FROM users WHERE email = ?').get(email) as { id: string } | null;
    if (existingUser) {
      const existingMember = db.query('SELECT id FROM group_members WHERE group_id = ? AND user_id = ?').get(group.id, existingUser.id);
      if (existingMember) return c.json({ error: 'User is already a member' }, 409);
    }

    const inviteId = crypto.randomUUID();
    db.query(`INSERT INTO group_invites (id, group_id, code, token, role, email, max_uses, used_count, created_by) VALUES (?, ?, NULL, ?, ?, ?, 1, 0, ?)`)
      .run(inviteId, group.id, generateToken(), inviteRole, email, me.id);
    const invite = db.query('SELECT * FROM group_invites WHERE id = ?').get(inviteId) as InviteRow;
    trySendInviteEmail(invite, group, me);
    audit.record(db, { actorId: me.id, action: 'invite.created', targetType: 'invite', targetId: inviteId, groupId: group.id, meta: { role: inviteRole, email, source: 'legacy_invite' } });
    return c.json({ message: `Invite sent to ${email}`, invite });
  });

  app.put('/:id/members/:userId/role', async (c) => {
    const me = currentUser(c);
    const id = c.req.param('id');
    if (!isEffectiveGroupAdmin(db, id, me.id, me.role)) return c.json({ error: 'Must be a group admin' }, 403);
    const { role } = await c.req.json().catch(() => ({}));
    if (!['admin', 'member'].includes(role)) return c.json({ error: 'Invalid role' }, 400);
    const target = db.query<{ role: string }, [string, string]>('SELECT role FROM group_members WHERE group_id = ? AND user_id = ?').get(id, c.req.param('userId'));
    if (!target) return c.json({ error: 'Member not found' }, 404);
    if (target.role === 'admin' && role === 'member' && countGroupAdmins(db, id) <= 1) return c.json({ error: 'Cannot demote the last admin of this group' }, 409);

    db.query('UPDATE group_members SET role = ? WHERE group_id = ? AND user_id = ?').run(role, id, c.req.param('userId'));
    audit.record(db, { actorId: me.id, action: 'member.role_changed', targetType: 'user', targetId: c.req.param('userId'), groupId: id, meta: { from: target.role, to: role } });
    return c.json({ message: 'Role updated' });
  });

  app.delete('/:id/members/:userId', (c) => {
    const me = currentUser(c);
    const id = c.req.param('id');
    const userId = c.req.param('userId');
    const isSelf = userId === me.id;
    if (!isSelf && !isEffectiveGroupAdmin(db, id, me.id, me.role)) return c.json({ error: 'Must be a group admin to remove members' }, 403);

    const target = db.query<{ role: string }, [string, string]>('SELECT role FROM group_members WHERE group_id = ? AND user_id = ?').get(id, userId);
    if (!target) return c.json({ error: 'Member not found' }, 404);
    if (target.role === 'admin' && countGroupAdmins(db, id) <= 1) return c.json({ error: 'Cannot remove the last admin of this group' }, 409);

    const removed = db.query('SELECT email FROM users WHERE id = ?').get(userId) as { email?: string } | null;
    const groupRow = db.query('SELECT name FROM groups WHERE id = ?').get(id) as { name: string } | null;
    db.query('DELETE FROM group_members WHERE group_id = ? AND user_id = ?').run(id, userId);
    if (!isSelf && removed?.email && groupRow) trySendRemovalEmail(removed.email, groupRow.name);
    audit.record(db, { actorId: me.id, action: 'member.removed', targetType: 'user', targetId: userId, groupId: id, meta: { self_leave: isSelf, role: target.role } });
    return c.json({ message: 'Member removed' });
  });

  app.post('/:id/regenerate-invite', (c) => {
    const me = currentUser(c);
    const id = c.req.param('id');
    if (!isEffectiveGroupAdmin(db, id, me.id, me.role)) return c.json({ error: 'Must be a group admin' }, 403);
    const newCode = generateCode();
    db.transaction(() => {
      db.query(`UPDATE group_invites SET revoked_at = datetime('now') WHERE group_id = ? AND code IS NOT NULL AND revoked_at IS NULL`).run(id);
      db.query(`INSERT INTO group_invites (id, group_id, code, token, role, used_count, created_by) VALUES (?, ?, ?, ?, 'member', 0, ?)`).run(crypto.randomUUID(), id, newCode, generateToken(), me.id);
    })();
    db.query('UPDATE groups SET invite_code = ? WHERE id = ?').run(newCode, id);
    audit.record(db, { actorId: me.id, action: 'invite.regenerated', targetType: 'group', targetId: id, groupId: id });
    return c.json({ invite_code: newCode });
  });

  app.get('/:id/audit', (c) => {
    const me = currentUser(c);
    const id = c.req.param('id');
    if (!isEffectiveGroupAdmin(db, id, me.id, me.role)) return c.json({ error: 'Must be a group admin' }, 403);
    const limit = Math.min(parseInt(c.req.query('limit') || '', 10) || 100, 500);
    const before = c.req.query('before') || undefined;
    const entries = audit.listForGroup(db, id, { limit, before });
    return c.json({ entries });
  });

  return app;
}

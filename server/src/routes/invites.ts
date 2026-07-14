import { Hono } from 'hono';
import type { DB } from '../db.ts';
import { type AppEnv, requireAuth, currentUser } from '../lib/auth.ts';
import { isInviteUsable, addMembershipWithPropagation, type InviteRow } from '../services/invites.ts';
import * as audit from '../services/audit.ts';

type Row = Record<string, any>;

export function createInviteRoutes(db: DB) {
  const app = new Hono<AppEnv>();

  // Preview an invite — PUBLIC so a recipient can see what they're accepting.
  app.get('/:token', (c) => {
    const invite = db.query('SELECT * FROM group_invites WHERE token = ?').get(c.req.param('token')) as InviteRow | null;
    const usable = isInviteUsable(invite);
    if (!usable.ok) return c.json({ error: `Invite ${usable.reason}` }, usable.reason === 'not_found' ? 404 : 410);
    const group = db.query('SELECT id, name, type, ward, stake FROM groups WHERE id = ?').get(invite!.group_id);
    return c.json({ invite: { role: invite!.role, email: invite!.email, expires_at: invite!.expires_at }, group });
  });

  // Accept an invite — requires auth.
  app.post('/:token/accept', requireAuth, (c) => {
    const me = currentUser(c);
    const invite = db.query('SELECT * FROM group_invites WHERE token = ?').get(c.req.param('token')) as (InviteRow & Row) | null;
    const usable = isInviteUsable(invite);
    if (!usable.ok) return c.json({ error: `Invite ${usable.reason}` }, usable.reason === 'not_found' ? 404 : 410);

    if (invite!.email && me.email && invite!.email.toLowerCase() !== me.email.toLowerCase()) {
      return c.json({ error: 'This invite was sent to a different email address' }, 403);
    }
    const group = db.query('SELECT * FROM groups WHERE id = ?').get(invite!.group_id) as Row | null;
    if (!group) return c.json({ error: 'Group not found' }, 404);

    const existing = db.query('SELECT id FROM group_members WHERE group_id = ? AND user_id = ?').get(group.id, me.id);
    if (existing) {
      db.query(`UPDATE group_invites SET accepted_at = datetime('now'), accepted_by = ? WHERE id = ?`).run(me.id, invite!.id);
      return c.json({ group, message: `Already a member of ${group.name}` }, 200);
    }

    db.transaction(() => {
      addMembershipWithPropagation(db, group.id, me.id, invite!.role);
      db.query('UPDATE group_invites SET used_count = used_count + 1 WHERE id = ?').run(invite!.id);
      if (invite!.max_uses === 1) {
        db.query(`UPDATE group_invites SET accepted_at = datetime('now'), accepted_by = ? WHERE id = ?`).run(me.id, invite!.id);
      }
    })();

    audit.record(db, { actorId: me.id, action: 'member.added', targetType: 'user', targetId: me.id, groupId: group.id, meta: { role: invite!.role, source: 'invite.token', invite_id: invite!.id } });
    audit.record(db, { actorId: me.id, action: 'invite.accepted', targetType: 'invite', targetId: invite!.id, groupId: group.id, meta: { via: 'token', email: invite!.email || null } });
    return c.json({ group, message: `Joined ${group.name}` });
  });

  return app;
}

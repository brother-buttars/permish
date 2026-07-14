import type { DB } from '../db.ts';
import { config } from '../config.ts';

// Group invite helpers — ported from backend/src/services/invites.js.

export interface InviteRow {
  id: string;
  group_id: string;
  role: 'admin' | 'member';
  email?: string | null;
  max_uses?: number | null;
  used_count: number;
  expires_at?: string | null;
  revoked_at?: string | null;
  accepted_at?: string | null;
}

export function generateCode(): string {
  return Buffer.from(crypto.getRandomValues(new Uint8Array(6))).toString('hex').toUpperCase();
}

export function generateToken(): string {
  return Buffer.from(crypto.getRandomValues(new Uint8Array(24))).toString('base64url');
}

export type InviteUsable = { ok: true } | { ok: false; reason: string };

export function isInviteUsable(invite: InviteRow | null | undefined, now = new Date()): InviteUsable {
  if (!invite) return { ok: false, reason: 'not_found' };
  if (invite.revoked_at) return { ok: false, reason: 'revoked' };
  if (invite.accepted_at) return { ok: false, reason: 'accepted' };
  if (invite.expires_at && new Date(invite.expires_at) < now) return { ok: false, reason: 'expired' };
  if (invite.max_uses != null && invite.used_count >= invite.max_uses) return { ok: false, reason: 'exhausted' };
  return { ok: true };
}

export function inviteUrl(token: string): string {
  const base = config.frontendUrl || 'http://localhost:3000';
  return `${base.replace(/\/$/, '')}/invite/${token}`;
}

/** Add user as member; propagate to parent group(s) as plain member. */
export function addMembershipWithPropagation(db: DB, groupId: string, userId: string, role: 'admin' | 'member'): void {
  const existing = db.query<{ id: string }, [string, string]>('SELECT id FROM group_members WHERE group_id = ? AND user_id = ?').get(groupId, userId);
  if (!existing) {
    db.query('INSERT INTO group_members (id, group_id, user_id, role) VALUES (?, ?, ?, ?)').run(crypto.randomUUID(), groupId, userId, role);
  } else if (role === 'admin') {
    db.query('UPDATE group_members SET role = ? WHERE id = ?').run(role, existing.id);
  }
  const visited = new Set<string>();
  let current = db.query<{ parent_id: string | null }, [string]>('SELECT parent_id FROM groups WHERE id = ?').get(groupId);
  while (current && current.parent_id && !visited.has(current.parent_id)) {
    visited.add(current.parent_id);
    const parentId = current.parent_id;
    const parentExisting = db.query<{ id: string }, [string, string]>('SELECT id FROM group_members WHERE group_id = ? AND user_id = ?').get(parentId, userId);
    if (!parentExisting) {
      db.query('INSERT INTO group_members (id, group_id, user_id, role) VALUES (?, ?, ?, ?)').run(crypto.randomUUID(), parentId, userId, 'member');
    }
    current = db.query<{ parent_id: string | null }, [string]>('SELECT parent_id FROM groups WHERE id = ?').get(parentId);
  }
}

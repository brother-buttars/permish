import type { DB } from '../db.ts';

// Hierarchical group-authority helpers — ported from backend/src/routes/groups.js.

/**
 * True if the user is admin of `groupId` OR admin of any ancestor group, OR has
 * the system-level `super` role (stake admins manage their child wards).
 */
export function isEffectiveGroupAdmin(db: DB, groupId: string, userId: string, userRole: string): boolean {
  if (userRole === 'super') return true;
  let currentId: string | null = groupId;
  const visited = new Set<string>();
  while (currentId && !visited.has(currentId)) {
    visited.add(currentId);
    const m = db.query<{ role: string }, [string, string]>('SELECT role FROM group_members WHERE group_id = ? AND user_id = ?').get(currentId, userId);
    if (m && m.role === 'admin') return true;
    const g = db.query<{ parent_id: string | null }, [string]>('SELECT parent_id FROM groups WHERE id = ?').get(currentId);
    currentId = g && g.parent_id ? g.parent_id : null;
  }
  return false;
}

export function countGroupAdmins(db: DB, groupId: string): number {
  const row = db.query<{ n: number }, [string]>("SELECT COUNT(*) as n FROM group_members WHERE group_id = ? AND role = 'admin'").get(groupId);
  return row ? row.n : 0;
}

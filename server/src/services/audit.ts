import type { DB } from '../db.ts';

// Centralized audit logger — ported from backend/src/services/audit.js.
// Writes never throw; auditing is best-effort and must not block the caller.

export interface AuditInput {
  actorId?: string | null;
  action: string;
  targetType?: string | null;
  targetId?: string | null;
  groupId?: string | null;
  meta?: unknown;
}

export function record(db: DB, { actorId, action, targetType, targetId, groupId, meta }: AuditInput): void {
  if (!db || !action) return;
  try {
    const metaJson = meta == null ? null : JSON.stringify(meta);
    db.query(
      `INSERT INTO audit_log (id, actor_id, action, target_type, target_id, group_id, meta)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).run(crypto.randomUUID(), actorId || null, action, targetType || null, targetId || null, groupId || null, metaJson);
  } catch (err) {
    console.warn('[audit] write failed:', (err as Error).message);
  }
}

export function collectGroupAndDescendantIds(db: DB, rootId: string): string[] {
  const out = [rootId];
  const queue = [rootId];
  while (queue.length > 0) {
    const id = queue.shift()!;
    const children = db.query<{ id: string }, [string]>('SELECT id FROM groups WHERE parent_id = ?').all(id);
    for (const c of children) {
      out.push(c.id);
      queue.push(c.id);
    }
  }
  return out;
}

export function listForGroup(db: DB, groupId: string, { limit = 100, before }: { limit?: number; before?: string } = {}) {
  const ids = collectGroupAndDescendantIds(db, groupId);
  if (ids.length === 0) return [];
  const placeholders = ids.map(() => '?').join(',');
  const params: (string | number)[] = [...ids];
  let cursor = '';
  if (before) {
    cursor = ' AND a.created_at < ?';
    params.push(before);
  }
  params.push(limit);
  const rows = db
    .query(
      `SELECT a.id, a.actor_id, a.action, a.target_type, a.target_id, a.group_id, a.meta, a.created_at,
              u.name AS actor_name, u.email AS actor_email
       FROM audit_log a
       LEFT JOIN users u ON u.id = a.actor_id
       WHERE a.group_id IN (${placeholders})${cursor}
       ORDER BY a.created_at DESC, a.id DESC
       LIMIT ?`
    )
    .all(...params) as Record<string, unknown>[];
  return rows.map((r) => ({ ...r, meta: r.meta ? safeJsonParse(r.meta as string) : null }));
}

function safeJsonParse(s: string): unknown {
  try {
    return JSON.parse(s);
  } catch {
    return null;
  }
}

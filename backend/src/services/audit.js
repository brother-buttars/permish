const crypto = require('crypto');

/**
 * Centralized audit logger. Writes never throw — auditing is best-effort and
 * must not block the calling mutation if something goes wrong.
 *
 * Action vocabulary (lowercase, dot-separated):
 *   group.create | group.update
 *   member.added | member.role_changed | member.removed
 *   invite.created | invite.revoked | invite.regenerated | invite.accepted
 *   user.role_changed | user.created | user.deleted
 */
function record(db, { actorId, action, targetType, targetId, groupId, meta }) {
  if (!db || !action) return;
  try {
    const id = crypto.randomUUID();
    const metaJson = meta == null ? null : JSON.stringify(meta);
    db.prepare(
      `INSERT INTO audit_log (id, actor_id, action, target_type, target_id, group_id, meta)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).run(id, actorId || null, action, targetType || null, targetId || null, groupId || null, metaJson);
  } catch (err) {
    console.warn('[audit] write failed:', err.message);
  }
}

/**
 * List audit entries for a group, including any entries on its descendants
 * (so a stake admin sees activity in their child wards). Returns most-recent first.
 */
function listForGroup(db, groupId, { limit = 100, before } = {}) {
  const ids = collectGroupAndDescendantIds(db, groupId);
  if (ids.length === 0) return [];
  const placeholders = ids.map(() => '?').join(',');
  const params = [...ids];
  let cursor = '';
  if (before) {
    cursor = ' AND a.created_at < ?';
    params.push(before);
  }
  params.push(limit);
  return db.prepare(
    `SELECT a.id, a.actor_id, a.action, a.target_type, a.target_id, a.group_id, a.meta, a.created_at,
            u.name AS actor_name, u.email AS actor_email
     FROM audit_log a
     LEFT JOIN users u ON u.id = a.actor_id
     WHERE a.group_id IN (${placeholders})${cursor}
     ORDER BY a.created_at DESC, a.id DESC
     LIMIT ?`
  ).all(...params).map((r) => ({
    ...r,
    meta: r.meta ? safeJsonParse(r.meta) : null,
  }));
}

function collectGroupAndDescendantIds(db, rootId) {
  const out = [rootId];
  const queue = [rootId];
  while (queue.length > 0) {
    const id = queue.shift();
    const children = db.prepare('SELECT id FROM groups WHERE parent_id = ?').all(id);
    for (const c of children) {
      out.push(c.id);
      queue.push(c.id);
    }
  }
  return out;
}

function safeJsonParse(s) {
  try { return JSON.parse(s); } catch { return null; }
}

module.exports = { record, listForGroup };

/// <reference path="../pb_data/types.d.ts" />

/**
 * Adds the audit_log collection. Writes are sidecar-only (no client-direct
 * write rule) since audit entries are server-side observations of mutations.
 * Reads are auth-only; the sidecar's group-scoped query handles fine-grained
 * filtering by group + descendants.
 */

function addFields(collection, fields) {
  for (const field of fields) {
    collection.fields.addMarshaledJSON(JSON.stringify(field));
  }
}

migrate((app) => {
  const usersCol = app.findCollectionByNameOrId('users');
  const groupsCol = app.findCollectionByNameOrId('groups');

  const audit = new Collection({ type: 'base', name: 'audit_log' });
  addFields(audit, [
    { type: 'relation', name: 'actor_id', collectionId: usersCol.id, cascadeDelete: false, maxSelect: 1 },
    { type: 'text', name: 'action', required: true, max: 64 },
    { type: 'text', name: 'target_type', max: 32 },
    { type: 'text', name: 'target_id', max: 64 },
    { type: 'relation', name: 'group_id', collectionId: groupsCol.id, cascadeDelete: true, maxSelect: 1 },
    { type: 'json', name: 'meta' },
  ]);
  audit.indexes = [
    'CREATE INDEX idx_audit_log_group ON audit_log (group_id, created)',
    'CREATE INDEX idx_audit_log_actor ON audit_log (actor_id)',
  ];
  audit.listRule = '@request.auth.id != ""';
  audit.viewRule = '@request.auth.id != ""';
  // Writes are sidecar-only (no client write rule).
  audit.createRule = null;
  audit.updateRule = null;
  audit.deleteRule = null;
  app.save(audit);
}, (app) => {
  try {
    const c = app.findCollectionByNameOrId('audit_log');
    app.delete(c);
  } catch {}
});

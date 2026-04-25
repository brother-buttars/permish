/// <reference path="../pb_data/types.d.ts" />

/**
 * Adds the groups, group_members, and group_invites collections.
 *
 * NOTE: Authority enforcement (e.g. "stake admin can manage child wards") cannot
 * be expressed in PocketBase filter rules because they don't support recursive
 * walks of the parent_id chain. The expectation is that mutating writes go
 * through the Node sidecar (or a future PB hook), which enforces hierarchical
 * authority server-side. The rules below allow authenticated users broad access;
 * harden once enforcement moves into the sidecar.
 */

function addFields(collection, fields) {
  for (const field of fields) {
    collection.fields.addMarshaledJSON(JSON.stringify(field));
  }
}

migrate((app) => {
  const usersCol = app.findCollectionByNameOrId('users');

  // groups
  const groups = new Collection({ type: 'base', name: 'groups' });
  addFields(groups, [
    { type: 'text', name: 'name', required: true, max: 200 },
    { type: 'select', name: 'type', required: true, maxSelect: 1, values: ['stake', 'ward', 'custom'] },
    { type: 'relation', name: 'parent_id', collectionId: '', cascadeDelete: false, maxSelect: 1 },
    { type: 'text', name: 'ward', max: 200 },
    { type: 'text', name: 'stake', max: 200 },
    { type: 'text', name: 'leader_name', max: 200 },
    { type: 'text', name: 'leader_phone', max: 20 },
    { type: 'email', name: 'leader_email' },
    { type: 'text', name: 'invite_code', max: 16 },
  ]);
  groups.listRule = '@request.auth.id != ""';
  groups.viewRule = '@request.auth.id != ""';
  groups.createRule = '@request.auth.role = "super"'; // top-level requires super; sidecar handles ward-under-stake
  groups.updateRule = '@request.auth.role = "super"';
  groups.deleteRule = '@request.auth.role = "super"';
  app.save(groups);

  // Self-reference parent_id now that the collection exists
  const groupsSaved = app.findCollectionByNameOrId('groups');
  groupsSaved.fields.addMarshaledJSON(JSON.stringify({
    type: 'relation', name: 'parent_id', collectionId: groupsSaved.id, cascadeDelete: false, maxSelect: 1,
  }));
  app.save(groupsSaved);

  // group_members
  const members = new Collection({ type: 'base', name: 'group_members' });
  addFields(members, [
    { type: 'relation', name: 'group_id', required: true, collectionId: groupsSaved.id, cascadeDelete: true, maxSelect: 1 },
    { type: 'relation', name: 'user_id', required: true, collectionId: usersCol.id, cascadeDelete: true, maxSelect: 1 },
    { type: 'select', name: 'role', required: true, maxSelect: 1, values: ['admin', 'member'] },
    { type: 'date', name: 'joined_at' },
  ]);
  members.listRule = '@request.auth.id != ""';
  members.viewRule = '@request.auth.id != ""';
  members.createRule = '@request.auth.id != ""'; // sidecar enforces hierarchical authority
  members.updateRule = '@request.auth.id != ""';
  members.deleteRule = '@request.auth.id != ""';
  app.save(members);

  // group_invites
  const invites = new Collection({ type: 'base', name: 'group_invites' });
  addFields(invites, [
    { type: 'relation', name: 'group_id', required: true, collectionId: groupsSaved.id, cascadeDelete: true, maxSelect: 1 },
    { type: 'text', name: 'code', max: 16 },
    { type: 'text', name: 'token', max: 64, required: true },
    { type: 'select', name: 'role', required: true, maxSelect: 1, values: ['admin', 'member'] },
    { type: 'email', name: 'email' },
    { type: 'number', name: 'max_uses' },
    { type: 'number', name: 'used_count' },
    { type: 'date', name: 'expires_at' },
    { type: 'relation', name: 'created_by', collectionId: usersCol.id, cascadeDelete: false, maxSelect: 1 },
    { type: 'date', name: 'revoked_at' },
    { type: 'date', name: 'accepted_at' },
    { type: 'relation', name: 'accepted_by', collectionId: usersCol.id, cascadeDelete: false, maxSelect: 1 },
  ]);
  invites.indexes = [
    'CREATE UNIQUE INDEX idx_group_invites_code ON group_invites (code) WHERE code != ""',
    'CREATE UNIQUE INDEX idx_group_invites_token ON group_invites (token)',
  ];
  invites.listRule = '@request.auth.id != ""';
  invites.viewRule = ''; // public preview; sidecar wraps with checks
  invites.createRule = '@request.auth.id != ""';
  invites.updateRule = '@request.auth.id != ""';
  invites.deleteRule = '@request.auth.id != ""';
  app.save(invites);
}, (app) => {
  // Down migration: drop in reverse dependency order
  for (const name of ['group_invites', 'group_members', 'groups']) {
    try {
      const c = app.findCollectionByNameOrId(name);
      app.delete(c);
    } catch {}
  }
});

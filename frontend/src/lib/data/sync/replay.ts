/**
 * Replays a single pending_changes row against the remote repository.
 * Shared by SyncManager (background sync) and migration (mode switches) so the
 * two cannot drift on which collections/operations they support.
 */

import type { DataRepository } from '../repository';

export interface ReplayableChange {
	collection: string;
	operation: string;
	record_id: string;
	payload: Record<string, unknown>;
}

/**
 * Throws on failure and on unknown collections/operations — a change that
 * cannot be replayed must NOT be marked synced, or it is silently lost.
 * Creates send the locally-minted id so the server keeps the same identity
 * (otherwise the next pull duplicates the record and queued updates 404).
 */
export async function replayPendingChange(
	remote: DataRepository,
	change: ReplayableChange
): Promise<void> {
	const { collection, operation, record_id: recordId, payload } = change;

	switch (collection) {
		case 'events':
			if (operation === 'create') await remote.events.create({ ...payload, id: recordId });
			else if (operation === 'update') await remote.events.update(recordId, payload);
			else if (operation === 'delete') await remote.events.deactivate(recordId);
			else if (operation === 'delete-permanent') await remote.events.remove(recordId);
			else if (operation === 'reassign') await remote.events.reassignOwner(recordId, payload.userId as string);
			else throw new Error(`Unknown events operation: ${operation}`);
			return;

		case 'child_profiles':
			if (operation === 'create') await remote.profiles.create({ ...payload, id: recordId });
			else if (operation === 'update') await remote.profiles.update(recordId, payload);
			else if (operation === 'delete') await remote.profiles.delete(recordId);
			else throw new Error(`Unknown child_profiles operation: ${operation}`);
			return;

		case 'submissions':
			if (operation === 'create') {
				await remote.submissions.submit(payload.event_id as string, { ...payload, id: recordId });
			} else if (operation === 'update') await remote.submissions.update(recordId, payload);
			else if (operation === 'delete') await remote.submissions.delete(recordId);
			else throw new Error(`Unknown submissions operation: ${operation}`);
			return;

		case 'users':
			if (operation === 'update') await remote.auth.updateProfile(payload);
			else throw new Error(`Unknown users operation: ${operation}`);
			return;

		case 'groups':
			if (operation === 'create') await remote.groups.create({ ...(payload as { name: string; type: string }), id: recordId });
			else if (operation === 'update') await remote.groups.update(recordId, payload);
			else throw new Error(`Unknown groups operation: ${operation}`);
			return;

		case 'group_members': {
			if (operation === 'create') {
				if (typeof payload.token === 'string') await remote.groups.acceptInvite(payload.token);
				else if (typeof payload.invite_code === 'string') await remote.groups.join(payload.invite_code);
				else throw new Error('group_members create is missing token/invite_code');
			} else if (operation === 'update') {
				await remote.groups.updateMemberRole(
					payload.group_id as string,
					payload.user_id as string,
					payload.role as 'admin' | 'member'
				);
			} else if (operation === 'delete') {
				// record_id is `${groupId}:${userId}` (UUIDs never contain ':')
				const [groupId, userId] = recordId.split(':');
				if (!groupId || !userId) throw new Error(`Malformed group_members record_id: ${recordId}`);
				await remote.groups.removeMember(groupId, userId);
			} else throw new Error(`Unknown group_members operation: ${operation}`);
			return;
		}

		case 'group_invites':
			if (operation === 'create') {
				const { group_id, ...body } = payload;
				await remote.groups.createInvite(group_id as string, body);
			} else if (operation === 'update' && payload.revoked_at) {
				await remote.groups.revokeInvite(payload.group_id as string, recordId);
			} else throw new Error(`Unknown group_invites operation: ${operation}`);
			return;

		default:
			throw new Error(`Unknown collection for sync: ${collection}`);
	}
}

import type { AuditEntry, GroupInvite } from '$lib/data/types';

export function formatAuditAction(entry: AuditEntry): string {
	const meta = (entry.meta || {}) as Record<string, any>;
	const actor = entry.actor_name || entry.actor_email || 'Unknown user';
	switch (entry.action) {
		case 'group.create':
			return `${actor} created the group`;
		case 'group.update':
			return `${actor} updated group details`;
		case 'member.added':
			return meta.source === 'group.create'
				? `${actor} created the group (joined as admin)`
				: `${actor} joined as ${meta.role || 'member'}${meta.source ? ` (via ${String(meta.source).replace('invite.', 'invite ')})` : ''}`;
		case 'member.role_changed':
			return `${actor} changed a member's role from ${meta.from} to ${meta.to}`;
		case 'member.removed':
			return meta.self_leave ? `${actor} left the group` : `${actor} removed a member`;
		case 'invite.created': {
			const role = meta.role || 'member';
			const target = meta.email ? `for ${meta.email}` : 'shareable code';
			return `${actor} created an ${role} invite (${target})`;
		}
		case 'invite.revoked':
			return `${actor} revoked an invite`;
		case 'invite.regenerated':
			return `${actor} regenerated the default invite code`;
		case 'invite.accepted':
			return `${actor} accepted an invite`;
		case 'user.role_changed':
			return `${actor} changed a user's role from ${meta.from} to ${meta.to}`;
		case 'user.created':
			return `${actor} created a user account (${meta.email})`;
		case 'user.deleted':
			return `${actor} deleted a user account`;
		default:
			return `${actor}: ${entry.action}`;
	}
}

export function inviteStatus(
	invite: GroupInvite,
): { label: string; tone: 'active' | 'used' | 'revoked' | 'expired' } {
	if (invite.revoked_at) return { label: 'Revoked', tone: 'revoked' };
	if (invite.accepted_at) return { label: 'Accepted', tone: 'used' };
	if (invite.expires_at && new Date(invite.expires_at) < new Date()) return { label: 'Expired', tone: 'expired' };
	if (invite.max_uses != null && invite.used_count >= invite.max_uses) return { label: 'Used up', tone: 'used' };
	return { label: 'Active', tone: 'active' };
}

export function expiresAtFromChoice(choice: '' | '24h' | '7d' | '30d'): string | undefined {
	if (!choice) return undefined;
	const now = Date.now();
	const ms = choice === '24h' ? 24 * 3600e3 : choice === '7d' ? 7 * 86400e3 : 30 * 86400e3;
	return new Date(now + ms).toISOString();
}

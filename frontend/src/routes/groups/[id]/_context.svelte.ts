import { getContext, setContext } from 'svelte';
import type { GroupDetail } from '$lib/data/types';

const KEY = Symbol('groupCtx');

export interface GroupContext {
	readonly groupId: string;
	readonly group: GroupDetail | null;
	readonly isAdmin: boolean;
	readonly authUserId: string | null;
	reload: () => Promise<void>;
}

export function setGroupContext(ctx: GroupContext): void {
	setContext(KEY, ctx);
}

export function getGroupContext(): GroupContext {
	const ctx = getContext<GroupContext | undefined>(KEY);
	if (!ctx) throw new Error('getGroupContext must be called inside /groups/[id]/+layout.svelte');
	return ctx;
}

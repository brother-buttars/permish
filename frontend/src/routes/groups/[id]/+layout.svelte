<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/stores';
	import { getRepository } from '$lib/data';
	import { useAuthRequired } from '$lib/components/composables';
	import { Button } from '$lib/components/ui/button';
	import { Badge } from '$lib/components/ui/badge';
	import LoadingState from '$lib/components/LoadingState.svelte';
	import { PageContainer, SegmentedTabs } from '$lib/components/molecules';
	import { toastError } from '$lib/stores/toast';
	import type { GroupDetail } from '$lib/data/types';
	import { setGroupContext } from './_context.svelte';

	let { data, children } = $props();

	let group: GroupDetail | null = $state(null);

	const repo = getRepository();

	async function loadGroup() {
		try {
			group = await repo.groups.getById(data.groupId);
		} catch (err: any) {
			toastError(err.message || 'Failed to load group');
			goto('/groups');
		}
	}

	const auth = useAuthRequired({
		onReady: async () => { await loadGroup(); },
	});

	const isAdmin = $derived(
		(group as GroupDetail | null)?.effective_admin === true ||
		(group as GroupDetail | null)?.member_role === 'admin'
	);

	setGroupContext({
		get groupId() { return data.groupId; },
		get group() { return group; },
		get isAdmin() { return isAdmin; },
		get authUserId() { return auth.user?.id ?? null; },
		reload: loadGroup,
	});

	const tabs = $derived.by(() => {
		const base = [
			{ value: `/groups/${data.groupId}`, label: 'Overview' },
			{ value: `/groups/${data.groupId}/members`, label: 'Members' },
		];
		if (isAdmin) {
			base.push({ value: `/groups/${data.groupId}/invites`, label: 'Invites' });
			base.push({ value: `/groups/${data.groupId}/activity`, label: 'History' });
		}
		return base;
	});

	const currentTab = $derived($page.url.pathname);
</script>

<svelte:head><title>{group?.name || 'Group'}</title></svelte:head>

<PageContainer>
	{#if !auth.ready || !group}
		<LoadingState />
	{:else}
		<div class="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
			<div>
				<div class="flex items-center gap-3">
					<h1 class="text-3xl font-bold">{group.name}</h1>
					<Badge variant="secondary" class="text-xs capitalize">{group.type}</Badge>
				</div>
				<p class="text-sm text-muted-foreground mt-1">
					{#if group.ward && group.stake}
						{group.ward} · {group.stake}
					{:else if group.ward}
						{group.ward}
					{:else if group.stake}
						{group.stake}
					{/if}
				</p>
			</div>
			<div class="flex gap-2">
				<Button variant="outline" onclick={() => goto('/groups')}>Back to Groups</Button>
			</div>
		</div>

		<SegmentedTabs
			class="mb-6"
			label="Group sections"
			value={currentTab}
			{tabs}
			onSelect={(path) => goto(path)}
		/>

		{@render children()}
	{/if}
</PageContainer>

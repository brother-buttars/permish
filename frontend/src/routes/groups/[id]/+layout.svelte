<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/stores';
	import { getRepository } from '$lib/data';
	import { useAuthRequired } from '$lib/components/composables';
	import { Button } from '$lib/components/ui/button';
	import { Badge } from '$lib/components/ui/badge';
	import LoadingState from '$lib/components/LoadingState.svelte';
	import { PageContainer } from '$lib/components/molecules';
	import { toastError } from '$lib/stores/toast';
	import { cn } from '$lib/utils';
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
			base.push({ value: `/groups/${data.groupId}/activity`, label: 'Activity' });
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

		<div class="mb-6 flex gap-1 overflow-x-auto rounded-lg border border-input bg-muted p-1">
			{#each tabs as tab (tab.value)}
				{@const active = currentTab === tab.value}
				<Button
					variant={active ? 'default' : 'outline'}
					size="sm"
					class={cn(
						'flex-1 whitespace-nowrap',
						!active &&
							'bg-transparent text-foreground/50 border-transparent shadow-none hover:bg-background hover:text-foreground hover:border-border hover:drop-shadow-sm'
					)}
					onclick={() => goto(tab.value)}
				>
					{tab.label}
				</Button>
			{/each}
		</div>

		{@render children()}
	{/if}
</PageContainer>

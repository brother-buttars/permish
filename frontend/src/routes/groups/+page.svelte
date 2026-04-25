<script lang="ts">
	import { goto } from '$app/navigation';
	import { getRepository } from '$lib/data';
	import { useAuthRequired } from '$lib/components/composables';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { Card, CardContent } from '$lib/components/ui/card';
	import { Badge } from '$lib/components/ui/badge';
	import { toastSuccess, toastError } from '$lib/stores/toast';
	import LoadingState from '$lib/components/LoadingState.svelte';
	import EmptyState from '$lib/components/EmptyState.svelte';
	import { PageHeader, PageContainer, ListCard } from '$lib/components/molecules';

	let groups: any[] = $state([]);
	let showJoinForm = $state(false);
	let inviteCode = $state('');
	let joining = $state(false);

	const repo = getRepository();
	const auth = useAuthRequired({
		onReady: async () => {
			await loadGroups();
		},
	});

	async function loadGroups() {
		try {
			groups = await repo.groups.list();
		} catch (err: any) {
			toastError(err.message || 'Failed to load groups');
		}
	}

	async function joinGroup() {
		if (!inviteCode.trim()) return;
		joining = true;
		try {
			const result = await repo.groups.join(inviteCode.trim());
			toastSuccess(result.message || `Joined ${result.group.name}`);
			inviteCode = '';
			showJoinForm = false;
			await loadGroups();
		} catch (err: any) {
			toastError(err.message || 'Failed to join group');
		} finally {
			joining = false;
		}
	}
</script>

<svelte:head><title>My Groups</title></svelte:head>

{#snippet groupsActions()}
	<Button variant="outline" onclick={() => showJoinForm = !showJoinForm}>
		{showJoinForm ? 'Cancel' : 'Join a Group'}
	</Button>
	{#if auth.user?.role === 'super'}
		<Button onclick={() => goto('/groups/create')}>Create Group</Button>
	{/if}
{/snippet}

<PageContainer>
	<PageHeader title="My Groups" actions={groupsActions} />

	{#if showJoinForm}
		<Card class="mb-6">
			<CardContent class="pt-6">
				<form onsubmit={(e) => { e.preventDefault(); joinGroup(); }} class="flex gap-2">
					<Input bind:value={inviteCode} placeholder="Enter invite code (e.g., A1B2C3D4)" class="flex-1 font-mono uppercase" />
					<Button type="submit" disabled={joining}>{joining ? 'Joining...' : 'Join'}</Button>
				</form>
			</CardContent>
		</Card>
	{/if}

	{#if !auth.ready}
		<LoadingState />
	{:else if groups.length === 0}
		{#if auth.user?.role === 'super'}
			<EmptyState
				message="No groups yet — start by creating your stake."
				description="You'll be able to add wards under it once it exists."
				actionLabel="Create Stake"
				onAction={() => goto('/groups/create')}
			/>
		{:else}
			<EmptyState
				message="You're not a member of any groups yet."
				description="Ask your ward or stake leader for an invite code."
			/>
		{/if}
	{:else}
		<div class="grid gap-4">
			{#each groups as group}
				<Card class="cursor-pointer transition-shadow hover:shadow-md" onclick={() => goto(`/groups/${group.id}`)}>
					<CardContent class="flex items-center justify-between py-4">
						<div>
							<div class="flex items-center gap-2">
								<span class="font-semibold">{group.name}</span>
								<Badge variant="secondary" class="text-xs capitalize">{group.type}</Badge>
								{#if group.member_role === 'admin'}
									<Badge class="text-xs">Admin</Badge>
								{/if}
							</div>
							<p class="text-sm text-muted-foreground mt-0.5">
								{#if group.ward && group.stake}
									{group.ward} · {group.stake}
								{:else if group.ward}
									{group.ward}
								{:else if group.stake}
									{group.stake}
								{/if}
								{#if group.member_count}
									· {group.member_count} member{group.member_count !== 1 ? 's' : ''}
								{/if}
							</p>
						</div>
						<svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5 text-muted-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M9 5l7 7-7 7"/></svg>
					</CardContent>
				</Card>
			{/each}
		</div>
	{/if}
</PageContainer>

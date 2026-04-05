<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { user, authLoading } from '$lib/stores/auth';
	import { getRepository } from '$lib/data';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { Card, CardContent } from '$lib/components/ui/card';
	import { Badge } from '$lib/components/ui/badge';
	import { toastSuccess, toastError } from '$lib/stores/toast';
	import LoadingState from '$lib/components/LoadingState.svelte';

	let groups: any[] = $state([]);
	let loading = $state(true);
	let currentUser: any = $state(null);
	let showJoinForm = $state(false);
	let inviteCode = $state('');
	let joining = $state(false);

	const repo = getRepository();

	onMount(() => {
		const unsubUser = user.subscribe(u => { currentUser = u; });
		const unsubLoading = authLoading.subscribe(async (isLoading) => {
			if (isLoading) return;
			if (!currentUser) { goto('/login'); return; }
			await loadGroups();
		});
		return () => { unsubUser(); unsubLoading(); };
	});

	async function loadGroups() {
		try {
			groups = await repo.groups.list();
		} catch (err: any) {
			toastError(err.message || 'Failed to load groups');
		} finally {
			loading = false;
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

<div class="container mx-auto max-w-4xl px-4 py-8">
	<div class="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
		<h1 class="text-3xl font-bold">My Groups</h1>
		<div class="flex gap-2">
			<Button variant="outline" onclick={() => showJoinForm = !showJoinForm}>
				{showJoinForm ? 'Cancel' : 'Join a Group'}
			</Button>
			{#if currentUser?.role === 'super'}
				<Button onclick={() => goto('/groups/create')}>Create Group</Button>
			{/if}
		</div>
	</div>

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

	{#if loading}
		<LoadingState />
	{:else if groups.length === 0}
		<Card>
			<CardContent class="py-8 text-center">
				<p class="text-muted-foreground">You're not a member of any groups yet.</p>
				<p class="text-sm text-muted-foreground mt-2">Ask your ward or stake leader for an invite code.</p>
			</CardContent>
		</Card>
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
</div>

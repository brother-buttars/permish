<script lang="ts">
	import { goto } from '$app/navigation';
	import { getRepository } from '$lib/data';
	import { useAuthRequired } from '$lib/components/composables';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import { Card, CardHeader, CardTitle, CardContent, CardFooter } from '$lib/components/ui/card';
	import { toastSuccess, toastError } from '$lib/stores/toast';
	import AlertBox from '$lib/components/AlertBox.svelte';
	import LoadingState from '$lib/components/LoadingState.svelte';
	import { PageContainer } from '$lib/components/molecules';
	import type { Group } from '$lib/data/types';

	let name = $state('');
	let type = $state<'stake' | 'ward' | 'custom'>('ward');
	let parentId = $state('');
	let ward = $state('');
	let stake = $state('');
	let leaderName = $state('');
	let leaderPhone = $state('');
	let leaderEmail = $state('');

	let submitting = $state(false);
	let errors: Record<string, string> = $state({});

	// User's groups that could be parents (stakes)
	let userGroups: Group[] = $state([]);
	let userGroupsLoaded = $state(false);
	let stakeGroups = $derived(userGroups.filter(g => g.type === 'stake' && g.member_role === 'admin'));
	let firstRun = $derived(userGroupsLoaded && userGroups.length === 0);
	let needsStakeFirst = $derived(userGroupsLoaded && type === 'ward' && stakeGroups.length === 0 && !firstRun);

	// Stake combobox state (for ward type)
	let stakeQuery = $state('');
	let stakeOpen = $state(false);
	let filteredStakes = $derived(
		stakeQuery.trim() === ''
			? stakeGroups
			: stakeGroups.filter((g) => g.name.toLowerCase().includes(stakeQuery.trim().toLowerCase()))
	);
	let exactStakeMatch = $derived(
		stakeGroups.find((g) => g.name.toLowerCase() === stakeQuery.trim().toLowerCase())
	);
	let canCreateNewStake = $derived(stakeQuery.trim().length > 0 && !exactStakeMatch);

	function selectStake(group: Group) {
		parentId = group.id;
		stake = group.name;
		stakeQuery = group.name;
		stakeOpen = false;
	}

	function onStakeQueryInput() {
		stake = stakeQuery.trim();
		if (parentId) {
			const picked = stakeGroups.find((g) => g.id === parentId);
			if (!picked || picked.name !== stakeQuery) parentId = '';
		}
		stakeOpen = true;
	}

	const repo = getRepository();
	const auth = useAuthRequired({
		allowedRoles: ['super'],
		onReady: async () => {
			try {
				userGroups = await repo.groups.list();
			} catch {
				// Non-critical
			} finally {
				userGroupsLoaded = true;
			}
		},
	});

	// First-run: lock the user into creating a stake first.
	$effect(() => {
		if (firstRun && type !== 'stake') {
			type = 'stake';
		}
	});

	function switchToStake() {
		type = 'stake';
		ward = '';
		parentId = '';
		stakeQuery = '';
		stake = '';
	}

	function deriveName(): string {
		if (type === 'ward') return ward.trim();
		if (type === 'stake') return stake.trim();
		return name.trim();
	}

	function validate(): boolean {
		const newErrors: Record<string, string> = {};
		if (type === 'custom' && !name.trim()) newErrors.name = 'Group name is required';
		if (type === 'ward' && !ward.trim()) newErrors.ward = 'Ward name is required';
		if (!stake.trim() && type !== 'custom') newErrors.stake = 'Stake name is required';
		errors = newErrors;
		return Object.keys(newErrors).length === 0;
	}

	async function handleSubmit() {
		if (!validate()) return;
		submitting = true;
		try {
			const group = await repo.groups.create({
				name: deriveName(),
				type,
				parent_id: parentId || undefined,
				ward: ward.trim() || undefined,
				stake: stake.trim() || undefined,
				leader_name: leaderName.trim() || undefined,
				leader_phone: leaderPhone.trim() || undefined,
				leader_email: leaderEmail.trim() || undefined,
			});
			toastSuccess(`Group "${group.name}" created`);
			goto(`/groups/${group.id}`);
		} catch (err: any) {
			errors = { form: err.message || 'Failed to create group' };
		} finally {
			submitting = false;
		}
	}
</script>

<svelte:head><title>Create Group</title></svelte:head>

<PageContainer size="md">
	<h1 class="mb-6 text-3xl font-bold">Create Group</h1>

	{#if !auth.ready || !userGroupsLoaded}
		<LoadingState />
	{:else}
		{#if errors.form}
			<AlertBox message={errors.form} class="mb-4" />
		{/if}

		<form onsubmit={(e) => { e.preventDefault(); handleSubmit(); }} class="space-y-6">
			<Card>
				<CardHeader>
					<CardTitle>Group Information</CardTitle>
				</CardHeader>
				<CardContent class="space-y-4">
					{#if firstRun}
						<div class="rounded-md border border-primary/20 bg-primary/5 p-3 text-sm">
							<p class="font-medium">Start with your stake.</p>
							<p class="text-muted-foreground">You'll add wards under it next. The Group Type is locked to "Stake" for your first group.</p>
						</div>
					{/if}

					<div class="space-y-2">
						<Label for="type">Group Type *</Label>
						<select
							id="type"
							bind:value={type}
							disabled={firstRun}
							class="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
						>
							<option value="ward">Ward</option>
							<option value="stake">Stake</option>
							<option value="custom">Custom</option>
						</select>
					</div>

					{#if needsStakeFirst}
						<div class="rounded-md border border-input bg-muted/40 p-4 text-sm">
							<p class="font-medium">Wards belong to a stake.</p>
							<p class="text-muted-foreground mt-1">
								You don't have any stakes yet. Create your stake first, then come back to add wards under it.
							</p>
							<Button type="button" class="mt-3" onclick={switchToStake}>Create Stake</Button>
						</div>
					{:else}
						{#if type === 'ward'}
							<div class="space-y-2">
								<Label for="ward">Ward Name *</Label>
								<Input id="ward" bind:value={ward} placeholder="e.g., Saratoga Hills 7th Ward" />
								{#if errors.ward}<p class="text-sm text-destructive">{errors.ward}</p>{/if}
							</div>

							<div class="space-y-2">
								<Label for="stake-combo">Stake *</Label>
								<div class="relative">
									<Input
										id="stake-combo"
										bind:value={stakeQuery}
										oninput={onStakeQueryInput}
										onfocus={() => (stakeOpen = true)}
										onblur={() => setTimeout(() => (stakeOpen = false), 150)}
										autocomplete="off"
										placeholder="Pick an existing stake or type a new one"
									/>
									{#if stakeOpen && (filteredStakes.length > 0 || canCreateNewStake)}
										<div class="absolute z-10 mt-1 w-full overflow-hidden rounded-md border border-input bg-popover shadow-md">
											{#each filteredStakes as g (g.id)}
												<button
													type="button"
													class="flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-accent hover:text-accent-foreground"
													onmousedown={() => selectStake(g)}
												>
													<span>{g.name}</span>
													{#if parentId === g.id}
														<span class="text-xs text-muted-foreground">Selected</span>
													{/if}
												</button>
											{/each}
											{#if canCreateNewStake}
												<button
													type="button"
													class="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-accent hover:text-accent-foreground border-t border-input"
													onmousedown={() => (stakeOpen = false)}
												>
													<span class="text-muted-foreground">Create new:</span>
													<span class="font-medium">"{stakeQuery.trim()}"</span>
												</button>
											{/if}
										</div>
									{/if}
								</div>
								{#if parentId}
									<p class="text-xs text-muted-foreground">Linked to existing stake — ward will be created under it.</p>
								{:else if stakeQuery.trim()}
									<p class="text-xs text-muted-foreground">No matching stake — a new stake reference will be created.</p>
								{/if}
								{#if errors.stake}<p class="text-sm text-destructive">{errors.stake}</p>{/if}
							</div>
						{/if}

						{#if type === 'stake'}
							<div class="space-y-2">
								<Label for="stake">Stake Name *</Label>
								<Input id="stake" bind:value={stake} placeholder="e.g., Saratoga Springs Utah Stake" />
								{#if errors.stake}<p class="text-sm text-destructive">{errors.stake}</p>{/if}
							</div>
						{/if}

						{#if type === 'custom'}
							<div class="space-y-2">
								<Label for="name">Group Name *</Label>
								<Input id="name" bind:value={name} placeholder="e.g., Stake YM Activity Committee" />
								{#if errors.name}<p class="text-sm text-destructive">{errors.name}</p>{/if}
							</div>
							<div class="space-y-2">
								<Label for="ward">Ward (optional)</Label>
								<Input id="ward" bind:value={ward} placeholder="Ward name" />
							</div>
						{/if}
					{/if}
				</CardContent>
			</Card>

			{#if !needsStakeFirst}
				<Card>
					<CardHeader>
						<CardTitle>Leader Information</CardTitle>
					</CardHeader>
					<CardContent class="space-y-4">
						<div class="space-y-2">
							<Label for="leaderName">Leader Name</Label>
							<Input id="leaderName" bind:value={leaderName} placeholder="Full name" />
						</div>
						<div class="grid gap-4 sm:grid-cols-2">
							<div class="space-y-2">
								<Label for="leaderPhone">Phone</Label>
								<Input id="leaderPhone" type="tel" bind:value={leaderPhone} placeholder="(555) 123-4567" />
							</div>
							<div class="space-y-2">
								<Label for="leaderEmail">Email</Label>
								<Input id="leaderEmail" type="email" bind:value={leaderEmail} placeholder="leader@example.com" />
							</div>
						</div>
					</CardContent>
				</Card>
			{/if}

			<div class="flex gap-3">
				<Button variant="outline" type="button" onclick={() => goto('/groups')}>Cancel</Button>
				<Button type="submit" class="flex-1" disabled={submitting || needsStakeFirst}>
					{submitting ? 'Creating...' : 'Create Group'}
				</Button>
			</div>
		</form>
	{/if}
</PageContainer>

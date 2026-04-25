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
	let stakeGroups = $derived(userGroups.filter(g => g.type === 'stake' && g.member_role === 'admin'));

	const repo = getRepository();
	const auth = useAuthRequired({
		allowedRoles: ['super'],
		onReady: async () => {
			try {
				userGroups = await repo.groups.list();
			} catch {
				// Non-critical
			}
		},
	});

	function validate(): boolean {
		const newErrors: Record<string, string> = {};
		if (!name.trim()) newErrors.name = 'Group name is required';
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
				name: name.trim(),
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

	{#if errors.form}
		<AlertBox message={errors.form} class="mb-4" />
	{/if}

	<form onsubmit={(e) => { e.preventDefault(); handleSubmit(); }} class="space-y-6">
		<Card>
			<CardHeader>
				<CardTitle>Group Information</CardTitle>
			</CardHeader>
			<CardContent class="space-y-4">
				<div class="space-y-2">
					<Label for="name">Group Name *</Label>
					<Input id="name" bind:value={name} placeholder="e.g., Mapleton 4th Ward YM/YW" />
					{#if errors.name}<p class="text-sm text-destructive">{errors.name}</p>{/if}
				</div>

				<div class="space-y-2">
					<Label for="type">Group Type *</Label>
					<select id="type" bind:value={type} class="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2">
						<option value="ward">Ward</option>
						<option value="stake">Stake</option>
						<option value="custom">Custom</option>
					</select>
				</div>

				{#if type === 'ward' && stakeGroups.length > 0}
					<div class="space-y-2">
						<Label for="parentId">Parent Stake (optional)</Label>
						<select id="parentId" bind:value={parentId} class="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2">
							<option value="">None</option>
							{#each stakeGroups as sg}
								<option value={sg.id}>{sg.name}</option>
							{/each}
						</select>
					</div>
				{/if}

				{#if type === 'ward' || type === 'custom'}
					<div class="space-y-2">
						<Label for="ward">Ward {type === 'ward' ? '*' : ''}</Label>
						<Input id="ward" bind:value={ward} placeholder="Ward name" />
						{#if errors.ward}<p class="text-sm text-destructive">{errors.ward}</p>{/if}
					</div>
				{/if}

				{#if type !== 'custom'}
					<div class="space-y-2">
						<Label for="stake">Stake *</Label>
						<Input id="stake" bind:value={stake} placeholder="Stake name" />
						{#if errors.stake}<p class="text-sm text-destructive">{errors.stake}</p>{/if}
					</div>
				{/if}
			</CardContent>
		</Card>

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

		<div class="flex gap-3">
			<Button variant="outline" type="button" onclick={() => goto('/groups')}>Cancel</Button>
			<Button type="submit" class="flex-1" disabled={submitting}>
				{submitting ? 'Creating...' : 'Create Group'}
			</Button>
		</div>
	</form>
</PageContainer>

<script lang="ts">
	import { getRepository } from "$lib/data";
	import { Card, CardContent } from "$lib/components/ui/card";
	import { Input } from "$lib/components/ui/input";
	import LoadingState from "$lib/components/LoadingState.svelte";
	import EmptyState from "$lib/components/EmptyState.svelte";
	import { toastError } from "$lib/stores/toast";
	import { adminFilter } from "$lib/stores/adminFilter";
	import { formatDate } from "$lib/utils/formatDate";
	import type { AdminProfile } from "$lib/data/types";

	let profiles: AdminProfile[] = $state([]);
	let loading = $state(true);
	let search = $state("");

	const repo = getRepository();

	async function load() {
		loading = true;
		try {
			profiles = await repo.admin.listProfiles({
				groupId: $adminFilter.groupId,
				activityId: $adminFilter.activityId,
			});
		} catch (err: any) {
			toastError(err.message || "Failed to load profiles");
		} finally {
			loading = false;
		}
	}

	$effect(() => {
		void $adminFilter.groupId;
		void $adminFilter.activityId;
		load();
	});

	const filtered = $derived.by(() => {
		if (!search) return profiles;
		const q = search.toLowerCase();
		return profiles.filter(p =>
			p.participant_name?.toLowerCase().includes(q) ||
			p.owner_name?.toLowerCase().includes(q) ||
			p.owner_email?.toLowerCase().includes(q) ||
			p.youth_program?.toLowerCase().includes(q),
		);
	});
</script>

<div class="mb-4 flex items-center justify-between">
	<h2 class="text-xl font-semibold">Profiles</h2>
</div>

<Card class="mb-4">
	<CardContent class="pt-6">
		<Input bind:value={search} placeholder="Search by participant name, owner, or program..." />
	</CardContent>
</Card>

{#if loading}
	<LoadingState />
{:else if filtered.length === 0}
	<EmptyState message="No profiles in this scope." />
{:else}
	<div class="space-y-3">
		{#each filtered as p (p.id)}
			<Card>
				<CardContent class="py-4">
					<div class="flex items-start justify-between gap-3">
						<div class="min-w-0 flex-1">
							<p class="font-medium truncate">{p.participant_name}</p>
							<p class="text-sm text-muted-foreground mt-0.5 truncate">
								{p.owner_name} ({p.owner_email})
							</p>
							{#if p.youth_program}
								<p class="text-xs text-muted-foreground mt-0.5 truncate">{p.youth_program}</p>
							{/if}
						</div>
						<span class="shrink-0 text-xs text-muted-foreground">{formatDate(p.updated_at)}</span>
					</div>
				</CardContent>
			</Card>
		{/each}
	</div>
	<p class="mt-2 text-xs text-muted-foreground">{filtered.length} profile{filtered.length === 1 ? '' : 's'}</p>
{/if}

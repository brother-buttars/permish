<script lang="ts">
	import { goto } from "$app/navigation";
	import { getRepository } from "$lib/data";
	import { Card, CardContent } from "$lib/components/ui/card";
	import { Badge } from "$lib/components/ui/badge";
	import { Input } from "$lib/components/ui/input";
	import LoadingState from "$lib/components/LoadingState.svelte";
	import EmptyState from "$lib/components/EmptyState.svelte";
	import { toastError } from "$lib/stores/toast";
	import { adminFilter } from "$lib/stores/adminFilter";
	import type { AdminActivity } from "$lib/data/types";

	let activities: AdminActivity[] = $state([]);
	let loading = $state(true);
	let search = $state("");

	const repo = getRepository();

	async function load() {
		loading = true;
		try {
			activities = await repo.admin.listActivities({
				groupId: $adminFilter.groupId,
				activityId: $adminFilter.activityId,
			});
		} catch (err: any) {
			toastError(err.message || "Failed to load activities");
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
		if (!search) return activities;
		const q = search.toLowerCase();
		return activities.filter(a =>
			a.event_name?.toLowerCase().includes(q) ||
			a.ward?.toLowerCase().includes(q) ||
			a.stake?.toLowerCase().includes(q) ||
			a.group_name?.toLowerCase().includes(q),
		);
	});
</script>

<div class="mb-4 flex items-center justify-between">
	<h2 class="text-xl font-semibold">Activities</h2>
</div>

<Card class="mb-4">
	<CardContent class="pt-6">
		<Input bind:value={search} placeholder="Search by name, ward, or stake..." />
	</CardContent>
</Card>

{#if loading}
	<LoadingState />
{:else if filtered.length === 0}
	<EmptyState message="No activities in this scope." />
{:else}
	<div class="space-y-3">
		{#each filtered as a (a.id)}
			<Card class="cursor-pointer transition hover:drop-shadow-md" onclick={() => goto(`/event/${a.id}`)}>
				<CardContent class="py-4">
					<div class="flex items-start justify-between gap-3">
						<div class="min-w-0 flex-1">
							<div class="flex items-center gap-2">
								<p class="font-medium truncate">{a.event_name}</p>
								<Badge variant={a.is_active ? "active" : "inactive"} class="text-xs">
									{a.is_active ? "Active" : "Inactive"}
								</Badge>
							</div>
							<p class="text-sm text-muted-foreground mt-0.5">
								{a.event_dates}
								{#if a.group_name} · {a.group_name}{/if}
							</p>
						</div>
						<span class="shrink-0 text-sm text-muted-foreground">
							{a.submission_count} submission{a.submission_count === 1 ? '' : 's'}
						</span>
					</div>
				</CardContent>
			</Card>
		{/each}
	</div>
	<p class="mt-2 text-xs text-muted-foreground">{filtered.length} activit{filtered.length === 1 ? 'y' : 'ies'}</p>
{/if}

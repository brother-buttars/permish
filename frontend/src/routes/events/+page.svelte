<script lang="ts">
	import { onMount } from "svelte";
	import { goto } from "$app/navigation";
	import { user, authLoading } from "$lib/stores/auth";
	import { getRepository } from '$lib/data';
	import { Button } from "$lib/components/ui/button";
	import { Input } from "$lib/components/ui/input";
	import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "$lib/components/ui/card";
	import { Separator } from "$lib/components/ui/separator";
	import { formatDate } from "$lib/utils/formatDate";
	import { orgGroups, getOrgDisplayLabels, matchesOrgFilter, orgBadgeClass, isYMLabel } from "$lib/utils/organizations";
	import { parseOrgs, isPastEvent } from "$lib/utils/events";
	import LoadingState from "$lib/components/LoadingState.svelte";
	import { Badge } from "$lib/components/ui/badge";

	let events: any[] = $state([]);
	let loading = $state(true);
	let currentUser: any = $state(null);

	// Filters
	let search = $state("");
	let statusFilter = $state<"active" | "inactive" | "past" | "all">("active");
	let orgFilter: string[] = $state([]);

	const unsub = user.subscribe(u => { currentUser = u; });

	onMount(() => {
		const unsubLoading = authLoading.subscribe(async (isLoading) => {
			if (isLoading) return;
			if (!currentUser || (currentUser.role !== 'planner' && currentUser.role !== 'super')) {
				goto('/login');
				return;
			}
			try {
				const repo = getRepository();
				events = await repo.events.list({ all: true });
			} catch {}
			finally { loading = false; }
		});
		return () => { unsubLoading(); unsub(); };
	});

	let filteredEvents = $derived.by(() => {
		return events.filter(event => {
			// Status filter
			if (statusFilter === 'past' && !isPastEvent(event)) return false;
			if (statusFilter === 'active' && (!event.is_active || isPastEvent(event))) return false;
			if (statusFilter === 'inactive' && event.is_active) return false;

			// Search filter
			if (search && !event.event_name.toLowerCase().includes(search.toLowerCase())) return false;

			// Org filter
			const eventOrgs = parseOrgs(event);
			if (!matchesOrgFilter(eventOrgs, orgFilter)) return false;

			return true;
		});
	});

	function toggleOrgFilter(key: string) {
		if (orgFilter.includes(key)) {
			orgFilter = orgFilter.filter(o => o !== key);
		} else {
			orgFilter = [...orgFilter, key];
		}
	}

</script>

<!-- Template -->
<svelte:head><title>Activities</title></svelte:head>

<div class="container mx-auto max-w-4xl px-4 py-8">
	<div class="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
		<h1 class="text-3xl font-bold">Activities</h1>
		<Button onclick={() => goto('/create')}>Create New Activity</Button>
	</div>

	<!-- Filters -->
	<Card class="mb-6">
		<CardContent class="space-y-4 pt-6">
			<!-- Search -->
			<Input type="text" placeholder="Search activities..." bind:value={search} />

			<!-- Status tabs -->
			<div class="flex gap-1 rounded-lg border border-input bg-muted p-1">
				{#each [['all', 'All'], ['active', 'Active'], ['inactive', 'Inactive'], ['past', 'Past']] as [val, label]}
					<Button
						variant={statusFilter === val ? "default" : "outline"}
						size="sm"
						class="flex-1 {statusFilter !== val ? 'bg-transparent text-foreground/50 border-transparent shadow-none hover:bg-background hover:text-foreground hover:border-border hover:shadow-sm' : ''}"
						onclick={() => statusFilter = val as any}
					>
						{label}
					</Button>
				{/each}
			</div>

			<!-- Organization filter -->
			<div>
				<p class="mb-2 text-sm font-medium">Filter by Organization</p>
				<div class="flex flex-wrap gap-2">
					{#each orgGroups as group}
						<Button
							variant={orgFilter.includes(group.key) ? "default" : "outline"}
							size="sm"
							class="rounded-full text-xs h-7 {orgFilter.includes(group.key) ? (group.key === 'young_men' ? 'bg-blue-500 hover:bg-blue-400 text-white' : 'bg-pink-500 hover:bg-pink-400 text-white') : 'text-muted-foreground'}"
							onclick={() => toggleOrgFilter(group.key)}
						>
							{group.label}
						</Button>
						{#each group.children as child}
							<Button
								variant={orgFilter.includes(child.key) ? "default" : "outline"}
								size="sm"
								class="rounded-full text-xs h-7 {orgFilter.includes(child.key) ? (isYMLabel(child.label) ? 'bg-blue-500 hover:bg-blue-400 text-white' : 'bg-pink-500 hover:bg-pink-400 text-white') : 'text-muted-foreground'}"
								onclick={() => toggleOrgFilter(child.key)}
							>
								{child.label}
							</Button>
						{/each}
					{/each}
				</div>
			</div>
		</CardContent>
	</Card>

	<!-- Results -->
	{#if loading}
		<LoadingState />
	{:else if filteredEvents.length === 0}
		<Card>
			<CardContent class="py-12 text-center">
				<p class="text-muted-foreground">No activities match your filters.</p>
			</CardContent>
		</Card>
	{:else}
		<p class="mb-3 text-sm text-muted-foreground">{filteredEvents.length} {filteredEvents.length === 1 ? 'activity' : 'activities'}</p>
		<div class="grid gap-4">
			{#each filteredEvents as event}
				<Card class="cursor-pointer transition-shadow hover:shadow-md" onclick={() => goto(`/event/${event.id}`)}>
					<CardHeader>
						<div class="flex items-start justify-between">
							<div>
								<CardTitle>{event.event_name}</CardTitle>
								<CardDescription>{event.event_dates}</CardDescription>
							</div>
							<span class="flex gap-1 text-sm">
								{#if event.is_active}
									<Badge variant="active">Active</Badge>
								{:else}
									<Badge variant="inactive">Inactive</Badge>
								{/if}
								{#if isPastEvent(event)}
									<Badge variant="past">Past</Badge>
								{/if}
							</span>
						</div>
					</CardHeader>
					<CardContent>
						<div class="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
							<div class="flex flex-wrap gap-1">
								{#each getOrgDisplayLabels(parseOrgs(event)) as label}
									<span class="rounded-full border px-2 py-0.5 text-xs font-medium {orgBadgeClass(label)}">{label}</span>
								{/each}
								{#if parseOrgs(event).length === 0}
									<span class="text-xs text-muted-foreground">No organizations</span>
								{/if}
							</div>
							<span class="text-sm text-muted-foreground">
								{event.submission_count ?? 0} submission{(event.submission_count ?? 0) === 1 ? '' : 's'}
							</span>
						</div>
					</CardContent>
				</Card>
			{/each}
		</div>
	{/if}
</div>

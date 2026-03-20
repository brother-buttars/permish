<script lang="ts">
	import { onMount } from "svelte";
	import { goto } from "$app/navigation";
	import { user, authLoading } from "$lib/stores/auth";
	import { api } from "$lib/api";
	import { Button } from "$lib/components/ui/button";
	import { Input } from "$lib/components/ui/input";
	import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "$lib/components/ui/card";
	import { Separator } from "$lib/components/ui/separator";
	import { formatDate } from "$lib/utils/formatDate";
	import { orgGroups, getOrgDisplayLabels, matchesOrgFilter } from "$lib/utils/organizations";

	let events: any[] = $state([]);
	let loading = $state(true);
	let currentUser: any = $state(null);

	// Filters
	let search = $state("");
	let statusFilter = $state<"active" | "inactive" | "all">("all");
	let orgFilter: string[] = $state([]);

	const unsub = user.subscribe(u => { currentUser = u; });

	onMount(() => {
		const unsubLoading = authLoading.subscribe(async (isLoading) => {
			if (isLoading) return;
			if (!currentUser || currentUser.role !== 'planner') {
				goto('/login');
				return;
			}
			try {
				const data = await api.listEvents({ all: true });
				events = data.events || [];
			} catch {}
			finally { loading = false; }
		});
		return () => { unsubLoading(); unsub(); };
	});

	// Parse organizations from JSON string
	function parseOrgs(event: any): string[] {
		if (!event.organizations) return [];
		if (typeof event.organizations === 'string') {
			try { return JSON.parse(event.organizations); } catch { return []; }
		}
		return event.organizations;
	}

	let filteredEvents = $derived.by(() => {
		return events.filter(event => {
			// Status filter
			if (statusFilter === 'active' && !event.is_active) return false;
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

	function getOrgBadgeColor(label: string): string {
		// Young Men family = blue, Young Women family = purple
		const ymLabels = ['Young Men', 'Deacons', 'Teachers', 'Priests'];
		const ywLabels = ['Young Women', 'Beehives', 'Mia Maids', 'Laurels'];
		if (ymLabels.includes(label)) return 'bg-blue-100 text-blue-800';
		if (ywLabels.includes(label)) return 'bg-purple-100 text-purple-800';
		return 'bg-gray-100 text-gray-800';
	}
</script>

<!-- Template -->
<svelte:head><title>Events</title></svelte:head>

<div class="container mx-auto max-w-4xl px-4 py-8">
	<div class="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
		<h1 class="text-3xl font-bold">Events</h1>
		<Button onclick={() => goto('/create')}>Create New Event</Button>
	</div>

	<!-- Filters -->
	<Card class="mb-6">
		<CardContent class="space-y-4 pt-6">
			<!-- Search -->
			<Input type="text" placeholder="Search events..." bind:value={search} />

			<!-- Status tabs -->
			<div class="flex gap-1 rounded-md border border-input p-1">
				{#each [['all', 'All'], ['active', 'Active'], ['inactive', 'Inactive']] as [val, label]}
					<button
						type="button"
						class="flex-1 rounded-sm px-3 py-1.5 text-sm font-medium transition-colors {statusFilter === val ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'}"
						onclick={() => statusFilter = val as any}
					>
						{label}
					</button>
				{/each}
			</div>

			<!-- Organization filter -->
			<div>
				<p class="mb-2 text-sm font-medium">Filter by Organization</p>
				<div class="flex flex-wrap gap-2">
					{#each orgGroups as group}
						<button
							type="button"
							class="rounded-full px-3 py-1 text-xs font-medium transition-colors {orgFilter.includes(group.key) ? getOrgBadgeColor(group.label) + ' ring-2 ring-offset-1 ring-current' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}"
							onclick={() => toggleOrgFilter(group.key)}
						>
							{group.label}
						</button>
						{#each group.children as child}
							<button
								type="button"
								class="rounded-full px-3 py-1 text-xs font-medium transition-colors {orgFilter.includes(child.key) ? getOrgBadgeColor(child.label) + ' ring-2 ring-offset-1 ring-current' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}"
								onclick={() => toggleOrgFilter(child.key)}
							>
								{child.label}
							</button>
						{/each}
					{/each}
				</div>
			</div>
		</CardContent>
	</Card>

	<!-- Results -->
	{#if loading}
		<p class="text-center text-muted-foreground">Loading...</p>
	{:else if filteredEvents.length === 0}
		<Card>
			<CardContent class="py-12 text-center">
				<p class="text-muted-foreground">No events match your filters.</p>
			</CardContent>
		</Card>
	{:else}
		<p class="mb-3 text-sm text-muted-foreground">{filteredEvents.length} event{filteredEvents.length === 1 ? '' : 's'}</p>
		<div class="grid gap-4">
			{#each filteredEvents as event}
				<Card class="cursor-pointer transition-shadow hover:shadow-md" onclick={() => goto(`/event/${event.id}`)}>
					<CardHeader>
						<div class="flex items-start justify-between">
							<div>
								<CardTitle>{event.event_name}</CardTitle>
								<CardDescription>{event.event_dates}</CardDescription>
							</div>
							<span class="text-sm">
								{#if event.is_active}
									<span class="rounded-full bg-green-100 px-2 py-1 text-xs font-medium text-green-800">Active</span>
								{:else}
									<span class="rounded-full bg-gray-100 px-2 py-1 text-xs font-medium text-gray-600">Inactive</span>
								{/if}
							</span>
						</div>
					</CardHeader>
					<CardContent>
						<div class="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
							<div class="flex flex-wrap gap-1">
								{#each getOrgDisplayLabels(parseOrgs(event)) as label}
									<span class="rounded-full px-2 py-0.5 text-xs font-medium {getOrgBadgeColor(label)}">{label}</span>
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

<script lang="ts">
	import { goto } from "$app/navigation";
	import { getRepository } from '$lib/data';
	import { user } from "$lib/stores/auth";
	import { adminFilter } from "$lib/stores/adminFilter";
	import { Button } from "$lib/components/ui/button";
	import { orgGroups, getOrgDisplayLabels, matchesOrgFilter, isYMLabel } from "$lib/utils/organizations";
	import { parseOrgs, isPastEvent } from "$lib/utils/events";
	import LoadingState from "$lib/components/LoadingState.svelte";
	import EmptyState from "$lib/components/EmptyState.svelte";
	import { PageHeader, PageContainer, SegmentedTabs, FilterPanel, ListCard, EventStatusBadges, AdminFilterBar } from "$lib/components/molecules";
	import { OrgBadge } from "$lib/components/atoms";
	import { useAuthRequired } from "$lib/components/composables";

	let events: any[] = $state([]);

	// Filters
	let search = $state("");
	let statusFilter = $state<"active" | "inactive" | "past" | "all">("active");
	let orgFilter: string[] = $state([]);

	// Super users get a group/activity scope filter here (the admin Activities tab
	// folded into this single page). Everyone else sees the activities they own.
	const isSuper = $derived($user?.role === "super");

	const auth = useAuthRequired({ onReady: () => load() });

	async function load() {
		const repo = getRepository();
		if ($user?.role === "super") {
			events = await repo.admin.listActivities({
				groupId: $adminFilter.groupId,
				activityId: $adminFilter.activityId,
			});
		} else {
			events = await repo.events.list({ all: true });
		}
	}

	// Reload when a super user changes the group/activity scope.
	$effect(() => {
		void $adminFilter.groupId;
		void $adminFilter.activityId;
		if (auth.ready && isSuper) load();
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

{#snippet headerActions()}
	<Button onclick={() => goto('/create')}>Create New Activity</Button>
{/snippet}

<PageContainer>
	<PageHeader title="Activities" actions={headerActions} />

	{#if isSuper}
		<AdminFilterBar />
	{/if}

	<FilterPanel bind:search searchPlaceholder="Search activities...">
		<SegmentedTabs
			bind:value={statusFilter}
			tabs={[
				{ value: 'all', label: 'All' },
				{ value: 'active', label: 'Active' },
				{ value: 'inactive', label: 'Inactive' },
				{ value: 'past', label: 'Past' },
			]}
		/>

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
	</FilterPanel>

	<!-- Results -->
	{#if !auth.ready}
		<LoadingState />
	{:else if auth.error}
		<EmptyState message="Something went wrong loading activities." description={auth.error} actionLabel="Retry" onAction={auth.retry} />
	{:else if filteredEvents.length === 0}
		<EmptyState message="No activities match your filters." />
	{:else}
		<p class="mb-3 text-sm text-muted-foreground">{filteredEvents.length} {filteredEvents.length === 1 ? 'activity' : 'activities'}</p>
		<div class="grid gap-4">
			{#each filteredEvents as event}
				{#snippet eventTrailing()}
					<EventStatusBadges {event} />
				{/snippet}
				{#snippet eventFooter()}
					<div class="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
						<div class="flex flex-wrap gap-1">
							{#each getOrgDisplayLabels(parseOrgs(event)) as label}
								<OrgBadge {label} />
							{/each}
							{#if parseOrgs(event).length === 0}
								<span class="text-xs text-muted-foreground">No organizations</span>
							{/if}
						</div>
						<span class="text-sm text-muted-foreground">
							{event.submission_count ?? 0} submission{(event.submission_count ?? 0) === 1 ? '' : 's'}
						</span>
					</div>
				{/snippet}
				<ListCard
					title={event.event_name}
					description={event.event_dates}
					onclick={() => goto(`/event/${event.id}`)}
					trailing={eventTrailing}
					footer={eventFooter}
				/>
			{/each}
		</div>
	{/if}
</PageContainer>
